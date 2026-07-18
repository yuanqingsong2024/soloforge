import { Client, ConnectConfig } from 'ssh2'
import { KeychainService } from './keychain'
import { logger } from './logger'

export interface SSHConfig {
  host: string
  port: number
  username: string
  authMode: 'password' | 'privateKey'
  workspaceId: string
  credentialKey: string // Keychain 中的凭证名称
}

export interface SSHCommandResult {
  stdout: string
  stderr: string
  exitCode: number
  success: boolean
}

export interface SSHFileUpload {
  localPath: string
  remotePath: string
}

/**
 * SSH 执行器服务
 * 用于远程命令执行、文件上传、健康检查
 */
export class SSHExecutor {
  private config: SSHConfig
  private client: Client | null = null

  constructor(config: SSHConfig) {
    this.config = config
  }

  /**
   * 连接到远程主机
   */
  async connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // 从 Keychain 读取凭证
        const credential = await KeychainService.getPassword(
          this.config.workspaceId,
          this.config.credentialKey
        )

        if (!credential) {
          throw new Error(`凭证未找到: ${this.config.credentialKey}`)
        }

        const connectConfig: ConnectConfig = {
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          readyTimeout: 30000,
          keepaliveInterval: 10000
        }

        if (this.config.authMode === 'password') {
          connectConfig.password = credential
        } else {
          connectConfig.privateKey = credential
        }

        this.client = new Client()

        this.client.on('ready', () => {
          logger.info(`SSH 连接成功: ${this.config.host}`)
          resolve()
        })

        this.client.on('error', (err) => {
          logger.error(`SSH 连接错误: ${err.message}`)
          reject(err)
        })

        this.client.connect(connectConfig)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      this.client.end()
      this.client = null
    }
  }

  /**
   * 执行远程命令
   */
  async executeCommand(command: string, timeout = 60000): Promise<SSHCommandResult> {
    if (!this.client) {
      throw new Error('SSH 未连接，请先调用 connect()')
    }

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        reject(new Error(`命令执行超时 (${timeout}ms): ${command}`))
      }, timeout)

      this.client!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(err)
          return
        }

        stream.on('close', (code: number) => {
          clearTimeout(timer)
          if (!timedOut) {
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code,
              success: code === 0
            })
          }
        })

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      })
    })
  }

  /**
   * 上传文件到远程主机
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SSH 未连接，请先调用 connect()')
    }

    return new Promise((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }

        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    })
  }

  /**
   * 从远程主机下载文件
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SSH 未连接，请先调用 connect()')
    }

    return new Promise((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }

        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    })
  }

  /**
   * 检查远程主机是否可达
   */
  async ping(): Promise<boolean> {
    try {
      await this.connect()
      const result = await this.executeCommand('echo "pong"', 5000)
      this.disconnect()
      return result.success && result.stdout === 'pong'
    } catch (error) {
      logger.error(`SSH ping 失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 检查远程主机上的 Docker 是否可用
   */
  async checkDocker(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const result = await this.executeCommand('docker --version', 10000)
      if (result.success) {
        return {
          available: true,
          version: result.stdout
        }
      } else {
        return {
          available: false,
          error: result.stderr
        }
      }
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 检查远程主机上的端口占用
   */
  async checkPort(port: number): Promise<{ inUse: boolean; process?: string }> {
    try {
      // 使用 lsof 或 netstat 检查端口
      const result = await this.executeCommand(
        `lsof -i :${port} || netstat -tuln | grep :${port}`,
        5000
      )
      
      if (result.stdout.trim()) {
        return {
          inUse: true,
          process: result.stdout.split('\n')[0]
        }
      } else {
        return { inUse: false }
      }
    } catch (error) {
      // 命令失败可能意味着端口未占用
      return { inUse: false }
    }
  }

  /**
   * 读取远程文件内容
   */
  async readFile(remotePath: string): Promise<string> {
    const result = await this.executeCommand(`cat "${remotePath}"`, 30000)
    if (!result.success) {
      throw new Error(`读取文件失败: ${result.stderr}`)
    }
    return result.stdout
  }

  /**
   * 写入远程文件
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    // 使用 heredoc 写入文件，避免特殊字符问题
    const command = `cat > "${remotePath}" << 'EOF'\n${content}\nEOF`
    const result = await this.executeCommand(command, 30000)
    if (!result.success) {
      throw new Error(`写入文件失败: ${result.stderr}`)
    }
  }

  /**
   * 创建远程目录
   */
  async mkdir(remotePath: string, recursive = true): Promise<void> {
    const flag = recursive ? '-p' : ''
    const result = await this.executeCommand(`mkdir ${flag} "${remotePath}"`, 10000)
    if (!result.success) {
      throw new Error(`创建目录失败: ${result.stderr}`)
    }
  }

  /**
   * 检查远程路径是否存在
   */
  async exists(remotePath: string): Promise<boolean> {
    const result = await this.executeCommand(`test -e "${remotePath}" && echo "exists"`, 5000)
    return result.stdout.trim() === 'exists'
  }
}
