import { SSHExecutor, SSHConfig } from './ssh-executor'
import { DockerManager } from './docker-manager'

export interface DeploymentTemplate {
  name: string
  type: 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
  description: string
  precheck: () => Promise<PrecheckResult>
  install: (options: InstallOptions) => Promise<InstallResult>
  start: (options: ServiceOptions) => Promise<ServiceResult>
  stop: (options: ServiceOptions) => Promise<ServiceResult>
  restart: (options: ServiceOptions) => Promise<ServiceResult>
  upgrade: (options: UpgradeOptions) => Promise<ServiceResult>
  healthCheck: (options: ServiceOptions) => Promise<HealthCheckResult>
  getLogs: (options: LogOptions) => Promise<string>
}

export interface PrecheckResult {
  success: boolean
  checks: Array<{
    name: string
    passed: boolean
    message: string
  }>
}

export interface InstallOptions {
  port?: number
  version?: string
  envVars?: Record<string, string>
  workDir?: string
  sshConfig?: SSHConfig
  projectName?: string
}

export interface InstallResult {
  success: boolean
  message: string
  details?: string
}

export interface ServiceOptions {
  port?: number
  workDir?: string
  sshConfig?: SSHConfig
  projectName?: string
}

export interface ServiceResult {
  success: boolean
  message: string
}

export interface UpgradeOptions extends ServiceOptions {
  version: string
}

export interface LogOptions extends ServiceOptions {
  tail?: number
}

export interface HealthCheckResult {
  healthy: boolean
  status: string
  details?: string
}

/**
 * 本地原生部署模板
 */
export class LocalHostTemplate implements DeploymentTemplate {
  name = 'Local Native'
  type = 'LOCAL_HOST' as const
  description = '本地原生进程部署 OpenClaw Gateway'

  async precheck(): Promise<PrecheckResult> {
    const checks = []

    // 检查 Node.js
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { stdout } = await execAsync('node --version')
      checks.push({
        name: 'Node.js',
        passed: true,
        message: `已安装: ${stdout.trim()}`
      })
    } catch (error) {
      checks.push({
        name: 'Node.js',
        passed: false,
        message: 'Node.js 未安装或不在 PATH 中'
      })
    }

