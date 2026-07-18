import test from 'node:test'
import assert from 'node:assert/strict'
import { ApprovalGuard } from '../../src/main/services/approval-guard'

test('requiresApproval 会识别已声明的高危动作', () => {
  assert.equal(ApprovalGuard.requiresApproval('SEND_EXTERNAL'), true)
  assert.equal(ApprovalGuard.requiresApproval('CHANGE_CONFIG'), true)
  assert.equal(ApprovalGuard.requiresApproval('UNLOCK_WORKSPACE'), true)
  assert.equal(ApprovalGuard.requiresApproval('DELETE_DEPLOYMENT'), true)
})

test('requiresApproval 对未知或低风险动作返回 false', () => {
  assert.equal(ApprovalGuard.requiresApproval('READ_DASHBOARD'), false)
  assert.equal(ApprovalGuard.requiresApproval('LIST_TICKETS'), false)
  assert.equal(ApprovalGuard.requiresApproval(''), false)
})

test('requiresApproval 区分大小写，避免意外放宽策略', () => {
  assert.equal(ApprovalGuard.requiresApproval('send_external'), false)
  assert.equal(ApprovalGuard.requiresApproval('change_config'), false)
})
