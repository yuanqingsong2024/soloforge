import test from 'node:test'
import assert from 'node:assert/strict'
import { PolicyGuard } from '../../src/main/services/policy-guard'

// PolicyGuard 的方法是异步的，需要 workspaceId 参数
// 这里测试只验证方法存在和基本结构

test('PolicyGuard.checkToolAccess 方法存在', () => {
  assert.equal(typeof PolicyGuard.checkToolAccess, 'function')
})

test('PolicyGuard.checkCommsTarget 方法存在', () => {
  assert.equal(typeof PolicyGuard.checkCommsTarget, 'function')
})

test('PolicyGuard.checkConfigPath 方法存在', () => {
  assert.equal(typeof PolicyGuard.checkConfigPath, 'function')
})

test('PolicyGuard.checkApprovalRequired 方法存在', () => {
  assert.equal(typeof PolicyGuard.checkApprovalRequired, 'function')
})
