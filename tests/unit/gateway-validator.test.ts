import test from 'node:test'
import assert from 'node:assert/strict'
import { GatewayValidator } from '../../src/main/services/gateway-validator'

test('validatePort 会拒绝非整数并提示特权端口告警', () => {
  const invalid = GatewayValidator.validatePort(80.5)
  assert.equal(invalid.valid, false)
  assert.match(invalid.errors[0], /端口必须是整数/)

  const privileged = GatewayValidator.validatePort(443)
  assert.equal(privileged.valid, true)
  assert.match(privileged.warnings[0], /需要管理员权限/)
})

test('validateBind 会拒绝非法地址并提示公网暴露风险', () => {
  const invalid = GatewayValidator.validateBind('not-an-ip')
  assert.equal(invalid.valid, false)
  assert.match(invalid.errors[0], /无效的绑定地址/)

  const exposed = GatewayValidator.validateBind('0.0.0.0')
  assert.equal(exposed.valid, true)
  assert.match(exposed.warnings[0], /暴露到所有网络接口/)
})

test('validateAuth 会校验必需凭证并提示 none 模式风险', () => {
  const tokenMode = GatewayValidator.validateAuth({ mode: 'token' })
  assert.equal(tokenMode.valid, false)
  assert.match(tokenMode.errors[0], /需要提供 tokenHash/)

  const noneMode = GatewayValidator.validateAuth({ mode: 'none' })
  assert.equal(noneMode.valid, true)
  assert.match(noneMode.warnings[0], /不进行任何认证/)
})

test('validateTrustedProxies 会拒绝危险或过大网段并接受安全值', () => {
  const invalid = GatewayValidator.validateTrustedProxies(['0.0.0.0/0', '10.0.0.0/16', '300.1.1.1'])
  assert.equal(invalid.valid, false)
  assert.equal(invalid.errors.length, 3)

  const valid = GatewayValidator.validateTrustedProxies(['192.168.1.10', '10.0.0.0/24', '2001:db8::1'])
  assert.equal(valid.valid, true)
  assert.deepEqual(valid.errors, [])
})

test('validateCors 会拒绝非法来源并提示通配来源风险', () => {
  const invalid = GatewayValidator.validateCors({
    enabled: true,
    origins: ['notaurl']
  })
  assert.equal(invalid.valid, false)
  assert.match(invalid.errors[0], /无效的 CORS 来源/)

  const wildcard = GatewayValidator.validateCors({
    enabled: true,
    origins: ['*']
  })
  assert.equal(wildcard.valid, true)
  assert.match(wildcard.warnings[0], /允许所有来源/)
})

test('validate 会聚合多个子校验结果', () => {
  const result = GatewayValidator.validate({
    port: 0,
    bind: '0.0.0.0',
    auth: { mode: 'password' },
    trustedProxies: ['0.0.0.0'],
    cors: {
      enabled: true,
      origins: ['https://example.com', '*']
    }
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((message) => message.includes('端口必须在 1-65535 范围内')))
  assert.ok(result.errors.some((message) => message.includes('password 模式需要提供 passwordHash')))
  assert.ok(result.errors.some((message) => message.includes('禁止使用危险代理地址')))
  assert.ok(result.warnings.some((message) => message.includes('暴露到所有网络接口')))
  assert.ok(result.warnings.some((message) => message.includes('CORS 允许所有来源')))
})
