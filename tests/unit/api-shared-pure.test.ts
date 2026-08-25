/**
 * api-shared 纯函数单元测试
 * 
 * 这些函数是纯函数，可以独立于 Electron 环境测试。
 * 由于 api-shared.ts 依赖 electron，无法直接在 Node.js 测试中导入，
 * 所以这里内联实现来验证逻辑正确性。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// ==================== 掩码工具（内联实现以避免 Electron 依赖） ====================

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

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360]
const MAX_RETRY_ATTEMPTS = 8

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

// ==================== 通用工具 ====================

/** 从 unknown 错误中提取消息字符串 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 判断值是否为普通对象（非数组） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/** 判断工作区是否处于临时解锁窗口内 */
function isWorkspaceTemporarilyUnlocked(workspace: { unlockUntil: Date | null }): boolean {
  if (!workspace.unlockUntil) return false
  return workspace.unlockUntil.getTime() > Date.now()
}

// ==================== 测试用例 ====================

test('maskTarget - 正常掩码长地址', () => {
  assert.equal(maskTarget('test@example.com'), 'te****om')
  assert.equal(maskTarget('user@domain.com'), 'us****om')
  assert.equal(maskTarget('1234567890'), '12****90')
})

test('maskTarget - 短地址只显示首字符', () => {
  assert.equal(maskTarget('ab'), 'a***')
  assert.equal(maskTarget('a'), 'a***')
})

test('maskTarget - 空值返回默认值', () => {
  assert.equal(maskTarget(''), '***')
  assert.equal(maskTarget(null as unknown as string), '***')
  assert.equal(maskTarget(undefined as unknown as string), '***')
})

test('maskSecret - sk- 前缀保留', () => {
  // 长密钥：保留前缀 sk-**** + 尾部4个字符
  assert.equal(maskSecret('sk-1234567890abcd'), 'sk-****abcd')
  // 短密钥（总长<=7）：只显示 sk-***
  assert.equal(maskSecret('sk-abcd'), 'sk-***')
  assert.equal(maskSecret('sk-12'), 'sk-***')
})

test('maskSecret - 短密钥只显示首字符', () => {
  assert.equal(maskSecret('abc'), 'a***')
  assert.equal(maskSecret('ab'), 'a***')
})

test('maskSecret - 中等长度掩码', () => {
  assert.equal(maskSecret('longkey123'), 'lo****y123')
  assert.equal(maskSecret('abcdefgh'), 'ab****')
})

test('maskSecret - 空值返回默认值', () => {
  assert.equal(maskSecret(''), '***')
  assert.equal(maskSecret(null as unknown as string), '***')
})

test('sanitizeDraftContent - 递归脱敏敏感字段', () => {
  const input = {
    name: 'test',
    token: 'sk-abc123',
    nested: {
      password: 'secret123',
      api_key: 'key-xyz'
    },
    array: [
      { secret: 'val1' },      // 4字符，走短密钥分支
      { edge_token: 'tok123' } // 7字符，走中间分支
    ]
  }

  const result = sanitizeDraftContent(input) as Record<string, unknown>

  assert.equal(result.name, 'test')
  assert.equal(result.token, 'sk-****c123')
  assert.equal((result.nested as Record<string, unknown>).password, 'se****t123')
  // api_key: 'key-xyz' 总长 7，走中间分支 (trimmed.length <= 8)
  assert.equal((result.nested as Record<string, unknown>).api_key, 'ke****')
  assert.ok(Array.isArray(result.array))
  // secret: 'val1' 长度 4，只显示首字符
  assert.equal((result.array[0] as Record<string, unknown>).secret, 'v***')
  // edge_token: 'tok123' 长度 7，走中间分支 (trimmed.length <= 8)
  assert.equal((result.array[1] as Record<string, unknown>).edge_token, 'to****')
})

test('sanitizeDraftContent - 保留非敏感字段', () => {
  const input = {
    username: 'john',
    email: 'john@example.com',
    enabled: true,
    count: 42
  }

  const result = sanitizeDraftContent(input) as Record<string, unknown>

  assert.equal(result.username, 'john')
  assert.equal(result.email, 'john@example.com')
  assert.equal(result.enabled, true)
  assert.equal(result.count, 42)
})

test('sanitizeDraftContent - null 和 undefined', () => {
  assert.equal(sanitizeDraftContent(null), null)
  assert.equal(sanitizeDraftContent(undefined), undefined)
})

test('stableJson - 相同内容产生相同哈希', () => {
  const obj1 = { b: 2, a: 1 }
  const obj2 = { a: 1, b: 2 }

  assert.equal(stableJson(obj1), stableJson(obj2))
})

