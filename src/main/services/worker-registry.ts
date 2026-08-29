/**
 * Worker 注册中心
 *
 * 职责：
 * - 统一管理所有 Worker 类型（Claude Code, Hermes, Host Agent）
 * - Worker 健康状态追踪
 * - 基于能力和负载选择最佳 Worker
 */

import { HermesAdapter } from './hermes-adapter'
import { logger } from './logger'

export type WorkerType = 'claude-code' | 'hermes' | 'host-agent'

export type HealthStatus = 'healthy' | 'degraded' | 'offline' | 'unknown'

export interface WorkerInfo {
  type: WorkerType
  id: string
  name: string
  enabled: boolean
  capabilities: string[]
  tags: string[]
  healthStatus: HealthStatus
  lastHealthAt?: Date
}

export interface WorkerHealthReport {
  workerId: string
  type: WorkerType
  status: HealthStatus
  latency?: number
  error?: string
  checkedAt: Date
}

/**
 * Worker 注册中心
 *
 * 内存中的 Worker 注册表，支持动态注册/注销
 * 注意：Hermes Worker 的配置存储在数据库中，此处只管理运行时状态
 */
export class WorkerRegistry {
  // 内存中的 Worker 注册表
  private static workers = new Map<string, WorkerInfo>()

  // Worker 能力映射表
  private static readonly CAPABILITY_MAP: Record<WorkerType, string[]> = {
    'claude-code': ['code', 'analysis', 'general', 'planning', 'debugging'],
    'hermes': ['code', 'analysis', 'general', 'research', 'writing'],
    'host-agent': ['deploy', 'backup', 'restore', 'health-check', 'config-apply']
  }

  /**
   * 注册 Worker
   */
  static register(worker: WorkerInfo): void {
    const key = `${worker.type}:${worker.id}`
    WorkerRegistry.workers.set(key, worker)
  }

  /**
   * 注销 Worker
   */
  static unregister(type: WorkerType, id: string): void {
    const key = `${type}:${id}`
    WorkerRegistry.workers.delete(key)
  }

  /**
   * 获取 Worker 信息
   */
  static get(type: WorkerType, id: string): WorkerInfo | undefined {
    const key = `${type}:${id}`
    return WorkerRegistry.workers.get(key)
  }

  /**
   * 获取所有 Worker
   */
  static getAll(): WorkerInfo[] {
    return Array.from(WorkerRegistry.workers.values())
  }

  /**
   * 按类型获取 Worker
   */
  static getByType(type: WorkerType): WorkerInfo[] {
    return Array.from(WorkerRegistry.workers.values()).filter(w => w.type === type)
  }

  /**
   * 获取可用（健康）的 Worker
   */
  static getAvailable(): WorkerInfo[] {
    return Array.from(WorkerRegistry.workers.values()).filter(
      w => w.enabled && w.healthStatus === 'healthy'
    )
  }

  /**
   * 按任务类型获取可用 Worker
   */
  static getAvailableForTask(taskType: string): WorkerInfo[] {
    return WorkerRegistry.getAvailable().filter(worker => {
      // 检查 Worker 是否有匹配的能力或标签
      const hasCapability = worker.capabilities.some(cap =>
        taskType.toLowerCase().includes(cap.toLowerCase()) ||
        cap.toLowerCase().includes(taskType.toLowerCase())
      )
      const hasTag = worker.tags.some(tag =>
        taskType.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(taskType.toLowerCase())
      )
      return hasCapability || hasTag
    })
  }

  /**
   * 更新 Worker 健康状态
   */
  static updateHealth(type: WorkerType, id: string, status: HealthStatus, lastHealthAt?: Date): void {
    const key = `${type}:${id}`
    const worker = WorkerRegistry.workers.get(key)
    if (worker) {
      worker.healthStatus = status
      if (lastHealthAt) {
        worker.lastHealthAt = lastHealthAt
      }
    }
  }

