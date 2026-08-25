/**
 * Hermes Worker 适配器
 *
 * 职责：
 * - 与 Hermes Agent 通信（REST API / WebSocket）
 * - 任务派发与结果回收
 * - 错误处理与重试
 * - 审计日志写入
 *
 * Hermes Agent 项目：https://github.com/NousResearch/hermes-agent
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from './db'
import { writeAuditLog } from './audit-log-writer'
import { KeychainService } from './keychain'

export interface HermesCapabilities {
  code?: boolean       // 代码开发能力
  analysis?: boolean   // 分析能力
  general?: boolean    // 通用任务能力
  tools?: string[]     // 支持的工具列表
}

export interface HermesWorkerConfig {
  id: string
  name: string
  baseUrl: string
  wsUrl?: string
  capabilities: HermesCapabilities
}

export interface HermesTaskRequest {
  taskType: string
  prompt: string
  context?: Record<string, unknown>
  traceId: string
}

export interface HermesTaskResult {
  success: boolean
  result?: Record<string, unknown>
  error?: string
  logs?: string[]
}

export interface HermesDispatchResponse {
  taskId: string
  status: string
  externalTaskId?: string
}

interface HermesWorkerRow {
  id: string
  name: string
  description: string
  baseUrl: string
  wsUrl: string | null
  authTokenRef: string | null
  enabled: boolean
  tags: string
  capabilities: string
  lastHealthAt: Date | null
  lastHealthStatus: string | null
}

interface HermesTaskRow {
  id: string
  workerId: string
  ticketId: string | null
  taskType: string
  prompt: string
  context: string
  status: string
  result: string | null
  error: string | null
  logs: string | null
  traceId: string
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
  if (Array.isArray(value)) return value.map(item => maskSensitiveObject(item))
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const masked: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) {
      const lower = key.toLowerCase()
      if (
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('key') ||
        lower.includes('credential')
      ) {
        masked[key] = '***MASKED***'
      } else {
        masked[key] = maskSensitiveObject(child)
      }
    }
    return masked
  }
  return value
}

export class HermesAdapter {
  /**
   * 获取 Hermes Worker 配置
   */
  static async getWorker(workerId: string): Promise<HermesWorkerRow | null> {
    return prisma.hermesWorker.findUnique({ where: { id: workerId } })
  }

  /**
   * 列出所有 Hermes Worker
   */
  static async listWorkers(enabledOnly = false): Promise<HermesWorkerRow[]> {
    return prisma.hermesWorker.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: { name: 'asc' }
    })
  }

  /**
   * 创建 Hermes Worker
   */
  static async createWorker(data: {
    name: string
    description?: string
    baseUrl: string
    wsUrl?: string
    authToken?: string
    tags?: string[]
    capabilities?: HermesCapabilities
  }): Promise<HermesWorkerRow> {
    const { authToken, ...rest } = data
    const worker = await prisma.hermesWorker.create({
      data: {
        name: rest.name,
        description: rest.description || '',
        baseUrl: rest.baseUrl,
        wsUrl: rest.wsUrl || null,
        authTokenRef: authToken ? `hermes-worker-${uuidv4()}` : null,
        tags: safeJsonStringify(rest.tags || []),
        capabilities: safeJsonStringify(rest.capabilities || {})
      }
    })

    // 如果提供了 token，存到 Keychain
    if (authToken && worker.authTokenRef) {
      await KeychainService.setPassword(
        'hermes-system',
        worker.authTokenRef,
        authToken
      )
    }

    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'HERMES_WORKER_CREATED',
      tool: 'hermes-adapter',
      request: { name: data.name, baseUrl: data.baseUrl },
      response: { workerId: worker.id }
    })

    return worker
  }

  /**
   * 更新 Hermes Worker
   */
  static async updateWorker(
    workerId: string,
    data: {
      name?: string
      description?: string
      baseUrl?: string
      wsUrl?: string
      authToken?: string
      enabled?: boolean
      tags?: string[]
      capabilities?: HermesCapabilities
    }
  ): Promise<HermesWorkerRow> {
    const existing = await prisma.hermesWorker.findUnique({ where: { id: workerId } })
    if (!existing) {
      throw new Error('Hermes Worker 不存在')
    }

    const { authToken, ...rest } = data
    const updateData: Record<string, unknown> = {}
    if (rest.name !== undefined) updateData.name = rest.name
    if (rest.description !== undefined) updateData.description = rest.description
    if (rest.baseUrl !== undefined) updateData.baseUrl = rest.baseUrl
    if (rest.wsUrl !== undefined) updateData.wsUrl = rest.wsUrl || null
    if (rest.enabled !== undefined) updateData.enabled = rest.enabled
    if (rest.tags !== undefined) updateData.tags = safeJsonStringify(rest.tags)
    if (rest.capabilities !== undefined) updateData.capabilities = safeJsonStringify(rest.capabilities)

    const worker = await prisma.hermesWorker.update({
      where: { id: workerId },
      data: updateData
    })

    // 如果提供了新 token，更新 Keychain
    if (authToken && worker.authTokenRef) {
      await KeychainService.setPassword(
        'hermes-system',
        worker.authTokenRef,
        authToken
      )
    }

    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'HERMES_WORKER_UPDATED',
      tool: 'hermes-adapter',
      request: { workerId, updates: maskSensitiveObject(rest) },
      response: { workerId: worker.id }
    })

    return worker
  }

  /**
   * 删除 Hermes Worker
   */
  static async deleteWorker(workerId: string): Promise<void> {
    const existing = await prisma.hermesWorker.findUnique({ where: { id: workerId } })
    if (!existing) {
      throw new Error('Hermes Worker 不存在')
    }

    // 删除 Keychain 中的 token
    if (existing.authTokenRef) {
      await KeychainService.deletePassword('hermes-system', existing.authTokenRef).catch(() => {})
    }

    await prisma.hermesWorker.delete({ where: { id: workerId } })

    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'HERMES_WORKER_DELETED',
      tool: 'hermes-adapter',
      request: { workerId },
      response: { deleted: true }
    })
  }

  /**
   * 健康检查
   */
  static async ping(workerId: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const worker = await prisma.hermesWorker.findUnique({ where: { id: workerId } })
    if (!worker) {
      return { success: false, latency: 0, error: 'Worker 不存在' }
    }

    const start = Date.now()
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (worker.authTokenRef) {
        const token = await KeychainService.getPassword('hermes-system', worker.authTokenRef)
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      }

      const response = await fetch(`${worker.baseUrl}/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000)
      })

      const latency = Date.now() - start
      const success = response.ok

      // 更新健康状态
      await prisma.hermesWorker.update({
        where: { id: workerId },
        data: {
          lastHealthAt: new Date(),
          lastHealthStatus: success ? 'OK' : 'ERROR'
        }
      })

      return { success, latency, error: success ? undefined : `HTTP ${response.status}` }
    } catch (error) {
      const latency = Date.now() - start
      const errorMsg = error instanceof Error ? error.message : String(error)

      // 更新健康状态
      await prisma.hermesWorker.update({
        where: { id: workerId },
        data: {
          lastHealthAt: new Date(),
          lastHealthStatus: 'ERROR'
        }
      })

      return { success: false, latency, error: errorMsg }
    }
  }

  /**
   * 派发任务到 Hermes Worker
   */
  static async dispatchTask(
    workerId: string,
    request: HermesTaskRequest
  ): Promise<{ taskId: string; externalTaskId?: string }> {
    const worker = await prisma.hermesWorker.findUnique({ where: { id: workerId } })
    if (!worker) {
      throw new Error('Hermes Worker 不存在')
    }
    if (!worker.enabled) {
      throw new Error('Hermes Worker 已禁用')
    }

    const taskId = uuidv4()
    const traceId = request.traceId || uuidv4()

    // 在数据库中创建任务记录
    await prisma.hermesTask.create({
      data: {
        id: taskId,
        workerId,
        taskType: request.taskType,
        prompt: request.prompt,
        context: safeJsonStringify(request.context || {}),
        status: 'PENDING',
        traceId
      }
    })

    try {
      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId
      }
      if (worker.authTokenRef) {
        const token = await KeychainService.getPassword('hermes-system', worker.authTokenRef)
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      }

      // 调用 Hermes API
      const response = await fetch(`${worker.baseUrl}/api/task`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          taskType: request.taskType,
          prompt: request.prompt,
          context: request.context || {},
          traceId
        }),
        signal: AbortSignal.timeout(30000)
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new Error(`Hermes API 错误: ${response.status} ${errorBody}`)
      }

      const responseData = await response.json() as { taskId?: string; status?: string }
      const externalTaskId = responseData.taskId || String(responseData.status || taskId)

      // 更新任务状态为 RUNNING
      await prisma.hermesTask.update({
        where: { id: taskId },
        data: { status: 'RUNNING' }
      })

      await writeAuditLog({
        actor: 'system',
        traceId,
        action: 'HERMES_TASK_DISPATCHED',
        tool: 'hermes-adapter',
        request: maskSensitiveObject({
          workerId,
          taskType: request.taskType,
          promptLength: request.prompt.length
        }),
        response: { taskId, externalTaskId, workerName: worker.name }
      })

      return { taskId, externalTaskId }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // 更新任务状态为 FAILED
      await prisma.hermesTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          error: errorMsg
        }
      })

      await writeAuditLog({
        actor: 'system',
        traceId,
        action: 'HERMES_TASK_DISPATCH_FAILED',
        tool: 'hermes-adapter',
        request: maskSensitiveObject({ workerId, taskType: request.taskType }),
        response: { error: errorMsg }
      })

      throw error
    }
  }

  /**
   * 查询 Hermes 任务状态
   */
  static async getTaskStatus(taskId: string): Promise<HermesTaskResult & { status: string }> {
    const task = await prisma.hermesTask.findUnique({ where: { id: taskId } })
    if (!task) {
      throw new Error('任务不存在')
    }

    // 如果任务还在 RUNNING，尝试从 Hermes 获取最新状态
    if (task.status === 'RUNNING') {
      const worker = await prisma.hermesWorker.findUnique({ where: { id: task.workerId } })
      if (worker) {
        try {
          const headers: Record<string, string> = { 'X-Trace-ID': task.traceId }
          if (worker.authTokenRef) {
            const token = await KeychainService.getPassword('hermes-system', worker.authTokenRef)
            if (token) {
              headers['Authorization'] = `Bearer ${token}`
            }
          }

          const response = await fetch(`${worker.baseUrl}/api/task/${taskId}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          })

          if (response.ok) {
            const data = await response.json() as {
              status?: string
              result?: Record<string, unknown>
              error?: string
              logs?: string[]
            }

            // 如果 Hermes 返回了最终状态，更新本地记录
            if (data.status === 'SUCCEEDED' || data.status === 'FAILED') {
              await prisma.hermesTask.update({
                where: { id: taskId },
                data: {
                  status: data.status,
                  result: safeJsonStringify(data.result),
                  error: data.error || null,
                  logs: safeJsonStringify(data.logs || [])
                }
              })
            }
          }
        } catch {
          // 忽略远程查询错误，使用本地状态
        }
      }
    }

    // 返回最新状态
    const latestTask = await prisma.hermesTask.findUnique({ where: { id: taskId } })
    if (!latestTask) {
      throw new Error('任务不存在')
    }

    return {
      success: latestTask.status === 'SUCCEEDED',
      status: latestTask.status,
      result: latestTask.result ? JSON.parse(latestTask.result) : undefined,
      error: latestTask.error || undefined,
      logs: latestTask.logs ? JSON.parse(latestTask.logs) : undefined
    }
  }

  /**
   * 取消 Hermes 任务
   */
  static async cancelTask(taskId: string): Promise<void> {
    const task = await prisma.hermesTask.findUnique({ where: { id: taskId } })
    if (!task) {
      throw new Error('任务不存在')
    }

    if (task.status !== 'PENDING' && task.status !== 'RUNNING') {
      throw new Error(`无法取消状态为 ${task.status} 的任务`)
    }

    // 尝试通知 Hermes 取消
    const worker = await prisma.hermesWorker.findUnique({ where: { id: task.workerId } })
    if (worker) {
      try {
        const headers: Record<string, string> = { 'X-Trace-ID': task.traceId }
        if (worker.authTokenRef) {
          const token = await KeychainService.getPassword('hermes-system', worker.authTokenRef)
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
        }

        await fetch(`${worker.baseUrl}/api/task/${taskId}/cancel`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(5000)
        }).catch(() => {}) // 忽略取消请求的错误
      } catch {
        // 忽略远程取消错误
      }
    }

    // 更新本地状态
    await prisma.hermesTask.update({
      where: { id: taskId },
      data: { status: 'CANCELED' }
    })

    await writeAuditLog({
      actor: 'system',
      traceId: task.traceId,
      action: 'HERMES_TASK_CANCELED',
      tool: 'hermes-adapter',
      request: { taskId },
      response: { canceled: true }
    })
  }

  /**
   * 列出 Hermes 任务
   */
  static async listTasks(filters: {
    workerId?: string
    ticketId?: string
    status?: string
    taskType?: string
  } = {}): Promise<HermesTaskRow[]> {
    return prisma.hermesTask.findMany({
      where: {
        ...(filters.workerId ? { workerId: filters.workerId } : {}),
        ...(filters.ticketId ? { ticketId: filters.ticketId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.taskType ? { taskType: filters.taskType } : {})
      },
      include: {
        worker: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  /**
   * 获取任务详情
   */
  static async getTask(taskId: string): Promise<HermesTaskRow | null> {
    return prisma.hermesTask.findUnique({
      where: { id: taskId },
      include: {
        worker: true,
        ticket: true
      }
    })
  }

  /**
   * 更新任务结果（供外部调用）
   */
  static async updateTaskResult(
    taskId: string,
    result: {
      status: 'SUCCEEDED' | 'FAILED'
      result?: Record<string, unknown>
      error?: string
      logs?: string[]
    }
  ): Promise<void> {
    await prisma.hermesTask.update({
      where: { id: taskId },
      data: {
        status: result.status,
        result: safeJsonStringify(result.result),
        error: result.error || null,
        logs: safeJsonStringify(result.logs || [])
      }
    })

    const task = await prisma.hermesTask.findUnique({ where: { id: taskId } })
    if (task) {
      await writeAuditLog({
        actor: 'hermes-worker',
        traceId: task.traceId,
        action: result.status === 'SUCCEEDED' ? 'HERMES_TASK_SUCCEEDED' : 'HERMES_TASK_FAILED',
        tool: 'hermes-adapter',
        request: { taskId, workerId: task.workerId },
        response: { status: result.status, error: result.error }
      })
    }
  }
}
