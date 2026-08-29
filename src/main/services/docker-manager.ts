import Docker from 'dockerode'
import { SSHExecutor, SSHConfig } from './ssh-executor'
import * as yaml from 'js-yaml'

export interface DockerConfig {
  mode: 'local' | 'remote'
  sshConfig?: SSHConfig // 远程模式需要
}

export interface ComposeConfig {
  version: string
  services: Record<string, any>
  networks?: Record<string, any>
  volumes?: Record<string, any>
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: Array<{ private: number; public?: number }>
}

/**
 * Docker 管理服务
 * 支持本地和远程 Docker 操作
 */
export class DockerManager {
  private config: DockerConfig
  private docker: Docker | null = null
  private sshExecutor: SSHExecutor | null = null

  constructor(config: DockerConfig) {
    this.config = config
    if (config.mode === 'local') {
      this.docker = new Docker()
    } else if (config.mode === 'remote' && config.sshConfig) {
      this.sshExecutor = new SSHExecutor(config.sshConfig)
    }
  }

  /**
   * 生成 OpenClaw Gateway 的 docker-compose.yml
   */
  generateOpenClawCompose(options: {
    port?: number
    image?: string
    envVars?: Record<string, string>
  }): string {
    const { port = 18789, image = 'openclaw/gateway:latest', envVars = {} } = options

    const compose: ComposeConfig = {
      version: '3.8',
      services: {
        'openclaw-gateway': {
          image,
          container_name: 'openclaw-gateway',
          ports: [`${port}:${port}`],
          environment: {
            PORT: String(port),
            ...envVars
          },
          restart: 'unless-stopped',
          healthcheck: {
            test: ['CMD', 'curl', '-f', `http://localhost:${port}/health`],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '40s'
          }
        }
      }
    }

    return yaml.dump(compose)
  }

  /**
   * 本地：启动容器（通过 compose）
   */
  async startLocal(composeContent: string, projectName: string): Promise<void> {
    if (this.config.mode !== 'local') {
      throw new Error('此方法仅支持本地模式')
    }

    // 写入临时 compose 文件
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soloforge-'))
    const composePath = path.join(tmpDir, 'docker-compose.yml')
    await fs.writeFile(composePath, composeContent, 'utf-8')

    // 使用 docker compose 命令
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      await execAsync(`docker compose -f "${composePath}" -p ${projectName} up -d`)
    } finally {
      // 清理临时文件
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  }

  /**
   * 远程：启动容器（通过 SSH + compose）
   */
  async startRemote(composeContent: string, projectName: string, remotePath: string): Promise<void> {
    if (this.config.mode !== 'remote' || !this.sshExecutor) {
      throw new Error('此方法仅支持远程模式')
    }

    await this.sshExecutor.connect()

    try {
      // 创建远程目录
      const remoteDir = remotePath || `/tmp/soloforge-${projectName}`
      await this.sshExecutor.mkdir(remoteDir, true)

      // 写入 compose 文件
      const composeFilePath = `${remoteDir}/docker-compose.yml`
      await this.sshExecutor.writeFile(composeFilePath, composeContent)

      // 启动容器
      const result = await this.sshExecutor.executeCommand(
        `cd "${remoteDir}" && docker compose -p ${projectName} up -d`,
        60000
      )

      if (!result.success) {
        throw new Error(`启动容器失败: ${result.stderr}`)
      }
    } finally {
      this.sshExecutor.disconnect()
    }
  }

