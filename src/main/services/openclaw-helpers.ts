/**
 * OpenClaw 客户端工厂与外发消息分发工具
 *
 * 职责：
 * 1. 从 ConnectionProfile 构造带审计回调的 OpenClawClient
 * 2. 管理 OpenClaw 客户端连接池（含去重与自动重连）
 * 3. 外发消息分发（含去重、allowlist 校验、失败重试分类）
 *
 * 依赖：
 * - api-shared: prisma / fastify / openClawClients / 工具函数
 * - keychain: 凭证读取
 * - openclaw-client: OpenClawClient 实现
 * - audit-log-writer: 审计日志写入
 */

import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { KeychainService } from './keychain'
import { OpenClawClient } from './openclaw-client'
import { writeAuditLog } from './audit-log-writer'
import {
  prisma,
  fastify,
  openClawClients,
  openClawConnectionAttempts,
  TEST_WORKSPACE_ID,
  maskTarget,
  classifySendError,
  computeNextRetryAt,
  emitApiEvent
} from './api-shared'

/**
 * 从 profileId 构造带审计回调的 OpenClawClient
 */
async function createOpenClawClientByProfileId(profileId: string): Promise<OpenClawClient> {
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new Error('连接档案不存在')
  }

  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)

  // 为直接 new OpenClawClient 的地方注入审计回调
  // workspaceId 使用 TEST_WORKSPACE_ID 作为 fallback（该函数无传入 workspaceId 上下文）
  const audit = async (input: { action: string; request: unknown; response: unknown; error?: string }) => {
    await writeAuditLog({
      traceId: uuidv4(),
      actor: 'system',
      action: `OPENCLAW_${input.action}`,
      tool: 'openclaw-client',
      workspaceId: TEST_WORKSPACE_ID,
      request: input.request,
      response: input.error ? { success: false, error: input.error } : input.response
    })
  }

  return new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined,
    eventPath: profile.eventPath || undefined,
    audit
  })
}

/**
 * 从 ConnectionProfile 记录构造带审计回调的 OpenClawClient
 * 供临时性创建客户端的端点使用（ping/connect/config 获取等）
 *
 * @param profile ConnectionProfile 数据库记录
 * @param workspaceId 可选工作区 ID（用于审计上下文），缺省回退到 TEST_WORKSPACE_ID
 */
async function createOpenClawClientFromProfile(
  profile: { name: string; baseUrl: string; wsUrl: string; authMode: string; eventPath: string | null },
  workspaceId?: string
): Promise<OpenClawClient> {
  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)

  const audit = async (input: { action: string; request: unknown; response: unknown; error?: string }) => {
    await writeAuditLog({
      traceId: uuidv4(),
      actor: 'system',
      action: `OPENCLAW_${input.action}`,
      tool: 'openclaw-client',
      workspaceId: workspaceId || TEST_WORKSPACE_ID,
      request: input.request,
      response: input.error ? { success: false, error: input.error } : input.response
    })
  }

  return new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined,
    eventPath: profile.eventPath || undefined,
    audit
  })
}

/**
 * 确保指定 profileId 的 OpenClaw 客户端已连接
 * 含连接去重（防止并发重复连接）与自动重连
 */
async function ensureOpenClawClientConnected(profileId: string): Promise<OpenClawClient | null> {
  const existing = openClawClients.get(profileId)
  if (existing?.isConnected()) {
    return existing
  }

  if (existing) {
    existing.disconnect()
    openClawClients.delete(profileId)
  }

  const pendingAttempt = openClawConnectionAttempts.get(profileId)
  if (pendingAttempt) {
    return await pendingAttempt
  }

  const attempt = (async () => {
    const client = await createOpenClawClientByProfileId(profileId)
    try {
      await client.connect()
      openClawClients.set(profileId, client)
      return client
    } catch (error) {
      client.disconnect()
      fastify.log.debug({ profileId, err: String(error) }, 'OpenClaw 自动连接失败，等待下一轮状态检查重试')
      return null
    } finally {
      openClawConnectionAttempts.delete(profileId)
    }
  })()

  openClawConnectionAttempts.set(profileId, attempt)
  return await attempt
}

/**
 * 构造本机 OpenClaw 启动命令（跨平台）
 */
function buildLocalOpenClawStartCommand(options: {
  executablePath?: string
  port: number
}): { command: string; workDir?: string } {
  const executablePath = options.executablePath || ''
  const workDir = executablePath ? path.dirname(executablePath) : undefined

  if (process.platform === 'win32') {
    const quotedPath = executablePath.includes(' ') ? `"${executablePath}"` : executablePath
    return {
      command: `start "" ${quotedPath} --port ${options.port}`,
      workDir
    }
  }

  if (workDir) {
    const quotedPath = executablePath.includes(' ') ? `"${path.basename(executablePath)}"` : `./${path.basename(executablePath)}`
    return {
      command: `cd "${workDir}" && nohup ${quotedPath} --port ${options.port} > gateway.log 2>&1 &`,
      workDir
    }
  }

  return {
    command: `nohup openclaw-gateway --port ${options.port} > gateway.log 2>&1 &`
  }
}

/**
 * 查找已加入 allowlist 的通信目标
 */
async function resolveAllowlistedTarget(channel: string, to: string) {
  return await prisma.commsTarget.findFirst({
    where: {
      channel,
      to,
      allowlisted: true,
      commsProfile: { enabled: true }
    },
    include: { commsProfile: true }
  })
}

/**
 * 从 provider 返回结果中提取消息 ID 与回执
 */
