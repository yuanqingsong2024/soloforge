import test from 'node:test'
import assert from 'node:assert/strict'
import { ConfigManager } from '../../src/main/services/config-manager'

test('validateTrustedProxies 会拒绝危险代理范围', () => {
  const result = ConfigManager.validateTrustedProxies(['0.0.0.0/0', '*'])

  assert.equal(result.valid, false)
  assert.equal(result.errors.length, 2)
})

test('validateTrustedProxies 会拒绝过大的 CIDR 网段', () => {
  const result = ConfigManager.validateTrustedProxies(['10.0.0.0/16'])

  assert.equal(result.valid, false)
  assert.match(result.errors[0], /最小允许 \/24/)
})

test('validateTrustedProxies 接受精确 IP 与小网段', () => {
  const result = ConfigManager.validateTrustedProxies(['192.168.1.10', '10.0.0.0/24', '2001:db8::1'])

  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test('hash 会忽略嵌套对象键顺序', () => {
  const first = ConfigManager.hash({ b: { d: 2, c: 1 }, a: [{ y: true, x: 'value' }] })
  const second = ConfigManager.hash({ a: [{ x: 'value', y: true }], b: { c: 1, d: 2 } })

  assert.equal(first, second)
})

test('hash 会区分配置内容', () => {
  assert.notEqual(ConfigManager.hash({ model: 'one' }), ConfigManager.hash({ model: 'two' }))
})

test('checkRateLimit 与 recordWrite 会正确反映剩余额度', () => {
  const profileId = `unit-profile-${Date.now()}`

  const before = ConfigManager.checkRateLimit(profileId)
  assert.equal(before.allowed, true)
  assert.equal(before.remaining, 3)

  ConfigManager.recordWrite(profileId)
  ConfigManager.recordWrite(profileId)

  const afterTwo = ConfigManager.checkRateLimit(profileId)
  assert.equal(afterTwo.allowed, true)
  assert.equal(afterTwo.remaining, 1)

  ConfigManager.recordWrite(profileId)
  const afterThree = ConfigManager.checkRateLimit(profileId)
  assert.equal(afterThree.allowed, false)
  assert.equal(afterThree.remaining, 0)
})
