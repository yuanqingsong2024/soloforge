/**
 * API 共享基础设施模块
 *
 * 职责：
 * 1. 提供 Fastify / Prisma 单例（全局唯一，所有路由模块共享）
 * 2. 提供跨路由组复用的通用工具函数（ok/fail/toErrorMessage/safeParseJson 等）
 * 3. 提供审计日志与事件总线的高层封装（writeApiAuditLog / emitApiEvent）
 * 4. 提供掩码、哈希、重试等通用计算工具
 *
 * 设计约束（AGENTS.md §1/§6）：
 * - 单例在此文件初始化，路由模块通过 import 获取
 * - 敏感字段必须 mask，不记录明文
 * - 审计日志只允许 create，禁止 update/delete
 */

import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { prisma } from './db'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import { OpenClawClient } from './openclaw-client'
import { EventBusService } from './event-bus'
import { NotificationPolicyService } from './notification-policy-service'
import { writeAuditLog } from './audit-log-writer'

// ==================== 单例 ====================

const fastify = Fastify({ logger: true })
fastify.register(cors, { origin: true })

const openClawClients = new Map<string, OpenClawClient>()
const openClawConnectionAttempts = new Map<string, Promise<OpenClawClient | null>>()

// ==================== 常量 ====================

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360]
const MAX_RETRY_ATTEMPTS = 8

const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const TEST_WORKSPACE_NAME = 'Local'

// ==================== 共享类型 ====================

export type OutboundMessageStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED'

// ==================== 通用工具函数 ====================

/** 成功响应包装 */
function ok<T>(data: T) {
  return { success: true as const, data }
}

/** 失败响应包装 */
function fail(message: string) {
  return { success: false as const, error: message }
}

/** 从 unknown 错误中提取消息字符串 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 判断值是否为普通对象（非数组） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取必填字符串字段，为空时抛错 */
function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} 不能为空`)
  }
  return value.trim()
}

/** 安全 JSON 解析，失败时返回 fallback */
function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 判断是否为 E2E 测试模式 */
function isE2ETestMode(): boolean {
  return process.env.SOLOFORGE_E2E === '1'
}

/** 判断工作区是否处于临时解锁窗口内 */
function isWorkspaceTemporarilyUnlocked(workspace: { unlockUntil: Date | null }): boolean {
  if (!workspace.unlockUntil) return false
  return workspace.unlockUntil.getTime() > Date.now()
}

// ==================== 掩码工具 ====================

/** 掩码目标地址（保留首尾，中间脱敏） */
function maskTarget(raw: string): string {
  if (!raw) return '***'
  if (raw.length <= 4) return `${raw[0]}***`
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}

/** 掩码密钥（保留前缀如 sk-，尾部脱敏） */
function maskSecret(raw: string): string {
  if (!raw) return '***'
  const trimmed = String(raw)
  if (trimmed.startsWith('sk-')) {
    if (trimmed.length <= 7) return 'sk-***'
    return `sk-****${trimmed.slice(-4)}`
  }
  if (trimmed.length <= 4) return `${trimmed[0]}***`
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-4)}`
}

/** 递归脱敏草稿内容中的敏感字段 */
function sanitizeDraftContent(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const key = (parentKey || '').toLowerCase()
    if (
      key.includes('token') ||
      key.includes('password') ||
      key.includes('secret') ||
      key.includes('api_key') ||
      key.includes('apikey') ||
      key.includes('edge')
    ) {
      return maskSecret(value)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(v => sanitizeDraftContent(v, parentKey))
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const k of Object.keys(record)) {
      next[k] = sanitizeDraftContent(record[k], k)
    }
    return next
  }
  return value
}

// ==================== 哈希工具 ====================

/** 稳定 JSON 序列化（键排序，保证相同内容产生相同哈希） */
function stableJson(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data)
  }
  if (Array.isArray(data)) {
    return `[${data.map(stableJson).join(',')}]`
  }
  const record = data as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

/** 计算外发消息内容哈希 */
function computeContentHash(input: { channel: string; to: string; subject?: string | null; body: string }): string {
  const payload = `${input.channel}|${input.to}|${input.subject || ''}|${input.body}`
  return createHash('sha256').update(payload).digest('hex')
}

/** 计算幂等键 */
function computeIdempotencyKey(input: {
  ticketId?: string | null
  templateId?: string | null
  scenario?: string | null
  channel: string
  to: string
  body: string
  subject?: string | null
  dateBucket?: string
}): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex')
  const bucket = input.dateBucket || new Date().toISOString().slice(0, 10)
  const raw = [
    input.ticketId || 'no-ticket',
    input.templateId || 'no-template',
    input.scenario || 'CUSTOM',
    input.channel,
    input.to,
    input.subject || '',
    bodyHash,
    bucket
  ].join('|')
  return createHash('sha256').update(raw).digest('hex')
}