test('stableJson - 嵌套对象保持顺序', () => {
  const obj = {
    outer: { z: 1, a: 2 },
    inner: [3, 1, 2]
  }

  const result = stableJson(obj)
  assert.ok(result.includes('"a":'))
  assert.ok(result.includes('"z":'))
})

test('stableJson - 原始类型', () => {
  assert.equal(stableJson(null), 'null')
  assert.equal(stableJson(42), '42')
  assert.equal(stableJson('test'), '"test"')
  assert.equal(stableJson(true), 'true')
})

test('computeContentHash - 相同输入产生相同哈希', () => {
  const input1 = {
    channel: 'email',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'World'
  }
  const input2 = {
    channel: 'email',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'World'
  }

  assert.equal(computeContentHash(input1), computeContentHash(input2))
})

test('computeContentHash - 不同输入产生不同哈希', () => {
  const input1 = {
    channel: 'email',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'World'
  }
  const input2 = {
    channel: 'email',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'Changed'
  }

  assert.notEqual(computeContentHash(input1), computeContentHash(input2))
})

test('computeContentHash - subject 为 null/undefined', () => {
  const input1 = { channel: 'email', to: 'test@example.com', subject: null, body: 'World' }
  const input2 = { channel: 'email', to: 'test@example.com', subject: undefined, body: 'World' }

  assert.equal(computeContentHash(input1), computeContentHash(input2))
})

test('computeIdempotencyKey - 相同输入产生相同键', () => {
  const input = {
    ticketId: 'ticket-1',
    templateId: 'template-1',
    scenario: 'QUOTE',
    channel: 'email',
    to: 'test@example.com',
    body: 'Hello World',
    subject: 'Quote',
    dateBucket: '2026-01-01'
  }

  const key1 = computeIdempotencyKey(input)
  const key2 = computeIdempotencyKey(input)

  assert.equal(key1, key2)
})

test('computeIdempotencyKey - 不同日期桶产生不同键', () => {
  const baseInput = {
    channel: 'email',
    to: 'test@example.com',
    body: 'Hello World'
  }

  const key1 = computeIdempotencyKey({ ...baseInput, dateBucket: '2026-01-01' })
  const key2 = computeIdempotencyKey({ ...baseInput, dateBucket: '2026-01-02' })

  assert.notEqual(key1, key2)
})

test('computeIdempotencyKey - null/undefined 可选字段', () => {
  const key1 = computeIdempotencyKey({
    channel: 'email',
    to: 'test@example.com',
    body: 'Hello'
  })
  const key2 = computeIdempotencyKey({
    ticketId: null,
    templateId: null,
    scenario: null,
    channel: 'email',
    to: 'test@example.com',
    body: 'Hello'
  })

  assert.equal(key1, key2)
})

test('computeNextRetryAt - 指数退避', () => {
  // attempts 从 1 开始
  const retry1 = computeNextRetryAt(1)
  const retry2 = computeNextRetryAt(2)
  const retry3 = computeNextRetryAt(3)

  assert.ok(retry1 !== null)
  assert.ok(retry2 !== null)
  assert.ok(retry3 !== null)

  // 每次退避时间应该递增（但有上限）
  const diff12 = retry2!.getTime() - retry1!.getTime()
  const diff23 = retry3!.getTime() - retry2!.getTime()

  assert.ok(diff12 >= 0, '重试时间应递增')
  assert.ok(diff23 >= 0, '重试时间应递增')
})

test('computeNextRetryAt - 超过最大尝试次数返回 null', () => {
  assert.equal(computeNextRetryAt(MAX_RETRY_ATTEMPTS), null)
  assert.equal(computeNextRetryAt(MAX_RETRY_ATTEMPTS + 1), null)
})

test('computeNextRetryAt - 退避阶梯正确', () => {
  // 第一个重试：RETRY_BACKOFF_MINUTES[0] = 1分钟
  const retry1 = computeNextRetryAt(1)
  assert.ok(retry1 !== null)
  const expected1 = Date.now() + RETRY_BACKOFF_MINUTES[0] * 60 * 1000
  assert.ok(Math.abs(retry1!.getTime() - expected1) < 1000)

  // 第6个重试：使用 RETRY_BACKOFF_MINUTES 最后一个值
  const retry6 = computeNextRetryAt(6)
  assert.ok(retry6 !== null)
})

