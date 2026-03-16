/**
 * 统一执行器接口
 * 为所有执行器（OpenClaw/SSH/Docker/HostAgent）提供统一的调用接口
 */

import { OperationResult, ErrorType, success, failure, fromError } from './error-types'
import { logger } from './logger'
import { OpenClawClient, ConnectionProfile } from './openclaw-client'
import { SSHExecutor, SSHConfig, SSHCommandResult } from './ssh-executor'
import { DockerManager, DockerConfig } from './docker-manager'

/**
 * 执行器类型
 */
export enum ExecutorType {
  OPENCLAW = 'OPENCLAW',
  SSH = 'SSH',
  DOCKER = 'DOCKER',
  HOST_AGENT = 'HOST_AGENT'
}

/**
 * 执行器配置
 */
export type ExecutorConfig =
  | { type: ExecutorType.OPENCLAW; profile: ConnectionProfile }
  | { type: ExecutorType.SSH; config: SSHConfig }
  | { type: ExecutorType.DOCKER; config: DockerConfig }
  | { type: ExecutorType.HOST_AGENT; agentId: string }

/**
 * 统一的命令执行请求
 */
export interface ExecuteCommandRequest {
  command: string
  timeout?: number
  workingDir?: string
  env?: Record<string, string>
}

/**
 * 统一的命令执行结果
 */
export interface ExecuteCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * 统一的健康检查结果
 */
export interface HealthCheckResult {
  healthy: boolean
  latency?: number
  version?: string
  details?: Record<string, unknown>
}

/**
 * 统一执行器接口
 */
export interface IExecutor {
  /**
   * 连接到目标
   */
  connect(): Promise<OperationResult<void>>

  /**
   * 断开连接
   */
  disconnect(): Promise<OperationResult<void>>

  /**
   * 执行命令
   */
  executeCommand(request: ExecuteCommandRequest): Promise<OperationResult<ExecuteCommandResult>>

  /**
   * 健康检查
   */
  healthCheck(): Promise<OperationResult<HealthCheckResult>>

  /**
   * 获取执行器类型
   */
  getType(): ExecutorType
}

/**
 * OpenClaw 执行器适配器
 */
export class OpenClawExecutor implements IExecutor {
  private client: OpenClawClient
  private traceId?: string

  constructor(profile: ConnectionProfile, traceId?: string) {
    this.client = new OpenClawClient(profile)
    this.traceId = traceId
  }

