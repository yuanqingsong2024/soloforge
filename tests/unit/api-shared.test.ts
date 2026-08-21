/**
 * api-shared 工具函数单元测试
 * 
 * 覆盖范围：
 * - 掩码工具：maskTarget / maskSecret / sanitizeDraftContent
 * - 哈希工具：stableJson / computeContentHash / computeIdempotencyKey
 * - 重试工具：computeNextRetryAt / classifySendError
 * - 通用工具：toErrorMessage / isPlainRecord / safeParseJson / isWorkspaceTemporarilyUnlocked
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  maskTarget,
  maskSecret,
  sanitizeDraftContent,
  stableJson,
  computeContentHash,
  computeIdempotencyKey,
  computeNextRetryAt,
  classifySendError,
  toErrorMessage,
  isPlainRecord,
  safeParseJson,
  isWorkspaceTemporarilyUnlocked,
  RETRY_BACKOFF_MINUTES,
  MAX_RETRY_ATTEMPTS
} from '../../src/main/services/api-shared'

// ==================== 掩码工具测试 ====================

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
  // 长度 <= 7 的 sk- 密钥只显示前缀
  assert.equal(maskSecret('sk-ab'), 'sk-***')
  assert.equal(maskSecret('sk-abc'), 'sk-***')
  assert.equal(maskSecret('sk-abc1'), 'sk-***')
  // 长度 > 7 的 sk- 密钥保留末尾4位
  assert.equal(maskSecret('sk-1234567890abcd'), 'sk-****abcd')
  assert.equal(maskSecret('sk-abc123'), 'sk-****c123') // 长度=8
})

test('maskSecret - 短密钥只显示首字符', () => {
  assert.equal(maskSecret('abc'), 'a***')
  assert.equal(maskSecret('ab'), 'a***')
})

test('maskSecret - 中等长度掩码', () => {
  // 长度 <= 8: 显示前2位 + ****
  assert.equal(maskSecret('abcdefgh'), 'ab****')
  // 长度 > 8: 显示前2位 + **** + 后4位
  assert.equal(maskSecret('longkey123'), 'lo****y123')
  // 长度 = 7: 走 <= 8 分支
  assert.equal(maskSecret('key-xyz'), 'ke****')
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
      { secret: 'val1' },
      { edge_token: 'tok123' }
    ]
  }

  const result = sanitizeDraftContent(input) as Record<string, unknown>

  assert.equal(result.name, 'test')
  // sk-abc123 长度=8, 满足 > 7, 返回 sk-****c123
  assert.equal(result.token, 'sk-****c123')
  // password: secret123 -> 长度=9 > 8, 保留前后各2位
  assert.equal((result.nested as Record<string, unknown>).password, 'se****t123')
  // api_key: key-xyz -> 长度=7, 走 <= 8 分支, 返回前2位+****
  assert.equal((result.nested as Record<string, unknown>).api_key, 'ke****')
  assert.ok(Array.isArray(result.array))
  // secret: val1 -> 长度=4 <= 4, 返回 v***
  assert.equal((result.array[0] as Record<string, unknown>).secret, 'v***')
  // edge_token: tok123 -> 长度=7, 走 <= 8 分支
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

// ==================== 哈希工具测试 ====================

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

// ==================== 重试工具测试 ====================

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
  // 字符串 "Network error" 会被识别为 NETWORK 类型（因为包含 'network'）
  const result1 = classifySendError('Network error')
  assert.equal(result1.category, 'NETWORK')
  assert.equal(result1.retriable, true)

  // 普通对象被 String() 转换为 "[object Object]"，不匹配任何规则
  const result2 = classifySendError({ message: 'test' })
  assert.equal(result2.category, 'UNKNOWN')
})

// ==================== 通用工具测试 ====================

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
  // Date 是普通对象，isPlainRecord 会返回 true（这是符合预期的）
  // 如需排除 Date，应在调用方处理
  assert.equal(isPlainRecord(new Date()), true)
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