  /**
   * 停止容器
   */
  async stop(projectName: string): Promise<void> {
    if (this.config.mode === 'local') {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`docker compose -p ${projectName} down`)
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        await this.sshExecutor.executeCommand(`docker compose -p ${projectName} down`, 30000)
      } finally {
        this.sshExecutor.disconnect()
      }
    }
  }

  /**
   * 重启容器
   */
  async restart(projectName: string): Promise<void> {
    if (this.config.mode === 'local') {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`docker compose -p ${projectName} restart`)
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        await this.sshExecutor.executeCommand(`docker compose -p ${projectName} restart`, 30000)
      } finally {
        this.sshExecutor.disconnect()
      }
    }
  }

  /**
   * 获取容器日志
   */
  async getLogs(containerName: string, tail = 100): Promise<string> {
    if (this.config.mode === 'local') {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { stdout } = await execAsync(`docker logs ${containerName} --tail ${tail}`)
      return stdout
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        const result = await this.sshExecutor.executeCommand(
          `docker logs ${containerName} --tail ${tail}`,
          30000
        )
        return result.stdout
      } finally {
        this.sshExecutor.disconnect()
      }
    }
    return ''
  }

  /**
   * 列出容器
   */
  async listContainers(projectName?: string): Promise<ContainerInfo[]> {
    if (this.config.mode === 'local' && this.docker) {
      const containers = await this.docker.listContainers({ all: true })
      return containers
        .filter(c => !projectName || c.Labels['com.docker.compose.project'] === projectName)
        .map(c => ({
          id: c.Id,
          name: c.Names[0]?.replace(/^\//, '') || '',
          image: c.Image,
          status: c.Status,
          state: c.State,
          ports: c.Ports.map(p => ({
            private: p.PrivatePort,
            public: p.PublicPort
          }))
        }))
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        const filter = projectName ? `--filter "label=com.docker.compose.project=${projectName}"` : ''
        const result = await this.sshExecutor.executeCommand(
          `docker ps -a ${filter} --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}"`,
          30000
        )
        
        return result.stdout.split('\n').filter(Boolean).map(line => {
          const [id, name, image, status, state] = line.split('|')
          return {
            id,
            name,
            image,
            status,
            state,
            ports: [] // 简化版，不解析端口
          }
        })
      } finally {
        this.sshExecutor.disconnect()
      }
    }
    return []
  }

  /**
   * 检查容器健康状态
   */
  async checkHealth(containerName: string): Promise<{ healthy: boolean; status?: string }> {
    if (this.config.mode === 'local' && this.docker) {
      try {
        const container = this.docker.getContainer(containerName)
        const info = await container.inspect()
        const health = info.State.Health
        
        if (health) {
          return {
            healthy: health.Status === 'healthy',
            status: health.Status
          }
        } else {
          // 没有健康检查，检查运行状态
          return {
            healthy: info.State.Running,
            status: info.State.Status
          }
        }
      } catch (error) {
        return { healthy: false, status: 'not_found' }
      }
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        const result = await this.sshExecutor.executeCommand(
          `docker inspect --format='{{.State.Health.Status}}|{{.State.Status}}' ${containerName}`,
          10000
        )
        
        if (result.success) {
          const [healthStatus, stateStatus] = result.stdout.split('|')
          return {
            healthy: healthStatus === 'healthy' || (healthStatus === '<no value>' && stateStatus === 'running'),
            status: healthStatus !== '<no value>' ? healthStatus : stateStatus
          }
        } else {
          return { healthy: false, status: 'not_found' }
        }
      } finally {
        this.sshExecutor.disconnect()
      }
    }
    return { healthy: false }
  }

  /**
   * 拉取镜像
   */
  async pullImage(imageName: string): Promise<void> {
    if (this.config.mode === 'local' && this.docker) {
      await new Promise((resolve, reject) => {
        this.docker!.pull(imageName, (err: unknown, stream: unknown) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
            return
          }
          this.docker!.modem.followProgress(stream as NodeJS.ReadableStream, (err: unknown) => {
            if (err) reject(err instanceof Error ? err : new Error(String(err)))
            else resolve(undefined)
          })
        })
      })
    } else if (this.sshExecutor) {
      await this.sshExecutor.connect()
      try {
        const result = await this.sshExecutor.executeCommand(
          `docker pull ${imageName}`,
          300000 // 5 分钟超时
        )
        if (!result.success) {
          throw new Error(`拉取镜像失败: ${result.stderr}`)
        }
      } finally {
        this.sshExecutor.disconnect()
      }
    }
  }
}