// ==================== 重试工具 ====================

/** 根据当前尝试次数计算下次重试时间 */
function computeNextRetryAt(attempts: number): Date | null {
  if (attempts >= MAX_RETRY_ATTEMPTS) return null
  const idx = Math.min(attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)
  const minutes = RETRY_BACKOFF_MINUTES[idx]
  return new Date(Date.now() + minutes * 60 * 1000)
}

/** 分类发送错误，判断是否可重试 */
function classifySendError(error: unknown): { category: 'AUTH_FAILED' | 'RATE_LIMIT' | 'NETWORK' | 'INVALID_TARGET' | 'UNKNOWN'; retriable: boolean; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('allowlist') || lower.includes('invalid target') || lower.includes('目标')) {
    return { category: 'INVALID_TARGET', retriable: false, message }
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
    return { category: 'AUTH_FAILED', retriable: false, message }
  }
  if (lower.includes('429') || lower.includes('rate')) {
    return { category: 'RATE_LIMIT', retriable: true, message }
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('fetch failed') || lower.includes('econn')) {
    return { category: 'NETWORK', retriable: true, message }
  }
  return { category: 'UNKNOWN', retriable: true, message }
}

// ==================== 审计与事件 ====================

/** API 审计日志写入（转发到 audit-log-writer，获得自动脱敏） */
async function writeApiAuditLog(input: {
  workspaceId?: string
  traceId: string
  ticketId?: string
  actor: string
  action: string
  tool: string
  approvalId?: string
  request: unknown
  response: unknown
}): Promise<void> {
  await writeAuditLog({
    workspaceId: input.workspaceId,
    traceId: input.traceId,
    ticketId: input.ticketId,
    actor: input.actor,
    action: input.action,
    tool: input.tool,
    approvalId: input.approvalId,
    request: input.request,
    response: input.response
  })
}

/** 事件总线发射 + 通知策略触发（统一入口） */
async function emitApiEvent(input: {
  workspaceId: string
  targetId?: string
  sourceType: 'CONFIG' | 'CHANGE_REQUEST' | 'DEPLOYMENT_JOB' | 'DOCTOR' | 'BACKUP' | 'SYSTEM' | 'COMMUNICATION' | 'HOST_AGENT'
  sourceId: string
  eventType: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  title: string
  summary: string
  payload: unknown
  traceId?: string
}): Promise<void> {
  try {
    await EventBusService.emit({
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      traceId: input.traceId
    })

    // 仅由统一事件层触发通知策略，避免各模块各自发送。
    // 为防止通知相关事件再次触发通知导致递归，这里显式跳过 COMMUNICATION 源与通知策略内部事件。
    if (input.sourceType !== 'COMMUNICATION' && !input.eventType.startsWith('NOTIFICATION_')) {
      await triggerNotificationPolicies({
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        sourceType: input.sourceType,
        eventType: input.eventType,
        severity: input.severity,
        title: input.title,
        summary: input.summary,
        traceId: input.traceId,
        payload: (typeof input.payload === 'object' && input.payload !== null
          ? (input.payload as Record<string, unknown>)
          : { value: input.payload })
      })
    }
  } catch (error) {
    fastify.log.error({ traceId: input.traceId, err: toErrorMessage(error) }, `写入事件失败：${input.eventType}`)
  }
}

