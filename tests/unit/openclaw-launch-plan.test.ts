import test from 'node:test'
import assert from 'node:assert/strict'

function buildLocalOpenClawStartCommand(options: { executablePath?: string; port: number }): { command: string; workDir?: string } {
  const executablePath = options.executablePath || ''
  const workDir = executablePath ? executablePath.split('/').slice(0, -1).join('/') : undefined

  if (workDir) {
    return {
      command: `cd "${workDir}" && nohup ./openclaw-gateway --port ${options.port} > gateway.log 2>&1 &`,
      workDir
    }
  }

  return {
    command: `nohup openclaw-gateway --port ${options.port} > gateway.log 2>&1 &`
  }
}

test('本机启动命令会基于安装路径生成工作目录', () => {
  const result = buildLocalOpenClawStartCommand({
    executablePath: '/opt/openclaw/openclaw-gateway',
    port: 18789
  })

  assert.equal(result.workDir, '/opt/openclaw')
  assert.equal(result.command, 'cd "/opt/openclaw" && nohup ./openclaw-gateway --port 18789 > gateway.log 2>&1 &')
})

test('本机启动命令在没有路径时使用默认命令', () => {
  const result = buildLocalOpenClawStartCommand({ port: 18789 })

  assert.equal(result.workDir, undefined)
  assert.equal(result.command, 'nohup openclaw-gateway --port 18789 > gateway.log 2>&1 &')
})
