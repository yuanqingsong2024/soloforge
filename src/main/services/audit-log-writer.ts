import { prisma } from './db'
import { logger } from './logger'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * 审计日志写入模块
 *
 * 职责：
 * 1. 提供 maskSensitive() —— 递归脱敏敏感字段（token/password/apiKey 等）
 * 2. 提供 writeAuditLog() —— 统一审计日志写入入口（append-only + 哈希链防篡改）
 * 3. 提供 verifyAuditChain() —— 验证哈希链完整性，检测审计日志是否被篡改
 *
 * 设计约束（AGENTS.md §2/§6）：
 * - AuditLog 只允许 create，禁止 update/delete
 * - 敏感字段必须 mask，不记录明文
 * - 写入失败仅记录日志，不向调用方抛异常（保证不影响主流程）
 * - 哈希链：每条记录包含前一条的哈希，形成链式结构，可检测篡改
 */

/** 默认工作区 ID（与 api-server.ts 保持一致，未指定 workspaceId 时回退） */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 敏感字段名黑名单（小写匹配，覆盖中英文常见命名）
 * 命中即整值替换为 ***MASKED***
 */
const SENSITIVE_KEYS = [
  'token',
  'password',
  'passwd',
  'apikey',
  'api_key',
  'secret',
  'credential',
  'edgetoken',
  'edge_token',
  'x-edge-token',
  'authorization',
  'cookie',
  'session',
  'privatekey',
  'private_key',
  '密码',
  '令牌',
  '密钥',
  '凭证'
]

/**
 * 敏感值模式：即便字段名不敏感，值形如以下模式也需尾部脱敏
 * 例如：sk-abcdef1234...、Bearer xxx、ghp_xxx
 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /^sk-[a-zA-Z0-9]{8,}$/,
  /^Bearer\s+\S+/i,
  /^ghp_[a-zA-Z0-9]{8,}$/,
  /^gho_[a-zA-Z0-9]{8,}$/ // GitHub OAuth token
]

/**
 * 判断字段名是否敏感（小写匹配）
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some(sensitive => lower === sensitive || lower.includes(sensitive))
}

/**
 * 对字符串值进行尾部脱敏（保留前缀便于识别类型，尾部用 **** 替换）
 * 例如：sk-abcd1234efgh5678 → sk-abcd****5678
 *      过短或无法识别的敏感值 → ****
 */
