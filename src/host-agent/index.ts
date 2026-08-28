import os from 'node:os'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type AgentActionType =
  | 'COLLECT_STATE'
  | 'COLLECT_LOGS'
  | 'RESTART_GATEWAY'
  | 'RESTART_CONTAINER'
  | 'DOCKER_COMPOSE_UP'
  | 'DOCKER_COMPOSE_RESTART'
  | 'BACKUP_OPENCLAW'
  | 'RESTORE_OPENCLAW'
  | 'APPLY_CONFIG_PATCH'
  | 'VERIFY_HEALTH'
  | 'DETECT_VERSION'
  | 'RUN_DOCTOR_CHECK'
  | 'CUSTOM_SAFE_ACTION'

interface AgentCapabilities {
  collect_state: boolean
  collect_logs: boolean
  docker_control: boolean
  openclaw_backup: boolean
  openclaw_restore: boolean
  config_patch: boolean
  restart_gateway: boolean
  verify_health: boolean
  detect_version: boolean
  doctor_checks: boolean
  allowedComposeDirectories?: string[]
  allowedContainers?: string[]
  allowedLogPaths?: string[]
}

interface RegistrationResponse {
  success: boolean
  data?: {
    hostAgentId: string
    workspaceId: string
    authToken: string
    pollIntervalSeconds: number
    heartbeatIntervalSeconds: number
    capabilities: AgentCapabilities
  }
  error?: string
}

interface PullResponse {
  success: boolean
  data: {
    id: string
    workspaceId: string
    targetId: string
    actionType: AgentActionType
    request: Record<string, unknown>
    traceId: string
    timeoutSeconds: number
  } | null
  error?: string
}

interface RunnerConfig {
  serverUrl: string
  bootstrapToken: string
  agentName: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

function detectCapabilities(): AgentCapabilities {
  return {
    collect_state: true,
    collect_logs: true,
    docker_control: true,
    openclaw_backup: false,
    openclaw_restore: false,
    config_patch: false,
    restart_gateway: true,
    verify_health: true,
    detect_version: true,
    doctor_checks: true,
    allowedComposeDirectories: process.env.SOLOFORGE_ALLOWED_COMPOSE_DIRS?.split(';').filter(Boolean) || [],
    allowedContainers: process.env.SOLOFORGE_ALLOWED_CONTAINERS?.split(',').map(item => item.trim()).filter(Boolean) || [],
    allowedLogPaths: process.env.SOLOFORGE_ALLOWED_LOG_PATHS?.split(';').filter(Boolean) || []
  }
}

class HostAgentRunner {
  private readonly config: RunnerConfig
  private hostAgentId = ''
  private authToken = ''
  private pollIntervalMs = 3_000
  private heartbeatIntervalMs = 30_000

  constructor(config: RunnerConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    await this.register()
    void this.startHeartbeatLoop()
    await this.startPullLoop()
  }