  async connect(): Promise<OperationResult<void>> {
    try {
      logger.debug('OpenClaw 执行器连接中', 'OpenClawExecutor', undefined, this.traceId)
      await this.client.connect()
      logger.info('OpenClaw 执行器连接成功', 'OpenClawExecutor', undefined, this.traceId)
      return success()
    } catch (error) {
      logger.error('OpenClaw 执行器连接失败', 'OpenClawExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  async disconnect(): Promise<OperationResult<void>> {
    try {
      this.client.disconnect()
      logger.debug('OpenClaw 执行器已断开', 'OpenClawExecutor', undefined, this.traceId)
      return success()
    } catch (error) {
      logger.error('OpenClaw 执行器断开失败', 'OpenClawExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  async executeCommand(_request: ExecuteCommandRequest): Promise<OperationResult<ExecuteCommandResult>> {
    // OpenClaw 不支持直接命令执行
    return failure(ErrorType.NOT_SUPPORTED, 'OpenClaw 不支持直接命令执行')
  }

  async healthCheck(): Promise<OperationResult<HealthCheckResult>> {
    try {
      logger.debug('OpenClaw 健康检查中', 'OpenClawExecutor', undefined, this.traceId)
      const result = await this.client.ping()
      
      if (result.success) {
        logger.info('OpenClaw 健康检查成功', 'OpenClawExecutor', { latency: result.latency }, this.traceId)
        return success({
          healthy: true,
          latency: result.latency
        })
      } else {
        logger.warn('OpenClaw 健康检查失败', 'OpenClawExecutor', { error: result.error }, this.traceId)
        return failure(ErrorType.RESOURCE_UNAVAILABLE, result.error || 'OpenClaw 不可达')
      }
    } catch (error) {
      logger.error('OpenClaw 健康检查异常', 'OpenClawExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  getType(): ExecutorType {
    return ExecutorType.OPENCLAW
  }

  /**
   * 获取原始客户端（用于特定操作）
   */
  getClient(): OpenClawClient {
    return this.client
  }
}

/**
 * SSH 执行器适配器
 */
export class SSHExecutorAdapter implements IExecutor {
  private executor: SSHExecutor
  private traceId?: string
  private connected = false

  constructor(config: SSHConfig, traceId?: string) {
    this.executor = new SSHExecutor(config)
    this.traceId = traceId
  }

  async connect(): Promise<OperationResult<void>> {
    try {
      logger.debug('SSH 执行器连接中', 'SSHExecutor', undefined, this.traceId)
      await this.executor.connect()
      this.connected = true
      logger.info('SSH 执行器连接成功', 'SSHExecutor', undefined, this.traceId)
      return success()
    } catch (error) {
      logger.error('SSH 执行器连接失败', 'SSHExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  async disconnect(): Promise<OperationResult<void>> {
    try {
      this.executor.disconnect()
      this.connected = false
      logger.debug('SSH 执行器已断开', 'SSHExecutor', undefined, this.traceId)
      return success()
    } catch (error) {
      logger.error('SSH 执行器断开失败', 'SSHExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  async executeCommand(request: ExecuteCommandRequest): Promise<OperationResult<ExecuteCommandResult>> {
    try {
      if (!this.connected) {
        const connectResult = await this.connect()
        if (!connectResult.success) {
          return connectResult as OperationResult<ExecuteCommandResult>
        }
      }

      logger.debug('SSH 执行命令', 'SSHExecutor', { command: request.command }, this.traceId)
      
      const result: SSHCommandResult = await this.executor.executeCommand(
        request.command,
        request.timeout
      )

      if (result.success) {
        logger.info('SSH 命令执行成功', 'SSHExecutor', { exitCode: result.exitCode }, this.traceId)
        return success({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        })
      } else {
        logger.warn('SSH 命令执行失败', 'SSHExecutor', { exitCode: result.exitCode, stderr: result.stderr }, this.traceId)
        return failure(
          ErrorType.EXECUTION_FAILED,
          `命令执行失败 (exit code: ${result.exitCode})`,
          { stdout: result.stdout, stderr: result.stderr }
        )
      }
    } catch (error) {
      logger.error('SSH 命令执行异常', 'SSHExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  async healthCheck(): Promise<OperationResult<HealthCheckResult>> {
    try {
      logger.debug('SSH 健康检查中', 'SSHExecutor', undefined, this.traceId)
      const start = Date.now()
      const isHealthy = await this.executor.ping()
      const latency = Date.now() - start

      if (isHealthy) {
        logger.info('SSH 健康检查成功', 'SSHExecutor', { latency }, this.traceId)
        return success({ healthy: true, latency })
      } else {
        logger.warn('SSH 健康检查失败', 'SSHExecutor', undefined, this.traceId)
        return failure(ErrorType.RESOURCE_UNAVAILABLE, 'SSH 主机不可达')
      }
    } catch (error) {
      logger.error('SSH 健康检查异常', 'SSHExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  getType(): ExecutorType {
    return ExecutorType.SSH
  }

  /**
   * 获取原始执行器（用于特定操作）
   */
  getExecutor(): SSHExecutor {
    return this.executor
  }
}

/**
 * Docker 执行器适配器
 */
export class DockerExecutorAdapter implements IExecutor {
  private manager: DockerManager
  private traceId?: string

  constructor(config: DockerConfig, traceId?: string) {
    this.manager = new DockerManager(config)
    this.traceId = traceId
  }

  async connect(): Promise<OperationResult<void>> {
    // Docker 不需要显式连接
    logger.debug('Docker 执行器就绪', 'DockerExecutor', undefined, this.traceId)
    return success()
  }

  async disconnect(): Promise<OperationResult<void>> {
    // Docker 不需要显式断开
    logger.debug('Docker 执行器关闭', 'DockerExecutor', undefined, this.traceId)
    return success()
  }

  async executeCommand(_request: ExecuteCommandRequest): Promise<OperationResult<ExecuteCommandResult>> {
    // Docker 不支持直接命令执行（需要通过容器）
    return failure(ErrorType.NOT_SUPPORTED, 'Docker 执行器不支持直接命令执行，请使用容器操作方法')
  }

  async healthCheck(): Promise<OperationResult<HealthCheckResult>> {
    try {
      logger.debug('Docker 健康检查中', 'DockerExecutor', undefined, this.traceId)
      
      // 尝试列出容器来验证 Docker 可用性
      const containers = await this.manager.listContainers()
      
      logger.info('Docker 健康检查成功', 'DockerExecutor', { containerCount: containers.length }, this.traceId)
      return success({
        healthy: true,
        details: { containerCount: containers.length }
      })
    } catch (error) {
      logger.error('Docker 健康检查失败', 'DockerExecutor', error as Error, undefined, this.traceId)
      return fromError(error)
    }
  }

  getType(): ExecutorType {
    return ExecutorType.DOCKER
  }

  /**
   * 获取原始管理器（用于特定操作）
   */
  getManager(): DockerManager {
    return this.manager
  }
}

/**
 * 执行器工厂
 */
export class ExecutorFactory {
  static create(config: ExecutorConfig, traceId?: string): IExecutor {
    switch (config.type) {
      case ExecutorType.OPENCLAW:
        return new OpenClawExecutor(config.profile, traceId)
      case ExecutorType.SSH:
        return new SSHExecutorAdapter(config.config, traceId)
      case ExecutorType.DOCKER:
        return new DockerExecutorAdapter(config.config, traceId)
      case ExecutorType.HOST_AGENT:
        throw new Error('Host Agent 执行器尚未实现统一适配器')
      default:
        throw new Error(`未知的执行器类型: ${(config as any).type}`)
    }
  }
}
