/**
 * Harness 控制器
 *
 * 职责：
 * - 运行时任务编排
 * - 自动选择合适的 Worker
 * - 任务状态追踪
 * - 与审批流程集成
 *
 * 使用适配器模式支持多种 Worker 类型：
 * - Hermes：HermesAdapter
 * - Claude Code：ClaudeCodeAdapter（存根）
 * - Host Agent：HostAgentAdapter（存根）
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from './db'
import { HermesAdapter } from './hermes-adapter'
import { getWorkerAdapter } from './worker-adapter'
import { WorkerRegistry, type WorkerType, type WorkerInfo } from './worker-registry'
import { ApprovalGuard, type HighRiskAction } from './approval-guard'
import { writeAuditLog } from './audit-log-writer'

export interface TaskSpec {
  ticketId?: string
  taskType: string
  prompt: string
  context?: Record<string, unknown>
  preferredWorkerType?: WorkerType
  preferredWorkerId?: string
  requireApproval?: boolean
  createdBy?: string
}

export interface DispatchResult {
  taskId: string
  workerId: string
  workerType: WorkerType
  workerName: string
  traceId: string
}

export interface TaskStatus {
  taskId: string
  workerId: string
  workerType: WorkerType
  taskType: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
  result?: Record<string, unknown>
  error?: string
  createdAt: Date
  updatedAt: Date
}

function safeJsonStringify(data: unknown, fallback = '{}'): string {
  if (data === null || data === undefined) return fallback
  try {
    return JSON.stringify(data)
  } catch {
    return fallback
  }
}

function maskSensitiveObject(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const masked: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) {
      const lower = key.toLowerCase()
      if (
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('key')
      ) {
        masked[key] = '***MASKED***'
      } else if (typeof child === 'object') {
        masked[key] = maskSensitiveObject(child)
      } else {
        masked[key] = child
      }
    }
    return masked
  }
  return value
}

export class HarnessController {
  /**
   * 派发任务（自动选择合适的 Worker）
   */
  static async dispatch(spec: TaskSpec): Promise<DispatchResult> {
    const traceId = uuidv4()

    // 1. 确定 Worker 类型
    const workerType = spec.preferredWorkerType || 'hermes'

    // 2. 选择最佳 Worker
    const worker = await this.selectWorker(workerType, spec.taskType, spec.preferredWorkerId)
    if (!worker) {
      throw new Error(`没有可用的 ${workerType} Worker`)
    }

    // 3. 检查是否需要审批
    let needsApproval = false
    let approvalId: string | undefined

    if (spec.requireApproval) {
      const approvalResult = await ApprovalGuard.executeProtected(
        'HERMES_TASK_DISPATCH' as HighRiskAction,
        {
          taskType: spec.taskType,
          workerId: worker.id,
          workerName: worker.name,
          promptLength: spec.prompt.length
        },
        spec.createdBy || 'system',
        () => Promise.resolve(true)
      )

      if (approvalResult.needsApproval) {
        needsApproval = true
        approvalId = approvalResult.approvalId
      }
    }

    // 4. 派发任务到 Worker（通过适配器统一分派）
    const adapter = getWorkerAdapter(worker.type)

    const result = await adapter.dispatchTask(worker.id, {
      taskType: spec.taskType,
      prompt: spec.prompt,
      context: spec.context,
      traceId
    })

    // 如果关联了工单，更新工单任务关联（Hermes 特有）
    if (spec.ticketId && worker.type === 'hermes') {
      await prisma.hermesTask.update({
        where: { id: result.taskId },
        data: { ticketId: spec.ticketId }
      })
    }

    await writeAuditLog({
      actor: spec.createdBy || 'system',
      ticketId: spec.ticketId,
      traceId,
      action: `${worker.type.toUpperCase()}_TASK_DISPATCHED`,
      tool: 'harness-controller',
      approvalId,
      request: maskSensitiveObject({
        taskType: spec.taskType,
        workerType: worker.type,
        workerId: worker.id,
        workerName: worker.name,
        promptLength: spec.prompt.length,
        needsApproval
      }),
      response: {
        taskId: result.taskId,
        workerId: worker.id,
        workerType: worker.type
      }
    })

    return {
      taskId: result.taskId,
      workerId: worker.id,
      workerType: worker.type,
      workerName: worker.name,
      traceId
    }
  }

  /**
   * 根据任务 ID 确定 Worker 类型
   */
  private static getWorkerTypeFromTaskId(taskId: string): WorkerType {
    if (taskId.startsWith('hermes-')) return 'hermes'
    if (taskId.startsWith('cc-')) return 'claude-code'
    // Host Agent 任务 ID 格式与 Hermes 不同，通过数据库查询确定
    return 'host-agent'
  }

  /**
   * 获取任务状态
   */
  static async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const workerType = this.getWorkerTypeFromTaskId(taskId)
    const adapter = getWorkerAdapter(workerType)
    const status = await adapter.getTaskStatus(taskId)

    return {
      taskId: status.taskId,
      workerId: taskId.split('-')[1] || taskId, // 简化，实际应从 adapter 返回
      workerType,
      taskType: status.taskId, // 简化，实际应查询数据库获取
      status: status.status,
      result: status.result,
      error: status.error,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * 取消任务
   */
  static async cancelTask(taskId: string, actor?: string): Promise<void> {
    const workerType = this.getWorkerTypeFromTaskId(taskId)
    const adapter = getWorkerAdapter(workerType)

    await adapter.cancelTask(taskId)

    await writeAuditLog({
      actor: actor || 'system',
      traceId: uuidv4(),
      action: `${workerType.toUpperCase()}_TASK_CANCELED`,
      tool: 'harness-controller',
      request: { taskId, workerType },
      response: { canceled: true }
    })
  }

  /**
   * 列出任务
   */
  static async listTasks(filters: {
    workerId?: string
    workerType?: WorkerType
    ticketId?: string
    status?: string
    taskType?: string
    limit?: number
  } = {}): Promise<TaskStatus[]> {
    const tasks: TaskStatus[] = []

    // Hermes 任务
    if (!filters.workerType || filters.workerType === 'hermes') {
      const hermesTasks = await prisma.hermesTask.findMany({
        where: {
          ...(filters.workerId ? { workerId: filters.workerId } : {}),
          ...(filters.ticketId ? { ticketId: filters.ticketId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.taskType ? { taskType: filters.taskType } : {})
        },
        include: { worker: true },
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 100
      })

      tasks.push(...hermesTasks.map(task => ({
        taskId: task.id,
        workerId: task.workerId,
        workerType: 'hermes' as WorkerType,
        taskType: task.taskType,
        status: task.status as TaskStatus['status'],
        result: task.result ? JSON.parse(task.result) : undefined,
        error: task.error || undefined,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })))
    }

    // Host Agent 任务
    if (!filters.workerType || filters.workerType === 'host-agent') {
      const agentActions = await prisma.agentAction.findMany({
        where: {
          ...(filters.workerId ? { hostAgentId: filters.workerId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.taskType ? { actionType: filters.taskType } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 100
      })

      tasks.push(...agentActions.map(action => ({
        taskId: action.id,
        workerId: action.hostAgentId,
        workerType: 'host-agent' as WorkerType,
        taskType: action.actionType,
        status: action.status as TaskStatus['status'],
        result: action.resultJson ? JSON.parse(action.resultJson) : undefined,
        error: action.errorSummary || undefined,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt
      })))
    }

    // Claude Code 任务（预留，暂无数据库表）
    // TODO: ClaudeCodeAdapter.listTasks() 集成

    return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * 获取 Worker 信息
   */
  static async getWorker(workerId: string, workerType?: WorkerType): Promise<{
    id: string
    name: string
    type: WorkerType
    enabled: boolean
    capabilities: string[]
    healthStatus: string
    lastHealthAt?: Date
  } | null> {
    const type = workerType || 'hermes'
    let worker = WorkerRegistry.get(type, workerId)

    if (!worker) {
      const adapter = getWorkerAdapter(type)
      const dbWorker = await adapter.getWorker(workerId)
      if (!dbWorker) return null

      worker = {
        type,
        id: dbWorker.id,
        name: dbWorker.name,
        enabled: dbWorker.enabled,
        capabilities: Object.keys(JSON.parse(dbWorker.capabilities || '{}')),
        tags: JSON.parse(dbWorker.tags || '[]'),
        healthStatus: dbWorker.lastHealthStatus === 'OK' ? 'healthy' :
          dbWorker.lastHealthStatus === 'ERROR' ? 'degraded' : 'unknown',
        lastHealthAt: dbWorker.lastHealthAt || undefined
      }
    }

    return {
      id: worker.id,
      name: worker.name,
      type: worker.type,
      enabled: worker.enabled,
      capabilities: worker.capabilities,
      healthStatus: worker.healthStatus,
      lastHealthAt: worker.lastHealthAt
    }
  }

  /**
   * 同步 Worker 注册表（所有类型）
   */
  static async syncWorkerRegistry(): Promise<void> {
    await WorkerRegistry.syncHermesWorkers()

    // Claude Code Worker 同步（当前为存根）
    try {
      const { ClaudeCodeAdapter } = await import('./claude-code-adapter')
      await new ClaudeCodeAdapter().syncToRegistry?.()
    } catch {
      // ClaudeCodeAdapter 可能尚未实现，忽略
    }

    // Host Agent Worker 同步
    try {
      const { HostAgentAdapter } = await import('./host-agent-adapter')
      await new HostAgentAdapter().syncToRegistry?.()
    } catch {
      // HostAgentAdapter 可能尚未实现，忽略
    }
  }

  /**
   * 获取 Worker 统计
   */
  static getWorkerStats(): {
    total: number
    byType: Record<WorkerType, number>
    byHealth: Record<string, number>
  } {
    return WorkerRegistry.getStats()
  }

  /**
   * 选择最佳 Worker
   */
  private static async selectWorker(
    workerType: WorkerType,
    taskType: string,
    preferredWorkerId?: string
  ): Promise<WorkerInfo | null> {
    if (preferredWorkerId) {
      const worker = WorkerRegistry.get(workerType, preferredWorkerId)
      if (worker && worker.enabled) {
        return worker
      }
    }

    await this.syncWorkerRegistry()

    if (workerType === 'hermes') {
      const hermesWorkers = await HermesAdapter.listWorkers(true)
      for (const w of hermesWorkers) {
        const info = WorkerRegistry.get('hermes', w.id)
        if (info && info.enabled && info.healthStatus === 'healthy') {
          return info
        }
      }
    }

    return WorkerRegistry.selectBestWorker(taskType, workerType)
  }

  /**
   * 轮询运行中任务（后台任务）
   *
   * 注意：这个方法应该在后台定期执行，更新运行中的任务状态
   */
  static async pollRunningTasks(): Promise<void> {
    const runningHermesTasks = await prisma.hermesTask.findMany({
      where: { status: 'RUNNING' },
      include: { worker: true }
    })

    for (const task of runningHermesTasks) {
      try {
        const result = await HermesAdapter.getTaskStatus(task.id)

        if (result.status === 'SUCCEEDED' || result.status === 'FAILED') {
          await prisma.hermesTask.update({
            where: { id: task.id },
            data: {
              status: result.status,
              result: safeJsonStringify(result.result),
              error: result.error || null,
              logs: safeJsonStringify(result.logs || [])
            }
          })

          await writeAuditLog({
            actor: 'system',
            traceId: task.traceId,
            ticketId: task.ticketId || undefined,
            action: result.status === 'SUCCEEDED' ? 'HERMES_TASK_COMPLETED' : 'HERMES_TASK_FAILED',
            tool: 'harness-controller',
            request: { taskId: task.id },
            response: { status: result.status, error: result.error }
          })
        }
      } catch {
        // 忽略轮询错误
      }
    }

    const runningAgentActions = await prisma.agentAction.findMany({
      where: { status: 'RUNNING' }
    })

    for (const action of runningAgentActions) {
      try {
        const result = await getWorkerAdapter('host-agent').getTaskStatus(action.id)

        if (result.status === 'SUCCEEDED' || result.status === 'FAILED') {
          await prisma.agentAction.update({
            where: { id: action.id },
            data: {
              status: result.status,
              resultJson: safeJsonStringify(result.result),
              errorSummary: result.error || null
            }
          })

          await writeAuditLog({
            actor: 'system',
            traceId: action.traceId,
            action: result.status === 'SUCCEEDED' ? 'HOST_AGENT_TASK_COMPLETED' : 'HOST_AGENT_TASK_FAILED',
            tool: 'harness-controller',
            request: { taskId: action.id },
            response: { status: result.status, error: result.error }
          })
        }
      } catch {
        // 忽略轮询错误
      }
    }
  }
}