  private async register(): Promise<void> {
    const response = await fetch(`${this.config.serverUrl}/api/host-agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: this.config.bootstrapToken,
        name: this.config.agentName,
        hostname: os.hostname(),
        osType: os.platform(),
        arch: os.arch(),
        agentVersion: '0.1.0',
        capabilities: detectCapabilities(),
        labels: {
          mode: process.env.SOLOFORGE_AGENT_MODE || 'local-test',
          service: 'host-agent'
        }
      })
    })

    const json = await response.json() as RegistrationResponse
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json.error || '注册失败')
    }

    this.hostAgentId = json.data.hostAgentId
    this.authToken = json.data.authToken
    this.pollIntervalMs = json.data.pollIntervalSeconds * 1000
    this.heartbeatIntervalMs = json.data.heartbeatIntervalSeconds * 1000
    process.stdout.write(`Host Agent 注册成功: ${this.hostAgentId}\n`)
  }

  private async startHeartbeatLoop(): Promise<void> {
    while (true) {
      try {
        await this.sendHeartbeat()
      } catch (error) {
        process.stderr.write(`心跳失败: ${error instanceof Error ? error.message : String(error)}\n`)
      }
      await this.sleep(this.heartbeatIntervalMs)
    }
  }

  private async startPullLoop(): Promise<void> {
    while (true) {
      try {
        const action = await this.pullAction()
        if (action) {
          await this.executeAction(action)
        }
      } catch (error) {
        process.stderr.write(`拉取动作失败: ${error instanceof Error ? error.message : String(error)}\n`)
      }
      await this.sleep(this.pollIntervalMs)
    }
  }

  private async sendHeartbeat(): Promise<void> {
    await fetch(`${this.config.serverUrl}/api/host-agents/${this.hostAgentId}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`
      },
      body: JSON.stringify({
        status: 'ONLINE',
        capabilities: detectCapabilities(),
        heartbeat: {
          hostname: os.hostname(),
          platform: os.platform(),
          uptimeSeconds: os.uptime(),
          loadavg: os.loadavg(),
          memory: {
            total: os.totalmem(),
            free: os.freemem()
          }
        }
      })
    })
  }

  private async pullAction() {
    const response = await fetch(`${this.config.serverUrl}/api/host-agents/${this.hostAgentId}/pull`, {
      headers: {
        Authorization: `Bearer ${this.authToken}`
      }
    })
    const json = await response.json() as PullResponse
    if (!response.ok || !json.success) {
      throw new Error(json.error || '拉取失败')
    }
    return json.data
  }

  private async executeAction(action: NonNullable<PullResponse['data']>): Promise<void> {
    await this.postActionAck(action.id)

    try {
      const result = await this.runAction(action.actionType, action.request)
      await this.postActionComplete(action.id, {
        status: 'SUCCEEDED',
        result,
        logs: [{ level: 'INFO', message: `${action.actionType} 执行成功`, data: { traceId: action.traceId } }]
      })
    } catch (error) {
      await this.postActionComplete(action.id, {
        status: 'FAILED',
        errorSummary: error instanceof Error ? error.message : String(error),
        logs: [{ level: 'ERROR', message: `${action.actionType} 执行失败`, data: { error: error instanceof Error ? error.message : String(error) } }]
      })
    }
  }

  private async postActionAck(actionId: string): Promise<void> {
    await fetch(`${this.config.serverUrl}/api/host-agents/${this.hostAgentId}/actions/${actionId}/ack`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`
      }
    })
  }

  private async postActionComplete(actionId: string, payload: {
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELED'
    result?: Record<string, unknown>
    errorSummary?: string
    logs?: Array<{ level: string; message: string; data?: Record<string, unknown> }>
  }): Promise<void> {
    await fetch(`${this.config.serverUrl}/api/host-agents/${this.hostAgentId}/actions/${actionId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`
      },
      body: JSON.stringify(payload)
    })
  }

  private async runAction(actionType: AgentActionType, request: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'COLLECT_STATE':
        return this.collectState(request)
      case 'VERIFY_HEALTH':
      case 'RUN_DOCTOR_CHECK':
        return this.verifyHealth(request)
      case 'DETECT_VERSION':
        return this.detectVersion(request)
      case 'COLLECT_LOGS':
        return this.collectLogs(request)
      case 'RESTART_CONTAINER':
        return this.restartContainer(request)
      case 'RESTART_GATEWAY':
        return this.restartGateway(request)
      case 'DOCKER_COMPOSE_UP':
        return this.runDockerCompose(request, 'up')
      case 'DOCKER_COMPOSE_RESTART':
        return this.runDockerCompose(request, 'restart')
      case 'BACKUP_OPENCLAW':
        throw new Error('当前 Host Agent 尚未实现 OpenClaw 备份，动作已安全阻断')
      case 'RESTORE_OPENCLAW':
        throw new Error('当前 Host Agent 尚未实现 OpenClaw 恢复，动作已安全阻断')
      case 'APPLY_CONFIG_PATCH':
        throw new Error('当前 Host Agent 尚未实现配置补丁，动作已安全阻断')
      case 'CUSTOM_SAFE_ACTION':
        throw new Error('当前 Host Agent 不接受自定义动作，动作已安全阻断')
      default:
        throw new Error(`当前 Host Agent 不支持动作 ${actionType}，动作已安全阻断`)
    }
  }

  private async collectState(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const gatewayUrl = typeof request.gatewayUrl === 'string' ? request.gatewayUrl : 'http://127.0.0.1:18789/health'
    const health = await this.tryFetchJson(gatewayUrl)
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: os.uptime(),
      cpuCount: os.cpus().length,
      loadavg: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      },
      gatewayHealth: health,
      timestamp: new Date().toISOString()
    }
  }

  private async verifyHealth(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const gatewayUrl = typeof request.gatewayUrl === 'string' && request.gatewayUrl.length > 0
      ? request.gatewayUrl
      : 'http://127.0.0.1:18789/health'
    try {
      const response = await fetch(gatewayUrl)
      const text = await response.text()
      return {
        healthy: response.ok,
        statusCode: response.status,
        body: text.slice(0, 2000)
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async detectVersion(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const containerName = typeof request.containerName === 'string' ? request.containerName : 'openclaw-gateway'
    try {
      const { stdout } = await execFileAsync('docker', ['inspect', '--format={{.Config.Image}}', containerName])
      return { component: 'DOCKER_IMAGE', version: stdout.trim(), containerName }
    } catch {
      const health = await this.verifyHealth(request)
      return {
        component: 'GATEWAY',
        version: typeof health.body === 'string' && health.body ? health.body : 'unknown',
        source: 'health'
      }
    }
  }

  private async collectLogs(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const logPath = typeof request.logPath === 'string' ? request.logPath : ''
    const allowedPaths = detectCapabilities().allowedLogPaths || []
    if (!logPath || !allowedPaths.some(prefix => logPath.startsWith(prefix))) {
      throw new Error('日志路径不在 allowlist 中')
    }

    const fs = await import('node:fs/promises')
    const content = await fs.readFile(logPath, 'utf-8')
    return {
      logPath,
      logs: content.slice(-20_000)
    }
  }

  private async restartContainer(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const containerName = typeof request.containerName === 'string' ? request.containerName : ''
    const allowedContainers = detectCapabilities().allowedContainers || []
    if (!containerName || !allowedContainers.includes(containerName)) {
      throw new Error('容器不在 allowlist 中')
    }
    await execFileAsync('docker', ['restart', containerName])
    return { restarted: true, containerName }
  }

  private async restartGateway(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const containerName = typeof request.containerName === 'string' ? request.containerName : 'openclaw-gateway'
    return this.restartContainer({ containerName })
  }

  private async runDockerCompose(request: Record<string, unknown>, mode: 'up' | 'restart'): Promise<Record<string, unknown>> {
    const composeDir = typeof request.composeDir === 'string' ? request.composeDir : ''
    const allowedComposeDirectories = detectCapabilities().allowedComposeDirectories || []
    if (!composeDir || !allowedComposeDirectories.includes(composeDir)) {
      throw new Error('compose 目录不在 allowlist 中')
    }

    const args = mode === 'up' ? ['compose', 'up', '-d'] : ['compose', 'restart']
    await execFileAsync('docker', args, { cwd: composeDir })
    return { ok: true, mode, composeDir }
  }

  private async tryFetchJson(url: string): Promise<unknown> {
    try {
      const response = await fetch(url)
      const text = await response.text()
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

async function main(): Promise<void> {
  const config: RunnerConfig = {
    serverUrl: requireEnv('SOLOFORGE_SERVER_URL'),
    bootstrapToken: requireEnv('SOLOFORGE_BOOTSTRAP_TOKEN'),
    agentName: process.env.SOLOFORGE_AGENT_NAME || 'soloforge-host-agent'
  }

  const runner = new HostAgentRunner(config)
  await runner.start()
}

void main().catch(error => {
  process.stderr.write(`Host Agent 启动失败: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
