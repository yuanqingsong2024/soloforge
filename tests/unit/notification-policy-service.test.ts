import test from 'node:test'
import assert from 'node:assert/strict'
import { NotificationPolicyService } from '../../src/main/services/notification-policy-service'

test('renderPolicyMessage 会包含核心事件上下文', () => {
  const result = NotificationPolicyService.renderPolicyMessage({
    policyName: '核心告警策略',
    event: {
      sourceType: 'SYSTEM',
      eventType: 'HOST_DOWN',
      severity: 'CRITICAL',
      title: '主机离线',
      summary: '生产主机失联超过 5 分钟',
      workspaceId: 'ws-1',
      targetId: 'target-9',
      traceId: 'trace-123',
      payload: { host: 'node-a' }
    }
  })

  assert.equal(result.subject, '[CRITICAL] HOST_DOWN')
  assert.match(result.body, /策略：核心告警策略/)
  assert.match(result.body, /事件：主机离线/)
  assert.match(result.body, /摘要：生产主机失联超过 5 分钟/)
  assert.match(result.body, /来源：SYSTEM \/ HOST_DOWN/)
  assert.match(result.body, /Workspace：ws-1/)
  assert.match(result.body, /Target：target-9/)
  assert.match(result.body, /Trace：trace-123/)
})

test('renderPolicyMessage 会在缺少可选字段时省略对应行', () => {
  const result = NotificationPolicyService.renderPolicyMessage({
    policyName: '低噪音策略',
    event: {
      sourceType: 'DOCTOR',
      eventType: 'CHECK_COMPLETED',
      severity: 'INFO',
      title: '巡检完成',
      summary: '所有检查项通过',
      workspaceId: 'ws-2',
      payload: {}
    }
  })

  assert.equal(result.subject, '[INFO] CHECK_COMPLETED')
  assert.doesNotMatch(result.body, /Target：/)
  assert.doesNotMatch(result.body, /Trace：/)
})
