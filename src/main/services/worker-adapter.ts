/**
 * Worker 适配器接口
 *
 * 所有 Worker 适配器必须实现此接口，
 * 确保 HarnessController 可以统一调用不同类型的 Worker。
 */

import type { WorkerType } from './worker-registry'

/** 任务派发请求 */
export interface WorkerTaskRequest {
  taskType: string
  prompt: string
  context?: Record<string, unknown>
  traceId: string
}

/** 任务派发响应 */
export interface WorkerTaskResponse {
  taskId: string
  status: string
  externalTaskId?: string
}

/** 任务状态响应 */
export interface WorkerStatusResponse {
  taskId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
  result?: Record<string, unknown>
  error?: string
  logs?: string[]
}

/** Worker 基础信息（数据库行） */
export interface WorkerRow {
  id: string
  name: string
  enabled: boolean
  capabilities: string
  tags: string
  lastHealthStatus?: string | null
  lastHealthAt?: Date | null
}

/**
 * Worker 适配器接口
 *
 * 实现此接口的类代表与特定类型 Worker 的通信层。
 * 当前已实现：
 * - HermesAdapter：与 Hermes Agent 通信
 *
 * 待实现（存根）：
 * - ClaudeCodeAdapter：与 Claude Code 通信
 * - HostAgentAdapter：与 Host Agent 通信
 */
export interface WorkerAdapter {
  /** Worker 类型标识 */
  readonly type: WorkerType

  /**
   * 派发任务到 Worker
   */
  dispatchTask(workerId: string, request: WorkerTaskRequest): Promise<WorkerTaskResponse>

  /**
   * 取消任务
   */
  cancelTask(taskId: string): Promise<void>

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): Promise<WorkerStatusResponse>

  /**
   * 获取所有 Worker 列表
   */
  listWorkers(enabledOnly?: boolean): Promise<WorkerRow[]>

  /**
   * 健康检查
   */
  ping(workerId: string): Promise<{ success: boolean; latency?: number; error?: string }>

  /**
   * 获取单个 Worker 信息
   */
  getWorker(workerId: string): Promise<WorkerRow | null>

  /**
   * 从数据库同步 Worker 列表到内存注册表
   */
  syncToRegistry?(): Promise<void>
}

/**
 * 获取指定类型的适配器实例
 */
export function getWorkerAdapter(type: WorkerType): WorkerAdapter {
  switch (type) {
    case 'hermes':
      // 延迟导入避免循环依赖
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { HermesAdapter } = require('./hermes-adapter')
      return HermesAdapter
    case 'claude-code':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ClaudeCodeAdapter } = require('./claude-code-adapter')
      return ClaudeCodeAdapter
    case 'host-agent':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { HostAgentAdapter } = require('./host-agent-adapter')
      return HostAgentAdapter
    default:
      throw new Error(`不支持的 Worker 类型: ${type}`)
  }
}
