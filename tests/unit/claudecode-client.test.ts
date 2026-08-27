import assert from 'node:assert/strict'
import test from 'node:test'
import { ClaudeCodeClient } from '../../src/main/services/claudecode-client'

test('ClaudeCodeClient 应从真实配置接口获取快照', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ config: { model: 'test' }, hash: 'h1' }), { status: 200 })
  try {
    const client = new ClaudeCodeClient('http://127.0.0.1:18789/')
    const snapshot = await client.getConfigSnapshot('trace-1')
    assert.deepEqual(snapshot.config, { model: 'test' })
    assert.equal(snapshot.hash, 'h1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ClaudeCodeClient 接口失败时不返回伪成功', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('denied', { status: 401, statusText: 'Unauthorized' })
  try {
    const client = new ClaudeCodeClient('http://127.0.0.1:18789')
    await assert.rejects(() => client.applyConfig({ model: 'test' }, 'trace-2'), /Claude Code 请求失败: 401/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ClaudeCodeClient 缺少 diff 时拒绝应用变更', async () => {
  const client = new ClaudeCodeClient('http://127.0.0.1:18789')
  await assert.rejects(() => client.applyChangeRequest({ traceId: 'trace-3' }), /变更请求缺少 diff 内容/)
})