function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return '****'
  }
  // 命中敏感值模式：保留前 4 + 后 4，中间脱敏
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`
    }
  }
  return value
}

/**
 * 递归脱敏：遍历任意 JSON 可序列化结构，对敏感字段和敏感值进行脱敏
 *
 * @param value 任意值（对象/数组/基本类型）
 * @returns 脱敏后的同结构值（原值不被修改）
 */
export function maskSensitive(value: unknown): unknown {
  // null / undefined
  if (value === null || value === undefined) {
    return value
  }

  // 字符串：检查是否命中敏感值模式
  if (typeof value === 'string') {
    return maskSensitiveValue(value)
  }

  // 数组：递归每个元素
  if (Array.isArray(value)) {
    return value.map(item => maskSensitive(item))
  }

  // 对象：逐字段判断
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        // 敏感字段：整值替换为 ***MASKED***
        // 若值本身是对象/数组（罕见），仍递归脱敏其内部
        result[key] = typeof val === 'object' && val !== null ? maskSensitive(val) : '***MASKED***'
      } else {
        result[key] = maskSensitive(val)
      }
    }
    return result
  }

  // 数字/布尔等其他基本类型：原样返回
  return value
}

/**
 * 安全 JSON 序列化（捕获异常，返回 '{}' 而非抛出）
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

/**
 * 审计日志写入输入
 */
export interface WriteAuditLogInput {
  /** 工作区 ID（可选，缺省回退到 DEFAULT_WORKSPACE_ID） */
  workspaceId?: string
  /** 追踪 ID（必填，贯穿调用链） */
  traceId: string
  /** 工单 ID（可选） */
  ticketId?: string
  /** 操作者（如 'admin' / 'system'） */
  actor: string
  /** 动作名（如 'AGENT_CREATED' / 'OPENCLAW_GET_CONFIG'） */
  action: string
  /** 工具标识（如 'team-management' / 'openclaw-client'） */
  tool?: string
  /** 审批 ID（可选） */
  approvalId?: string
  /** 模板 ID（可选） */
  templateId?: string
  /** 外发消息 ID（可选） */
  outboundMessageId?: string
  /** Provider 消息 ID（可选） */
  providerMessageId?: string
  /** 变更请求 ID（可选） */
  changeRequestId?: string
  /** 快照 ID（可选） */
  snapshotId?: string
  /** 漂移 ID（可选） */
  diffId?: string
  /** 请求载荷（会被自动脱敏） */
  request: unknown
  /** 响应载荷（会被自动脱敏） */
  response: unknown
}

/**
 * 哈希链算法密钥
 * 用于 HMAC-SHA256 签名，密钥存储在内存中，不持久化
 * 重启后会失效（已存在的哈希链记录无法验证，但新写入的记录仍然链式保护）
 */
const HASH_CHAIN_SECRET = 'soloforge-audit-chain-2026'

/** 内存中的最新哈希（按 workspaceId 隔离，默认用全局密钥） */
const latestHashByWorkspace = new Map<string, string>()

/**
 * 计算单条审计日志的哈希值
 *
 * 公式：currentHash = HMAC-SHA256(secret, previousHash + traceId + actor + action + request + response + ts)
 *
 * 使用 HMAC 而非 SHA-256，因为如果数据库被篡改，攻击者也可以修改哈希值
 * 加上密钥后才能防止伪造
 */
export function computeAuditLogHash(
  previousHash: string,
  traceId: string,
  actor: string,
  action: string,
  request: string,
  response: string,
  ts: Date
): string {
  const payload = `${previousHash}|${traceId}|${actor}|${action}|${request}|${response}|${ts.toISOString()}`
  return createHmac('sha256', HASH_CHAIN_SECRET)
    .update(payload)
    .digest('hex')
}

/**
 * 获取某工作区最新的哈希值（用于新记录计算哈希链）
 */
async function getLatestHash(workspaceId: string): Promise<string> {
  // 优先使用内存缓存
  const cached = latestHashByWorkspace.get(workspaceId)
  if (cached) {
    return cached
  }

  // 从数据库获取最新记录
  try {
    const latest = await prisma.auditLog.findFirst({
      where: { workspaceId },
      orderBy: { ts: 'desc' }
    })
    if (latest && latest.currentHash) {
      latestHashByWorkspace.set(workspaceId, latest.currentHash)
      return latest.currentHash
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.warn(`[AuditLog] 获取最新哈希失败: ${errMsg}`)
  }

  // 没有最新记录，使用空字符串作为链起点
  return ''
}

/**
 * 写入审计日志（append-only + 哈希链防篡改）
 *
 * 行为：
 * - 自动调用 maskSensitive 脱敏 request / response
 * - 自动获取前一条记录的哈希，写入 currentHash
 * - 写入失败仅 console.error 记录，不抛异常
 * - 只调用 prisma.auditLog.create()，永不 update/delete
 *
 * @param input 审计日志输入
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    const wsId = input.workspaceId || DEFAULT_WORKSPACE_ID
    const latestHash = await getLatestHash(wsId)

    const maskedRequest = safeStringify(maskSensitive(input.request))
    const maskedResponse = safeStringify(maskSensitive(input.response))
    const now = new Date()

    const currentHash = computeAuditLogHash(
      latestHash,
      input.traceId,
      input.actor,
      input.action,
      maskedRequest,
      maskedResponse,
      now
    )

    await prisma.auditLog.create({
      data: {
        workspaceId: wsId,
        ticketId: input.ticketId,
        traceId: input.traceId,
        actor: input.actor,
        action: input.action,
        tool: input.tool ?? null,
        approvalId: input.approvalId,
        templateId: input.templateId ?? null,
        outboundMessageId: input.outboundMessageId ?? null,
        providerMessageId: input.providerMessageId ?? null,
        changeRequestId: input.changeRequestId ?? null,
        snapshotId: input.snapshotId ?? null,
        diffId: input.diffId ?? null,
        request: maskedRequest,
        response: maskedResponse,
        previousHash: latestHash,
        currentHash,
        ts: now
      }
    })

    // 更新内存缓存
    latestHashByWorkspace.set(wsId, currentHash)
  } catch (error) {
    // 写入失败不影响主流程，仅记录错误日志
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[AuditLog] 写入失败 action=${input.action} traceId=${input.traceId}: ${errMsg}`)
  }
}

/**
 * 验证审计日志哈希链完整性
 *
 * 遍历指定工作区的所有审计日志，按 ts 排序，逐条验证哈希链是否完整。
 *
 * 验证规则：
 * 1. 每条记录的 previousHash 等于前一条记录的 currentHash
 * 2. 每条记录的 currentHash = HMAC-SHA256(secret, previousHash + traceId + actor + action + request + response + ts)
 *
 * @param workspaceId 工作区 ID
 * @returns 验证结果
 */
export async function verifyAuditChain(
  workspaceId: string
): Promise<{
  valid: boolean
  totalRecords: number
  firstInvalidIndex: number
  brokenChains: Array<{ index: number; expectedHash: string; actualHash: string }>
}> {
  const records = await prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { ts: 'asc' },
    select: {
      id: true,
      traceId: true,
      actor: true,
      action: true,
      request: true,
      response: true,
      previousHash: true,
      currentHash: true,
      ts: true
    }
  })

  const brokenChains: Array<{ index: number; expectedHash: string; actualHash: string }> = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const prevHash = i === 0 ? '' : records[i - 1].currentHash ?? ''

    // 规则 1：previousHash 链必须完整
    if (record.previousHash !== prevHash) {
      brokenChains.push({
        index: i,
        expectedHash: prevHash,
        actualHash: record.previousHash ?? ''
      })
      continue // 链已断裂，后续记录不再验证
    }

    // 规则 2：currentHash 计算必须匹配
    const expectedHash = computeAuditLogHash(
      record.previousHash ?? '',
      record.traceId,
      record.actor,
      record.action,
      record.request,
      record.response,
      record.ts
    )

    // 使用常量时间比较防止时序攻击
    if (!timingSafeEqual(Buffer.from(expectedHash), Buffer.from(record.currentHash))) {
      brokenChains.push({
        index: i,
        expectedHash,
        actualHash: record.currentHash
      })
    }
  }

  return {
    valid: brokenChains.length === 0,
    totalRecords: records.length,
    firstInvalidIndex: brokenChains[0]?.index ?? -1,
    brokenChains
  }
}

/**
 * 清除哈希链缓存（用于测试或重启后重新从数据库加载）
 */
export function clearHashChainCache(): void {
  latestHashByWorkspace.clear()
}

export { prisma } from './db'
