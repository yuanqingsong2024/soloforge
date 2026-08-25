/**
 * Harness 控制器
 *
 * 职责：
 * - 运行时任务编排
 * - 自动选择合适的 Worker
 * - 任务状态追踪
 * - 与审批流程集成
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from './db'
import { HermesAdapter } from './hermes-adapter'
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

    // 4. 派发任务到 Hermes Worker
    if (worker.type === 'hermes') {
      const result = await HermesAdapter.dispatchTask(worker.id, {
        taskType: spec.taskType,
        prompt: spec.prompt,
        context: spec.context,
        traceId
      })

      // 如果关联了工单，更新工单任务关联
      if (spec.ticketId) {
        await prisma.hermesTask.update({
          where: { id: result.taskId },
          data: { ticketId: spec.ticketId }
        })
      }

      await writeAuditLog({
        actor: spec.createdBy || 'system',
        ticketId: spec.ticketId,
        traceId,
        action: 'HARNESS_TASK_DISPATCHED',
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

    // TODO: 支持其他 Worker 类型
    throw new Error(`暂不支持 Worker 类型: ${worker.type}`)
  }

  /**
   * 获取任务状态
   */
  static async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const task = await prisma.hermesTask.findUnique({
      where: { id: taskId },
      include: { worker: true }
    })

    if (!task) {
      throw new Error('任务不存在')
    }

    return {
      taskId: task.id,
      workerId: task.workerId,
      workerType: 'hermes',
      taskType: task.taskType,
      status: task.status as TaskStatus['status'],
      result: task.result ? JSON.parse(task.result) : undefined,
      error: task.error || undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }
  }

  /**
   * 取消任务
   */
  static async cancelTask(taskId: string, actor?: string): Promise<void> {
    const task = await prisma.hermesTask.findUnique({ where: { id: taskId } })
    if (!task) {
      throw new Error('任务不存在')
    }

    await HermesAdapter.cancelTask(taskId)

    await writeAuditLog({
      actor: actor || 'system',
      traceId: task.traceId,
      ticketId: task.ticketId || undefined,
      action: 'HARNESS_TASK_CANCELED',
      tool: 'harness-controller',
      request: { taskId },
      response: { canceled: true }
    })
  }

  /**
   * 列出任务
   */
  static async listTasks(filters: {
    workerId?: string
    ticketId?: string
    status?: string
    taskType?: string
    limit?: number
  } = {}): Promise<TaskStatus[]> {
    const tasks = await prisma.hermesTask.findMany({
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

    return tasks.map(task => ({
      taskId: task.id,
      workerId: task.workerId,
      workerType: 'hermes' as WorkerType,
      taskType: task.taskType,
      status: task.status as TaskStatus['status'],
      result: task.result ? JSON.parse(task.result) : undefined,
      error: task.error || undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }))
  }

  /**
   * 获取 Worker 信息
   */
  static async getWorker(workerId: string): Promise<{
    id: string
    name: string
    type: WorkerType
    enabled: boolean
    capabilities: string[]
    healthStatus: string
    lastHealthAt?: Date
  } | null> {
    // 先从注册表获取
    let worker = WorkerRegistry.get('hermes', workerId)

    // 如果不在注册表中，从数据库获取
    if (!worker) {
      const dbWorker = await prisma.hermesWorker.findUnique({ where: { id: workerId } })
      if (!dbWorker) return null

      worker = {
        type: 'hermes',
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
   * 同步 Worker 注册表
   */
  static async syncWorkerRegistry(): Promise<void> {
    await WorkerRegistry.syncHermesWorkers()
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
    // 如果指定了 Worker ID，直接使用
    if (preferredWorkerId) {
      const worker = workerType === 'hermes'
        ? WorkerRegistry.get('hermes', preferredWorkerId)
        : WorkerRegistry.get(workerType, preferredWorkerId)

      if (worker && worker.enabled) {
        return worker
      }
    }

    // 同步 Worker 注册表
    await WorkerRegistry.syncHermesWorkers()

    // 如果指定了类型，优先选择该类型
    if (workerType === 'hermes') {
      // 获取所有可用的 Hermes Worker
      const hermesWorkers = await HermesAdapter.listWorkers(true)
      for (const w of hermesWorkers) {
        const info = WorkerRegistry.get('hermes', w.id)
        if (info && info.enabled && info.healthStatus === 'healthy') {
          return info
        }
      }
    }

    // 回退到通用选择器
    return WorkerRegistry.selectBestWorker(taskType, workerType)
  }

  /**
   * 轮询任务状态（用于后台任务）
   *
   * 注意：这个方法应该在后台定期执行，更新运行中的任务状态
   */
  static async pollRunningTasks(): Promise<void> {
    const runningTasks = await prisma.hermesTask.findMany({
      where: { status: 'RUNNING' },
      include: { worker: true }
    })

    for (const task of runningTasks) {
      try {
        const result = await HermesAdapter.getTaskStatus(task.id)

        // 如果任务完成，更新状态
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
  }
}
