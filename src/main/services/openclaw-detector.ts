import { exec } from 'child_process'
import { promisify } from 'util'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from './db'

const execAsync = promisify(exec)

export interface DetectionResult {
  detected: boolean
  method: 'port' | 'docker' | 'none'
  details: {
    port?: { available: boolean; latency?: number; error?: string }
    docker?: { available: boolean; running: boolean; containerName?: string; image?: string; status?: string; error?: string }
    installation?: { available: boolean; executablePath?: string; error?: string }
  }
}

export class OpenClawDetectorService {
  /**
   * 检测本地端口上的 OpenClaw 健康端点
   */
  async detectPort(
    port: number = 18789
  ): Promise<{ detected: boolean; latency?: number; error?: string }> {
    const start = Date.now()

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000)
      })
      const latency = Date.now() - start

      if (!response.ok) {
        return {
          detected: false,
          latency,
          error: `Health check failed: ${response.status} ${response.statusText}`
        }
      }

      return {
        detected: true,
        latency
      }
    } catch (error) {
      return {
        detected: false,
        error: String(error)
      }
    }
  }

  /**
   * 检测本地 Docker 中是否存在 openclaw-gateway 容器
   */
  async detectDocker(): Promise<{ detected: boolean; containerName?: string; image?: string; status?: string }> {
    try {
      const { stdout } = await execAsync(
        'docker ps -a --filter name=openclaw-gateway --format "{{.Names}}|{{.Image}}|{{.Status}}"'
      )
      const output = stdout.trim()

      if (!output) {
        return { detected: false }
      }

      const [containerName, image, status] = output.split('|')

      if (!containerName || !image) {
        return { detected: false }
      }

      return {
        detected: true,
        containerName,
        image,
        status
      }
    } catch (_error) {
      return { detected: false }
    }
  }

  /**
   * 检测本机是否存在 OpenClaw 可执行文件或常见安装痕迹
   */
  async detectInstallation(): Promise<{ detected: boolean; executablePath?: string; error?: string }> {
    const executableNames = process.platform === 'win32'
      ? ['openclaw-gateway.exe', 'openclaw-gateway.cmd']
      : ['openclaw-gateway']

    const commonPaths = process.platform === 'win32'
      ? [
          'C:\\Program Files\\OpenClaw\\openclaw-gateway.exe',
          'C:\\Program Files\\OpenClaw\\gateway.exe',
          'C:\\OpenClaw\\openclaw-gateway.exe'
        ]
      : [
          '/opt/openclaw/openclaw-gateway',
          '/opt/openclaw/gateway',
          '/usr/local/bin/openclaw-gateway',
          '/usr/bin/openclaw-gateway'
        ]

    try {
      const command = process.platform === 'win32'
        ? `where ${executableNames.join(' ')}`
        : `command -v ${executableNames[0]}`

      const { stdout } = await execAsync(command)
      const executablePath = stdout.trim().split(/\r?\n/).find(Boolean)

      if (executablePath) {
        return {
          detected: true,
          executablePath: path.normalize(executablePath)
        }
      }
    } catch (_error) {
      // 继续尝试常见安装路径
    }

    for (const candidate of commonPaths) {
      try {
        await access(candidate)
        return {
          detected: true,
          executablePath: path.normalize(candidate)
        }
      } catch (_error) {
        // 继续尝试下一个候选路径
      }
    }

    return {
      detected: false,
      error: '未发现 OpenClaw 可执行文件或常见安装路径'
    }
  }

  /**
   * 聚合检测：优先端口探测，其次 Docker 容器探测，同时回填安装痕迹
   */
  async detect(): Promise<DetectionResult> {
    const portResult = await this.detectPort()
    const installationResult = await this.detectInstallation()

    if (portResult.detected) {
      return {
        detected: true,
        method: 'port',
        details: {
          port: {
            available: true,
            latency: portResult.latency
          },
          installation: {
            available: installationResult.detected,
            executablePath: installationResult.executablePath,
            error: installationResult.error
          }
        }
      }
    }

    const dockerResult = await this.detectDocker()

    if (dockerResult.detected) {
      return {
        detected: true,
        method: 'docker',
        details: {
          port: {
            available: false,
            latency: portResult.latency,
            error: portResult.error
          },
          docker: {
            available: true,
            running: typeof dockerResult.status === 'string' ? dockerResult.status.startsWith('Up ') : true,
            containerName: dockerResult.containerName,
            image: dockerResult.image,
            status: dockerResult.status
          },
          installation: {
            available: installationResult.detected,
            executablePath: installationResult.executablePath,
            error: installationResult.error
          }
        }
      }
    }

    return {
      detected: false,
      method: 'none',
      details: {
        port: {
          available: false,
          latency: portResult.latency,
          error: portResult.error
        },
        docker: {
          available: false,
          running: false,
          error: dockerResult.detected ? undefined : '未发现运行中或已停止的 openclaw-gateway 容器'
        },
        installation: {
          available: installationResult.detected,
          executablePath: installationResult.executablePath,
          error: installationResult.error
        }
      }
    }
  }

  /**
   * 保存检测记录到数据库
   */
  async saveDetection(workspaceId: string, result: DetectionResult): Promise<string> {
    const detection = await prisma.openClawDetection.create({
      data: {
        workspaceId,
        detected: result.detected,
        detectionMethod: result.method,
        detailsJson: JSON.stringify(result.details)
      }
    })

    return detection.id
  }
}
