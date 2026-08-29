/**
 * Claude Code Worker 适配器
 *
 * 职责：
 * - 与 Claude Code（Claude Code）通信
 * - 任务派发与结果回收
 * - 通过 OpenClawClient 或直接 HTTP 调用
 *
 * 注意：当前为存根实现，实际集成需要：
 * - 确定 Claude Code 的 REST API 接口
 * - 实现任务派发/取消/状态查询
 */

import { v4 as uuidv4 } from 'uuid'
import { type WorkerAdapter, type WorkerTaskRequest, type WorkerTaskResponse, type WorkerStatusResponse, type WorkerRow } from './worker-adapter'
import { type WorkerType } from './worker-registry'
import { writeAuditLog } from './audit-log-writer'

/**
 * Claude Code Worker 适配器
 *
 * 当前状态：存根
 *
 * TODO: 实际实现需要与 OpenClawClient 集成
 * - 确定 Claude Code 的任务派发 API
 * - 实现任务状态轮询
 * - 实现取消功能
 */
export class ClaudeCodeAdapter implements WorkerAdapter {
  readonly type: WorkerType = 'claude-code'

  async dispatchTask(workerId: string, request: WorkerTaskRequest): Promise<WorkerTaskResponse> {
    // TODO: 实现实际的 Claude Code 任务派发
    // 目前返回占位响应，实际使用时替换为真实 API 调用
    const taskId = `cc-${uuidv4()}`

    await writeAuditLog({
      actor: 'system',
      traceId: request.traceId,
      action: 'CLAUDE_CODE_TASK_DISPATCHED',
      tool: 'claude-code-adapter',
      request: {
        workerId,
        taskType: request.taskType,
        promptLength: request.prompt.length
      },
      response: { taskId, status: 'PENDING' }
    })

    return {
      taskId,
      status: 'PENDING'
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    // TODO: 实现实际的取消逻辑
    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'CLAUDE_CODE_TASK_CANCELED',
      tool: 'claude-code-adapter',
      request: { taskId },
      response: { canceled: true }
    })
  }

  async getTaskStatus(taskId: string): Promise<WorkerStatusResponse> {
    // TODO: 实现实际的状态查询
    return {
      taskId,
      status: 'PENDING'
    }
  }

  async listWorkers(_enabledOnly = false): Promise<WorkerRow[]> {
    // Claude Code Worker 从数据库的 hermes_worker 表读取
    // 标记 type='claude-code' 的记录
    // TODO: 确认数据库表结构
    return []
  }

  async ping(_workerId: string): Promise<{ success: boolean; latency?: number; error?: string }> {
    // TODO: 实现实际的健康检查
    return {
      success: true,
      latency: 0
    }
  }

  async getWorker(_workerId: string): Promise<WorkerRow | null> {
    // TODO: 实现实际的 Worker 查询
    return null
  }

  async syncToRegistry(): Promise<void> {
    // Claude Code Worker 的同步逻辑
    // TODO: 从数据库读取 type='claude-code' 的 Worker 并注册到 WorkerRegistry
  }
}