/** 通知策略匹配与触发（内部函数，由 emitApiEvent 调用） */
async function triggerNotificationPolicies(input: {
  workspaceId: string
  targetId?: string
  sourceType: string
  eventType: string
  severity: string
  title: string
  summary: string
  traceId?: string
  payload: Record<string, unknown>
}): Promise<void> {
  try {
    const policies = await NotificationPolicyService.matchPolicies({
      workspaceId: input.workspaceId,
      targetId: input.targetId || null,
      sourceType: input.sourceType,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      traceId: input.traceId || null,
      payload: input.payload
    })

    for (const policy of policies) {
      const targets = safeParseJson<string[]>(policy.deliveryTargets, [])
      const dedupeWindowSeconds = policy.dedupeWindowSeconds || 900
      const cooldownSeconds = policy.cooldownSeconds || 300
      const rendered = NotificationPolicyService.renderPolicyMessage({
        policyName: policy.name,
        event: {
          workspaceId: input.workspaceId,
          targetId: input.targetId || null,
          sourceType: input.sourceType,
          eventType: input.eventType,
          severity: input.severity,
          title: input.title,
          summary: input.summary,
          traceId: input.traceId || null,
          payload: input.payload
        }
      })

      for (const targetId of targets) {
        const target = await prisma.commsTarget.findUnique({ where: { id: targetId } })
        if (!target || !target.allowlisted) continue

        const dedupeKey = `${policy.id}:${target.id}:${input.eventType}:${input.severity}`
        const now = Date.now()

        const deduped = await prisma.outboxEvent.findFirst({
          where: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            status: { in: ['SENDING', 'SUCCEEDED'] },
            createdAt: { gte: new Date(now - dedupeWindowSeconds * 1000) },
            payload: { contains: `"dedupeKey":"${dedupeKey}"` }
          },
          orderBy: { createdAt: 'desc' }
        })
        if (deduped) {
          continue
        }

        const cooldownHit = await prisma.outboxEvent.findFirst({
          where: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            status: { in: ['SENDING', 'SUCCEEDED'] },
            createdAt: { gte: new Date(now - cooldownSeconds * 1000) },
            payload: { contains: `"policyId":"${policy.id}"` }
          },
          orderBy: { createdAt: 'desc' }
        })
        if (cooldownHit) {
          continue
        }

        const dispatchEvent = await prisma.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            traceId: input.traceId || uuidv4(),
            status: 'SENDING',
            payload: JSON.stringify({
              policyId: policy.id,
              targetId: target.id,
              eventType: input.eventType,
              severity: input.severity,
              dedupeKey
            }),
            attempts: 0
          }
        })

        const draft = await prisma.outboundMessage.create({
          data: {
            workspaceId: input.workspaceId,
            templateId: policy.templateId || null,
            provider: 'openclaw',
            channel: target.channel,
            to: target.to,
            toMasked: maskTarget(target.to),
            subject: rendered.subject,
            body: rendered.body,
            status: 'DRAFT',
            idempotencyKey: createHash('sha256').update(`${policy.id}:${target.id}:${input.eventType}:${input.traceId || ''}`).digest('hex'),
            traceId: input.traceId || uuidv4(),
            contentHash: computeContentHash({
              channel: target.channel,
              to: target.to,
              subject: rendered.subject,
              body: rendered.body
            }),
            attempts: 0
          }
        })

        await emitApiEvent({
          workspaceId: input.workspaceId,
          targetId: input.targetId,
          sourceType: 'COMMUNICATION',
          sourceId: draft.id,
          eventType: 'NOTIFICATION_POLICY_TRIGGERED',
          severity: input.severity === 'CRITICAL' ? 'CRITICAL' : input.severity === 'ERROR' ? 'ERROR' : 'INFO',
          title: `通知策略触发：${policy.name}`,
          summary: `${input.eventType} 命中通知策略并创建外发草稿`,
          payload: {
            policyId: policy.id,
            outboundMessageId: draft.id,
            commsTargetId: target.id
          },
          traceId: input.traceId
        })

        await fastify.inject({
          method: 'POST',
          url: `/api/outbound-messages/${draft.id}/send`
        })

        await prisma.outboxEvent.update({
          where: { id: dispatchEvent.id },
          data: {
            status: 'SUCCEEDED',
            attempts: { increment: 1 },
            lastError: null
          }
        })
      }
    }
  } catch (error) {
    fastify.log.error({ traceId: input.traceId, err: toErrorMessage(error) }, '触发通知策略失败')
  }
}

// ==================== 导出 ====================

export {
  // 单例
  prisma,
  fastify,
  openClawClients,
  openClawConnectionAttempts,
  // 常量
  RETRY_BACKOFF_MINUTES,
  MAX_RETRY_ATTEMPTS,
  TEST_WORKSPACE_ID,
  TEST_WORKSPACE_NAME,
  // 工具函数
  ok,
  fail,
  toErrorMessage,
  isPlainRecord,
  readRequiredString,
  safeParseJson,
  isE2ETestMode,
  isWorkspaceTemporarilyUnlocked,
  // 掩码工具
  maskTarget,
  maskSecret,
  sanitizeDraftContent,
  // 哈希工具
  stableJson,
  computeContentHash,
  computeIdempotencyKey,
  // 重试工具
  computeNextRetryAt,
  classifySendError,
  // 审计与事件
  writeApiAuditLog,
  emitApiEvent,
  triggerNotificationPolicies
}

export type { FastifyInstance }