function extractProviderReceipt(result: unknown): { providerMessageId: string | null; receipt: string } {
  const data = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
  const candidate = data.message_id || data.messageId || data.id
  const providerMessageId = typeof candidate === 'string' ? candidate : null
  return { providerMessageId, receipt: JSON.stringify(data) }
}

/**
 * 分发外发消息（核心发送逻辑）
 *
 * 流程：
 * 1. 查找消息，已发送则跳过
 * 2. 内容去重检查（相同 contentHash 已发送则标记去重）
 * 3. allowlist 校验
 * 4. 通过 OpenClaw 客户端发送
 * 5. 写入审计日志 + 发射事件
 * 6. 失败时分类错误并设置重试时间
 */
async function dispatchOutboundMessage(
  outboundMessageId: string,
  actor: string
): Promise<{ traceId: string; result: unknown }> {
  const message = await prisma.outboundMessage.findUnique({ where: { id: outboundMessageId } })
  if (!message) {
    throw new Error('外发消息不存在')
  }

  if (message.status === 'SENT') {
    return { traceId: message.traceId, result: { status: 'already_sent' } }
  }

  const duplicated = await prisma.outboundMessage.findFirst({
    where: {
      id: { not: message.id },
      contentHash: message.contentHash,
      status: { in: ['SENDING', 'SENT'] }
    },
    orderBy: { updatedAt: 'desc' }
  })
  if (duplicated) {
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: duplicated.status === 'SENT' ? 'SENT' : 'SENDING',
        providerMessageId: duplicated.providerMessageId,
        providerReceipt: duplicated.providerReceipt,
        lastError: null
      }
    })
    return { traceId: message.traceId, result: { status: 'deduplicated', duplicateMessageId: duplicated.id } }
  }

  const allowlistedTarget = await resolveAllowlistedTarget(message.channel, message.to)
  if (!allowlistedTarget) {
    throw new Error('目标未加入 allowlist，禁止发送')
  }

  if (allowlistedTarget.commsProfile.provider !== 'openclaw' || !allowlistedTarget.commsProfile.claudeCodeProfileId) {
    throw new Error('当前仅支持通过 OpenClaw provider 发送')
  }

  const client = await createOpenClawClientByProfileId(allowlistedTarget.commsProfile.claudeCodeProfileId)

  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: {
      status: 'SENDING',
      lastError: null
    }
  })

  const traceId = message.traceId

  try {
    const providerResult = await client.sendChannelMessage({
      channel: message.channel,
      to: message.to,
      subject: message.subject || undefined,
      body: message.body,
      traceId
    })
    const { providerMessageId, receipt } = extractProviderReceipt(providerResult)

    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: {
        status: 'SENT',
        lastError: null,
        lastSentAt: new Date(),
        providerMessageId,
        providerReceipt: receipt,
        attempts: { increment: 1 },
        nextRetryAt: null
      }
    })

    await writeAuditLog({
      workspaceId: message.workspaceId,
      ticketId: message.ticketId || undefined,
      traceId,
      actor,
      action: 'OUTBOUND_SENT',
      tool: message.provider,
      approvalId: message.approvalId || undefined,
      templateId: message.templateId || undefined,
      outboundMessageId: message.id,
      providerMessageId: providerMessageId || undefined,
      request: {
        outboundMessageId: message.id,
        channel: message.channel,
        to: maskTarget(message.to),
        subject: message.subject || null
        },
      response: receipt
    })

    await emitApiEvent({
      workspaceId: message.workspaceId,
      sourceType: 'COMMUNICATION',
      sourceId: message.id,
      eventType: 'COMMUNICATION_SENT',
      severity: 'INFO',
      title: '通知发送成功',
      summary: `消息已成功发送到 ${maskTarget(message.to)}`,
      payload: {
        outboundMessageId: message.id,
        providerMessageId,
        channel: message.channel,
        toMasked: maskTarget(message.to)
      },
      traceId
    })

    return { traceId, result: providerResult }
  } catch (error) {
    const classified = classifySendError(error)
    const nextAttempts = message.attempts + 1
    const nextRetryAt = classified.retriable ? computeNextRetryAt(nextAttempts) : null

    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: {
        status: 'FAILED',
        lastError: `${classified.category}: ${classified.message}`,
        attempts: nextAttempts,
        nextRetryAt
      }
    })

    await writeAuditLog({
      workspaceId: message.workspaceId,
      ticketId: message.ticketId || undefined,
      traceId,
      actor,
      action: 'OUTBOUND_FAILED',
      tool: message.provider,
      approvalId: message.approvalId || undefined,
      templateId: message.templateId || undefined,
      outboundMessageId: message.id,
      request: {
        outboundMessageId: message.id,
        channel: message.channel,
        to: maskTarget(message.to)
        },
      response: {
        category: classified.category,
        retriable: classified.retriable,
        message: classified.message,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null
        }
    })

    await emitApiEvent({
      workspaceId: message.workspaceId,
      sourceType: 'COMMUNICATION',
      sourceId: message.id,
      eventType: 'COMMUNICATION_FAILED',
      severity: 'ERROR',
      title: '通知发送失败',
      summary: `${message.channel} 发送失败：${classified.message}`,
      payload: {
        outboundMessageId: message.id,
        channel: message.channel,
        toMasked: maskTarget(message.to),
        category: classified.category,
        retriable: classified.retriable,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null
      },
      traceId
    })

    throw new Error(`${classified.category}: ${classified.message}`)
  }
}

export {
  createOpenClawClientByProfileId,
  createOpenClawClientFromProfile,
  ensureOpenClawClientConnected,
  buildLocalOpenClawStartCommand,
  resolveAllowlistedTarget,
  extractProviderReceipt,
  dispatchOutboundMessage
}