  /**
   * 同步 Hermes Worker 到注册表
   *
   * 从数据库读取 Hermes Worker 配置，同步到内存注册表
   */
  static async syncHermesWorkers(): Promise<void> {
    try {
      const hermesWorkers = await HermesAdapter.listWorkers()

      // 移除不再存在的 Hermes Worker
      for (const key of WorkerRegistry.workers.keys()) {
        if (key.startsWith('hermes:')) {
          const id = key.replace('hermes:', '')
          if (!hermesWorkers.find(w => w.id === id)) {
            WorkerRegistry.workers.delete(key)
          }
        }
      }

      // 添加/更新 Hermes Worker
      for (const worker of hermesWorkers) {
        const capabilities = Object.keys(
          JSON.parse(worker.capabilities || '{}')
        ).filter(Boolean)
        if (capabilities.length === 0) {
          capabilities.push(...WorkerRegistry.CAPABILITY_MAP.hermes)
        }

        WorkerRegistry.register({
          type: 'hermes',
          id: worker.id,
          name: worker.name,
          enabled: worker.enabled,
          capabilities,
          tags: JSON.parse(worker.tags || '[]'),
          healthStatus: worker.lastHealthStatus === 'OK' ? 'healthy' :
            worker.lastHealthStatus === 'ERROR' ? 'degraded' : 'unknown',
          lastHealthAt: worker.lastHealthAt || undefined
        })
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('同步 Hermes Worker 失败', 'worker-registry', err)
    }
  }

  /**
   * 健康检查所有 Worker
   */
  static async healthCheck(): Promise<WorkerHealthReport[]> {
    const reports: WorkerHealthReport[] = []
    const now = new Date()

    // 获取 Hermes Worker 并检查健康
    const hermesWorkers = await HermesAdapter.listWorkers()
    for (const worker of hermesWorkers) {
      try {
        const result = await HermesAdapter.ping(worker.id)
        const status: HealthStatus = result.success ? 'healthy' : 'degraded'

        WorkerRegistry.updateHealth('hermes', worker.id, status, now)

        reports.push({
          workerId: worker.id,
          type: 'hermes',
          status,
          latency: result.latency,
          error: result.error,
          checkedAt: now
        })
      } catch (error) {
        WorkerRegistry.updateHealth('hermes', worker.id, 'offline', now)

        reports.push({
          workerId: worker.id,
          type: 'hermes',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          checkedAt: now
        })
      }
    }

    // Claude Code 与 Host Agent 的健康检查由各自运行时服务负责，此处只汇总已注册的 Hermes Worker。

    return reports
  }

  /**
   * 选择最佳 Worker（基于能力、负载、健康状态）
   */
  static selectBestWorker(taskType: string, preferredType?: WorkerType): WorkerInfo | null {
    let candidates = WorkerRegistry.getAvailableForTask(taskType)

    // 如果有指定的 Worker 类型偏好，优先选择
    if (preferredType) {
      const preferred = candidates.filter(w => w.type === preferredType)
      if (preferred.length > 0) {
        candidates = preferred
      }
    }

    if (candidates.length === 0) {
      // 回退到所有健康 Worker
      candidates = WorkerRegistry.getAvailable()
    }

    if (candidates.length === 0) {
      return null
    }

    // 简单的负载均衡：随机选择一个
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  /**
   * 获取 Worker 统计信息
   */
  static getStats(): {
    total: number
    byType: Record<WorkerType, number>
    byHealth: Record<HealthStatus, number>
  } {
    const workers = WorkerRegistry.getAll()
    const stats = {
      total: workers.length,
      byType: {
        'claude-code': 0,
        'hermes': 0,
        'host-agent': 0
      } as Record<WorkerType, number>,
      byHealth: {
        'healthy': 0,
        'degraded': 0,
        'offline': 0,
        'unknown': 0
      } as Record<HealthStatus, number>
    }

    for (const worker of workers) {
      stats.byType[worker.type]++
      stats.byHealth[worker.healthStatus]++
    }

    return stats
  }
}