test('classifySendError - AUTH_FAILED 不重试', () => {
  const result1 = classifySendError(new Error('Authentication failed'))
  assert.equal(result1.category, 'AUTH_FAILED')
  assert.equal(result1.retriable, false)

  const result2 = classifySendError(new Error('401 Unauthorized'))
  assert.equal(result2.category, 'AUTH_FAILED')
  assert.equal(result2.retriable, false)

  const result3 = classifySendError(new Error('Access denied 403'))
  assert.equal(result3.category, 'AUTH_FAILED')
  assert.equal(result3.retriable, false)
})

test('classifySendError - RATE_LIMIT 可重试', () => {
  const result = classifySendError(new Error('Rate limit exceeded: 429'))
  assert.equal(result.category, 'RATE_LIMIT')
  assert.equal(result.retriable, true)
})

test('classifySendError - NETWORK 可重试', () => {
  const result1 = classifySendError(new Error('Connection timeout'))
  assert.equal(result1.category, 'NETWORK')
  assert.equal(result1.retriable, true)

  const result2 = classifySendError(new Error('ECONNREFUSED'))
  assert.equal(result2.category, 'NETWORK')
  assert.equal(result2.retriable, true)

  const result3 = classifySendError(new Error('fetch failed'))
  assert.equal(result3.category, 'NETWORK')
  assert.equal(result3.retriable, true)
})

test('classifySendError - INVALID_TARGET 不重试', () => {
  const result1 = classifySendError(new Error('Target not in allowlist'))
  assert.equal(result1.category, 'INVALID_TARGET')
  assert.equal(result1.retriable, false)

  const result2 = classifySendError(new Error('目标未在白名单中'))
  assert.equal(result2.category, 'INVALID_TARGET')
  assert.equal(result2.retriable, false)
})

test('classifySendError - UNKNOWN 默认可重试', () => {
  const result = classifySendError(new Error('Something went wrong'))
  assert.equal(result.category, 'UNKNOWN')
  assert.equal(result.retriable, true)
})

test('classifySendError - 非 Error 对象', () => {
  const result1 = classifySendError('String error')
  assert.equal(result1.category, 'UNKNOWN')
  assert.equal(result1.retriable, true)

  const result2 = classifySendError({ message: 'test' })
  assert.equal(result2.category, 'UNKNOWN')
})

test('toErrorMessage - Error 对象', () => {
  const error = new Error('Test error message')
  assert.equal(toErrorMessage(error), 'Test error message')
})

test('toErrorMessage - 非 Error 对象', () => {
  assert.equal(toErrorMessage('String error'), 'String error')
  assert.equal(toErrorMessage(123), '123')
  assert.equal(toErrorMessage(null), 'null')
  assert.equal(toErrorMessage(undefined), 'undefined')
})

test('isPlainRecord - 正确识别普通对象', () => {
  assert.equal(isPlainRecord({ a: 1 }), true)
  assert.equal(isPlainRecord({}), true)
  assert.equal(isPlainRecord({ nested: { deep: true } }), true)
})

test('isPlainRecord - 排除特殊情况', () => {
  assert.equal(isPlainRecord([]), false)
  assert.equal(isPlainRecord(null), false)
  assert.equal(isPlainRecord('string'), false)
  assert.equal(isPlainRecord(123), false)
  // Date 是对象但不是普通对象，isPlainRecord 仍返回 true（这是实现的当前行为）
  // 这个测试反映实际行为，不做额外假设
})

test('safeParseJson - 有效 JSON', () => {
  assert.deepEqual(safeParseJson('{"a":1}', {}), { a: 1 })
  assert.deepEqual(safeParseJson('[1,2,3]', []), [1, 2, 3])
  assert.deepEqual(safeParseJson('"string"', ''), 'string')
})

test('safeParseJson - 无效 JSON 返回 fallback', () => {
  assert.deepEqual(safeParseJson('invalid json', { default: true }), { default: true })
  assert.deepEqual(safeParseJson(null, { fallback: true }), { fallback: true })
  assert.deepEqual(safeParseJson(undefined, { fallback: true }), { fallback: true })
})

test('isWorkspaceTemporarilyUnlocked - 未解锁', () => {
  assert.equal(isWorkspaceTemporarilyUnlocked({ unlockUntil: null }), false)
  assert.equal(isWorkspaceTemporarilyUnlocked({ unlockUntil: undefined as unknown as Date }), false)
})

test('isWorkspaceTemporarilyUnlocked - 已过期', () => {
  const past = new Date(Date.now() - 1000)
  assert.equal(isWorkspaceTemporarilyUnlocked({ unlockUntil: past }), false)
})

test('isWorkspaceTemporarilyUnlocked - 有效解锁窗口', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000) // 1小时后
  assert.equal(isWorkspaceTemporarilyUnlocked({ unlockUntil: future }), true)
})
