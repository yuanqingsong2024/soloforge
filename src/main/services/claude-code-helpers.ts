/**
 * Claude Code Helpers - 消息发送相关辅助函数
 */

import { prisma } from './api-shared'
import { writeAuditLog } from './audit-log-writer'
import { OpenClawClient } from './openclaw-client'
import { v4 as uuidv4 } from 'uuid'

/**
 * 分发出站消息（审批通过后执行）
 */
export async function dispatchOutboundMessage(outboundMessageId: string, actor: string): Promise<void> {
  const traceId = uuidv4()

  const message = await prisma.outboundMessage.findUnique({
    where: { id: outboundMessageId },
    include: { workspace: true }
  })

  if (!message) {
    throw new Error(`OutboundMessage ${outboundMessageId} not found`)
  }

  const target = await prisma.commsTarget.findFirst({
    where: { workspaceId: message.workspaceId, channel: message.channel, to: message.to },
    include: { commsProfile: { include: { claudeCodeProfile: true } } }
  })
  const profile = target?.commsProfile.claudeCodeProfile
  if (!profile || !target?.commsProfile.enabled) {
    const error = `未找到启用的 ${message.channel} 连接配置`
    await prisma.outboundMessage.update({ where: { id: outboundMessageId }, data: { status: 'FAILED', lastError: error } })
    await writeAuditLog({
      workspaceId: message.workspaceId,
      traceId,
      actor,
      action: 'OUTBOUND_MESSAGE_FAILED',
      tool: 'communications',
      request: { outboundMessageId, channel: message.channel },
      response: { status: 'FAILED', error }
    })
    throw new Error(error)
  }

  const client = new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    ...(profile.eventPath ? { eventPath: profile.eventPath } : {}),
    audit: async audit => writeAuditLog({
      workspaceId: message.workspaceId,
      traceId,
      actor,
      action: audit.action,
      tool: 'openclaw-client',
      request: audit.request,
      response: audit.error ? { status: 'FAILED', error: audit.error } : audit.response
    })
  })
  const receipt = await client.sendChannelMessage({
    channel: message.channel,
    to: message.to,
    body: message.body,
    subject: message.subject || undefined,
    traceId
  })
  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: {
      status: 'SENT',
      lastSentAt: new Date(),
      lastError: null,
      providerReceipt: JSON.stringify(receipt)
    }
  })

  await writeAuditLog({
    workspaceId: message.workspaceId,
    traceId,
    actor,
    action: 'OUTBOUND_MESSAGE_SENT',
    tool: 'communications',
    request: { outboundMessageId, channel: message.channel },
    response: { status: 'SENT' }
  })
}
