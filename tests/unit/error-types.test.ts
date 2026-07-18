import test from 'node:test'
import assert from 'node:assert/strict'
import { ErrorType, failure, fromError, inferErrorType, isRetryable, isTransient, success } from '../../src/main/services/error-types'

test('success 应返回成功结果', () => {
  const result = success({ ok: true })

  assert.equal(result.success, true)
  assert.deepEqual(result.data, { ok: true })
})

test('failure 应保留错误类型与 retryable 标记', () => {
  const result = failure(ErrorType.TIMEOUT, '请求超时', { code: 'ETIMEDOUT' }, true)

  assert.equal(result.success, false)
  assert.equal(result.error?.type, ErrorType.TIMEOUT)
  assert.equal(result.error?.message, '请求超时')
  assert.equal(result.error?.retryable, true)
})

test('inferErrorType 能识别常见网络错误', () => {
  assert.equal(inferErrorType(new Error('fetch failed')), ErrorType.NETWORK_ERROR)
  assert.equal(inferErrorType(new Error('connection refused by peer')), ErrorType.CONNECTION_REFUSED)
  assert.equal(inferErrorType(new Error('request timeout exceeded')), ErrorType.TIMEOUT)
})

test('fromError 会把网络异常转换为可重试结果', () => {
  const result = fromError(new Error('fetch failed'))

  assert.equal(result.success, false)
  assert.equal(result.error?.type, ErrorType.NETWORK_ERROR)
  assert.equal(result.error?.retryable, true)
  assert.equal(isRetryable(result), true)
})

test('isTransient 只对临时性错误返回 true', () => {
  assert.equal(isTransient(ErrorType.NETWORK_ERROR), true)
  assert.equal(isTransient(ErrorType.TIMEOUT), true)
  assert.equal(isTransient(ErrorType.AUTH_FAILED), false)
})