    // 检查端口占用
    const port = 18789
    try {
      const net = await import('net')
      const server = net.createServer()
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.once('listening', () => {
          server.close()
          resolve(undefined)
        })
        server.listen(port)
      })
      checks.push({
        name: `端口 ${port}`,
        passed: true,
        message: '端口可用'
      })
    } catch (error) {
      checks.push({
        name: `端口 ${port}`,
        passed: false,
        message: `端口 ${port} 已被占用`
      })
    }

    return {
      success: checks.every(c => c.passed),
      checks
    }
  }

  async install(_options: InstallOptions): Promise<InstallResult> {
    // 本地原生安装（简化版，实际应下载并安装 OpenClaw）
    return {
      success: true,
      message: '本地原生安装需要手动下载 OpenClaw 二进制文件',
      details: '请访问 OpenClaw 官网下载对应平台的二进制文件'
    }
  }

  async start(_options: ServiceOptions): Promise<ServiceResult> {
    // 本地原生启动（简化版）
    return {
      success: false,
      message: '本地原生启动需要手动执行 OpenClaw 二进制文件'
    }
  }

  async stop(_options: ServiceOptions): Promise<ServiceResult> {
    return {
      success: false,
      message: '本地原生停止需要手动终止进程'
    }
  }

  async restart(_options: ServiceOptions): Promise<ServiceResult> {
    return {
      success: false,
      message: '本地原生重启需要手动操作'
    }
  }

  async upgrade(_options: UpgradeOptions): Promise<ServiceResult> {
    return {
      success: false,
      message: '本地原生升级需要手动下载新版本'
    }
  }

  async healthCheck(options: ServiceOptions): Promise<HealthCheckResult> {
    const port = options.port || 18789
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(5000)
      })
      return {
        healthy: response.ok,
        status: response.ok ? 'healthy' : 'unhealthy',
        details: `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        healthy: false,
        status: 'unreachable',
        details: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async getLogs(_options: LogOptions): Promise<string> {
    return '本地原生模式暂不支持日志查看，请查看进程输出'
  }
}

/**
 * 本地 Docker 部署模板
 */
export class LocalDockerTemplate implements DeploymentTemplate {
  name = 'Local Docker'
  type = 'LOCAL_DOCKER' as const
  description = '本地 Docker Compose 部署 OpenClaw Gateway'

  async precheck(): Promise<PrecheckResult> {
    const checks = []

    // 检查 Docker
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { stdout } = await execAsync('docker --version')
      checks.push({
        name: 'Docker',
        passed: true,
        message: `已安装: ${stdout.trim()}`
      })
    } catch (error) {
      checks.push({
        name: 'Docker',
        passed: false,
        message: 'Docker 未安装或未启动'
      })
    }

    // 检查 Docker Compose
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { stdout } = await execAsync('docker compose version')
      checks.push({
        name: 'Docker Compose',
        passed: true,
        message: `已安装: ${stdout.trim()}`
      })
    } catch (error) {
      checks.push({
        name: 'Docker Compose',
        passed: false,
        message: 'Docker Compose 未安装'
      })
    }

    return {
      success: checks.every(c => c.passed),
      checks
    }
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    const dockerManager = new DockerManager({ mode: 'local' })
    const composeContent = dockerManager.generateOpenClawCompose({
      port: options.port || 18789,
      image: options.version ? `openclaw/gateway:${options.version}` : 'openclaw/gateway:latest',
      envVars: options.envVars
    })

    try {
      await dockerManager.startLocal(composeContent, options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: 'OpenClaw Gateway 已通过 Docker Compose 启动',
        details: composeContent
      }
    } catch (error) {
      return {
        success: false,
        message: '启动失败',
        details: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async start(options: ServiceOptions): Promise<ServiceResult> {
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`docker compose -p ${options.projectName || 'openclaw-gateway'} start`)
      return {
        success: true,
        message: '服务已启动'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async stop(options: ServiceOptions): Promise<ServiceResult> {
    const dockerManager = new DockerManager({ mode: 'local' })
    try {
      await dockerManager.stop(options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: '服务已停止'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async restart(options: ServiceOptions): Promise<ServiceResult> {
    const dockerManager = new DockerManager({ mode: 'local' })
    try {
      await dockerManager.restart(options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: '服务已重启'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async upgrade(options: UpgradeOptions): Promise<ServiceResult> {
    const dockerManager = new DockerManager({ mode: 'local' })
    try {
      // 拉取新镜像
      await dockerManager.pullImage(`openclaw/gateway:${options.version}`)
      // 重新创建容器
      await dockerManager.stop(options.projectName || 'openclaw-gateway')
      const composeContent = dockerManager.generateOpenClawCompose({
        port: options.port || 18789,
        image: `openclaw/gateway:${options.version}`
      })
      await dockerManager.startLocal(composeContent, options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: `已升级到版本 ${options.version}`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async healthCheck(_options: ServiceOptions): Promise<HealthCheckResult> {
    const dockerManager = new DockerManager({ mode: 'local' })
    try {
      const result = await dockerManager.checkHealth('openclaw-gateway')
      return {
        healthy: result.healthy,
        status: result.status || 'unknown'
      }
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        details: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async getLogs(options: LogOptions): Promise<string> {
    const dockerManager = new DockerManager({ mode: 'local' })
    return await dockerManager.getLogs('openclaw-gateway', options.tail || 100)
  }
}

/**
 * 远程 SSH 部署模板
 */
export class RemoteHostTemplate implements DeploymentTemplate {
  name = 'Remote SSH'
  type = 'REMOTE_HOST' as const
  description = '通过 SSH 远程部署 OpenClaw Gateway（原生进程）'

  async precheck(): Promise<PrecheckResult> {
    // 需要 SSH 配置
    return {
      success: false,
      checks: [{
        name: 'SSH 配置',
        passed: false,
        message: '需要提供 SSH 配置'
      }]
    }
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    if (!options.sshConfig) {
      return {
        success: false,
        message: '缺少 SSH 配置'
      }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()

      // 检查 Node.js
      const nodeCheck = await ssh.executeCommand('node --version')
      if (!nodeCheck.success) {
        return {
          success: false,
          message: '远程主机未安装 Node.js'
        }
      }

      // 创建工作目录
      const workDir = options.workDir || '/opt/openclaw'
      await ssh.mkdir(workDir, true)

      return {
        success: true,
        message: '远程环境检查通过，请手动上传 OpenClaw 二进制文件',
        details: `工作目录: ${workDir}`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async start(options: ServiceOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const workDir = options.workDir || '/opt/openclaw'
      const port = options.port || 18789
      
      // 启动服务（后台运行）
      const result = await ssh.executeCommand(
        `cd ${workDir} && nohup ./openclaw-gateway --port ${port} > gateway.log 2>&1 &`,
        10000
      )

      return {
        success: result.success,
        message: result.success ? '服务已启动' : result.stderr
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async stop(options: ServiceOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const port = options.port || 18789
      
      // 查找并终止进程
      await ssh.executeCommand(
        `pkill -f "openclaw-gateway.*--port ${port}"`,
        10000
      )
      return {
        success: true,
        message: '服务已停止'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async restart(options: ServiceOptions): Promise<ServiceResult> {
    const stopResult = await this.stop(options)
    if (!stopResult.success) {
      return stopResult
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
    return await this.start(options)
  }

  async upgrade(_options: UpgradeOptions): Promise<ServiceResult> {
    return {
      success: false,
      message: '远程原生升级需要手动上传新版本二进制文件'
    }
  }

  async healthCheck(options: ServiceOptions): Promise<HealthCheckResult> {
    if (!options.sshConfig) {
      return { healthy: false, status: 'error', details: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const port = options.port || 18789
      
      const result = await ssh.executeCommand(
        `curl -f http://localhost:${port}/health`,
        5000
      )

      return {
        healthy: result.success,
        status: result.success ? 'healthy' : 'unhealthy',
        details: result.success ? result.stdout : result.stderr
      }
    } catch (error) {
      return {
        healthy: false,
        status: 'unreachable',
        details: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async getLogs(options: LogOptions): Promise<string> {
    if (!options.sshConfig) {
      return '缺少 SSH 配置'
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const workDir = options.workDir || '/opt/openclaw'
      const tail = options.tail || 100
      
      const result = await ssh.executeCommand(
        `tail -n ${tail} ${workDir}/gateway.log`,
        10000
      )

      return result.success ? result.stdout : result.stderr
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      ssh.disconnect()
    }
  }
}

/**
 * 远程 Docker 部署模板
 */
export class RemoteDockerTemplate implements DeploymentTemplate {
  name = 'Remote Docker'
  type = 'REMOTE_DOCKER' as const
  description = '通过 SSH 远程部署 OpenClaw Gateway（Docker Compose）'

  async precheck(): Promise<PrecheckResult> {
    // 需要 SSH 配置
    return {
      success: false,
      checks: [{
        name: 'SSH 配置',
        passed: false,
        message: '需要提供 SSH 配置'
      }]
    }
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    if (!options.sshConfig) {
      return {
        success: false,
        message: '缺少 SSH 配置'
      }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    const dockerManager = new DockerManager({
      mode: 'remote',
      sshConfig: options.sshConfig
    })

    try {
      await ssh.connect()

      // 检查 Docker
      const dockerCheck = await ssh.checkDocker()
      if (!dockerCheck.available) {
        return {
          success: false,
          message: '远程主机未安装 Docker 或 Docker 未启动',
          details: dockerCheck.error
        }
      }

      ssh.disconnect()

      // 生成并部署 compose
      const composeContent = dockerManager.generateOpenClawCompose({
        port: options.port || 18789,
        image: options.version ? `openclaw/gateway:${options.version}` : 'openclaw/gateway:latest',
        envVars: options.envVars
      })

      const workDir = options.workDir || '/opt/openclaw'
      await dockerManager.startRemote(
        composeContent,
        options.projectName || 'openclaw-gateway',
        workDir
      )

      return {
        success: true,
        message: 'OpenClaw Gateway 已通过远程 Docker Compose 启动',
        details: composeContent
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async start(options: ServiceOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const result = await ssh.executeCommand(
        `docker compose -p ${options.projectName || 'openclaw-gateway'} start`,
        30000
      )

      return {
        success: result.success,
        message: result.success ? '服务已启动' : result.stderr
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async stop(options: ServiceOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const dockerManager = new DockerManager({
      mode: 'remote',
      sshConfig: options.sshConfig
    })

    try {
      await dockerManager.stop(options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: '服务已停止'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async restart(options: ServiceOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const dockerManager = new DockerManager({
      mode: 'remote',
      sshConfig: options.sshConfig
    })

    try {
      await dockerManager.restart(options.projectName || 'openclaw-gateway')
      return {
        success: true,
        message: '服务已重启'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async upgrade(options: UpgradeOptions): Promise<ServiceResult> {
    if (!options.sshConfig) {
      return { success: false, message: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    const dockerManager = new DockerManager({
      mode: 'remote',
      sshConfig: options.sshConfig
    })

    try {
      // 拉取新镜像
      await ssh.connect()
      await ssh.executeCommand(`docker pull openclaw/gateway:${options.version}`, 300000)
      ssh.disconnect()

      // 重新创建容器
      await dockerManager.stop(options.projectName || 'openclaw-gateway')
      
      const composeContent = dockerManager.generateOpenClawCompose({
        port: options.port || 18789,
        image: `openclaw/gateway:${options.version}`
      })

      const workDir = options.workDir || '/opt/openclaw'
      await dockerManager.startRemote(
        composeContent,
        options.projectName || 'openclaw-gateway',
        workDir
      )

      return {
        success: true,
        message: `已升级到版本 ${options.version}`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async healthCheck(options: ServiceOptions): Promise<HealthCheckResult> {
    if (!options.sshConfig) {
      return { healthy: false, status: 'error', details: '缺少 SSH 配置' }
    }

    const ssh = new SSHExecutor(options.sshConfig)
    try {
      await ssh.connect()
      const result = await ssh.executeCommand(
        `docker inspect --format='{{.State.Health.Status}}|{{.State.Status}}' openclaw-gateway`,
        10000
      )

      if (result.success) {
        const [healthStatus, stateStatus] = result.stdout.split('|')
        return {
          healthy: healthStatus === 'healthy' || (healthStatus === '<no value>' && stateStatus === 'running'),
          status: healthStatus !== '<no value>' ? healthStatus : stateStatus
        }
      } else {
        return {
          healthy: false,
          status: 'not_found',
          details: result.stderr
        }
      }
    } catch (error) {
      return {
        healthy: false,
        status: 'unreachable',
        details: error instanceof Error ? error.message : String(error)
      }
    } finally {
      ssh.disconnect()
    }
  }

  async getLogs(options: LogOptions): Promise<string> {
    if (!options.sshConfig) {
      return '缺少 SSH 配置'
    }

    const dockerManager = new DockerManager({
      mode: 'remote',
      sshConfig: options.sshConfig
    })

    try {
      return await dockerManager.getLogs('openclaw-gateway', options.tail || 100)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 部署模板工厂
 */
export class DeploymentTemplateFactory {
  static getTemplate(type: 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'): DeploymentTemplate {
    switch (type) {
      case 'LOCAL_HOST':
        return new LocalHostTemplate()
      case 'LOCAL_DOCKER':
        return new LocalDockerTemplate()
      case 'REMOTE_HOST':
        return new RemoteHostTemplate()
      case 'REMOTE_DOCKER':
        return new RemoteDockerTemplate()
      default:
        throw new Error(`未知的部署类型: ${type}`)
    }
  }

  static getAllTemplates(): DeploymentTemplate[] {
    return [
      new LocalHostTemplate(),
      new LocalDockerTemplate(),
      new RemoteHostTemplate(),
      new RemoteDockerTemplate()
    ]
  }
}
