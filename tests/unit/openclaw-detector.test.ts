import test from 'node:test'
import assert from 'node:assert/strict'
import { OpenClawDetectorService } from '../../src/main/services/openclaw-detector'

class StubDetectorService extends OpenClawDetectorService {
  private readonly portResult: { detected: boolean; latency?: number; error?: string }
  private readonly dockerResult: { detected: boolean; containerName?: string; image?: string; status?: string }
  private readonly installationResult: { detected: boolean; executablePath?: string; error?: string }

  constructor(
    portResult: { detected: boolean; latency?: number; error?: string },
    dockerResult: { detected: boolean; containerName?: string; image?: string; status?: string },
    installationResult: { detected: boolean; executablePath?: string; error?: string } = { detected: false }
  ) {
    super()
    this.portResult = portResult
    this.dockerResult = dockerResult
    this.installationResult = installationResult
  }

  override async detectPort(): Promise<{ detected: boolean; latency?: number; error?: string }> {
    return this.portResult
  }

  override async detectDocker(): Promise<{ detected: boolean; containerName?: string; image?: string; status?: string }> {
    return this.dockerResult
  }

  override async detectInstallation(): Promise<{ detected: boolean; executablePath?: string; error?: string }> {
    return this.installationResult
  }
}

test('detect 在端口健康时优先返回 port 结果', async () => {
  const service = new StubDetectorService(
    { detected: true, latency: 42 },
    { detected: true, containerName: 'openclaw-gateway', image: 'openclaw/gateway:latest' },
    { detected: true, executablePath: '/opt/openclaw/openclaw-gateway' }
  )

  const result = await service.detect()

  assert.equal(result.detected, true)
  assert.equal(result.method, 'port')
  assert.deepEqual(result.details, {
    port: {
      available: true,
      latency: 42
    },
    installation: {
      available: true,
      executablePath: '/opt/openclaw/openclaw-gateway',
      error: undefined
    }
  })
})

test('detect 在端口失败但 Docker 存在时返回 docker 结果', async () => {
  const service = new StubDetectorService(
    { detected: false, latency: 300, error: 'ECONNREFUSED' },
    { detected: true, containerName: 'openclaw-gateway', image: 'openclaw/gateway:v1' },
    { detected: true, executablePath: '/usr/local/bin/openclaw-gateway' }
  )

  const result = await service.detect()

  assert.equal(result.detected, true)
  assert.equal(result.method, 'docker')
  assert.deepEqual(result.details, {
    port: {
      available: false,
      latency: 300,
      error: 'ECONNREFUSED'
    },
    docker: {
      available: true,
      running: true,
      containerName: 'openclaw-gateway',
      image: 'openclaw/gateway:v1',
      status: undefined
    },
    installation: {
      available: true,
      executablePath: '/usr/local/bin/openclaw-gateway',
      error: undefined
    }
  })
})

test('detect 在端口与 Docker 都失败时返回 none 结果', async () => {
  const service = new StubDetectorService(
    { detected: false, error: 'timeout' },
    { detected: false },
    { detected: false, error: '未发现 OpenClaw 可执行文件或常见安装路径' }
  )

  const result = await service.detect()

  assert.equal(result.detected, false)
  assert.equal(result.method, 'none')
  assert.deepEqual(result.details, {
    port: {
      available: false,
      latency: undefined,
      error: 'timeout'
    },
    docker: {
      available: false,
      running: false,
      error: '未发现运行中或已停止的 openclaw-gateway 容器'
    },
    installation: {
      available: false,
      executablePath: undefined,
      error: '未发现 OpenClaw 可执行文件或常见安装路径'
    }
  })
})

test('detect 在未启动但存在安装痕迹时仍返回安装信息', async () => {
  const service = new StubDetectorService(
    { detected: false, error: 'ECONNREFUSED' },
    { detected: false },
    { detected: true, executablePath: '/opt/openclaw/openclaw-gateway' }
  )

  const result = await service.detect()

  assert.equal(result.detected, false)
  assert.equal(result.method, 'none')
  assert.equal(result.details.installation?.available, true)
  assert.equal(result.details.installation?.executablePath, '/opt/openclaw/openclaw-gateway')
})
