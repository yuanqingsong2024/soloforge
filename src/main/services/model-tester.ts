import { prisma } from './db'
import { resolveWorkspaceOpenClawClient } from './workspace-openclaw'

/**
 * 模型测试结果
 */
export interface ModelTestResult {
  provider: string
  modelName: string
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT'
  latencyMs?: number
  errorMessage?: string
}

/**
 * 批量测试配置
 */
export interface BatchTestConfig {
  models: Array<{ provider: string; modelName: string }>
  testPayload: {
    messages: Array<{ role: string; content: string }>
    maxTokens?: number
  }
  timeout?: number // 单个模型超时时间（毫秒），默认 10000
  concurrency?: number // 并发数，默认 3
}

/**
 * 延迟统计
 */
export interface LatencyStats {
  p50: number
  p95: number
  p99: number
  avg: number
  min: number
  max: number
}

/**
 * ModelTester 服务
 * 负责批量测试模型连通性、延迟检测、并发控制
 */
export class ModelTester {
  /**
   * 批量测试模型
   */
  static async batchTest(
    workspaceId: string,
    config: BatchTestConfig
  ): Promise<ModelTestResult[]> {
    const { models, testPayload, timeout = 10000, concurrency = 3 } = config
    const results: ModelTestResult[] = []

    // 使用 p-limit 控制并发（简化版：分批执行）
    for (let i = 0; i < models.length; i += concurrency) {
      const batch = models.slice(i, i + concurrency)
      const batchResults = await Promise.allSettled(
        batch.map(model => this.testSingleModel(workspaceId, model, testPayload, timeout))
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          // Promise rejected，记录为 FAILED
          results.push({
            provider: 'unknown',
            modelName: 'unknown',
            status: 'FAILED',
            errorMessage: String(result.reason)
          })
        }
      }
    }

    return results
  }

  /**
   * 测试单个模型
   */
  private static async testSingleModel(
    workspaceId: string,
    model: { provider: string; modelName: string },
    testPayload: BatchTestConfig['testPayload'],
    timeout: number
  ): Promise<ModelTestResult> {
    const startTime = Date.now()

    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout)
      })

      // 实际测试 Promise（这里简化为模拟调用）
      const testPromise = this.callModel(workspaceId, model.provider, model.modelName, testPayload)

      // 竞速
      const response = await Promise.race([testPromise, timeoutPromise])
      const latencyMs = Date.now() - startTime

      // 保存测试结果
      await prisma.modelTestResult.create({
        data: {
          workspaceId,
          provider: model.provider,
          modelName: model.modelName,
          status: 'SUCCESS',
          latencyMs,
          testPayload: JSON.stringify(testPayload),
          response: JSON.stringify(response)
        }
      })

      return {
        provider: model.provider,
        modelName: model.modelName,
        status: 'SUCCESS',
        latencyMs
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime
      const isTimeout = error.message === 'Timeout'
      const status = isTimeout ? 'TIMEOUT' : 'FAILED'
      const errorMessage = error.message || String(error)

      // 保存失败结果
      await prisma.modelTestResult.create({
        data: {
          workspaceId,
          provider: model.provider,
          modelName: model.modelName,
          status,
          latencyMs: isTimeout ? timeout : latencyMs,
          errorMessage,
          testPayload: JSON.stringify(testPayload)
        }
      })

      return {
        provider: model.provider,
        modelName: model.modelName,
        status,
        latencyMs: isTimeout ? timeout : latencyMs,
        errorMessage
      }
    }
  }

  /**
   * 调用模型（简化版：实际应通过 OpenClaw 调用）
   * TODO: 集成 OpenClawClient
   */
  private static async callModel(
    workspaceId: string,
    provider: string,
    modelName: string,
    payload: BatchTestConfig['testPayload']
  ): Promise<unknown> {
    const traceId = `model-test-${provider}-${modelName}-${Date.now()}`
    const { client } = await resolveWorkspaceOpenClawClient(workspaceId)

    return await client.createChatCompletion({
      model: modelName,
      messages: payload.messages,
      maxTokens: payload.maxTokens,
      traceId
    })
  }

  /**
   * 计算延迟统计
   */
  static calculateLatencyStats(results: ModelTestResult[]): LatencyStats | null {
    const latencies = results
      .filter(r => r.status === 'SUCCESS' && r.latencyMs !== undefined)
      .map(r => r.latencyMs!)
      .sort((a, b) => a - b)

    if (latencies.length === 0) {
      return null
    }

    const p50Index = Math.floor(latencies.length * 0.5)
    const p95Index = Math.floor(latencies.length * 0.95)
    const p99Index = Math.floor(latencies.length * 0.99)

    return {
      p50: latencies[p50Index],
      p95: latencies[p95Index],
      p99: latencies[p99Index],
      avg: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      min: latencies[0],
      max: latencies[latencies.length - 1]
    }
  }

  /**
   * 获取测试历史
   */
  static async getTestHistory(
    workspaceId: string,
    options?: {
      provider?: string
      modelName?: string
      limit?: number
    }
  ) {
    const { provider, modelName, limit = 50 } = options || {}

    return await prisma.modelTestResult.findMany({
      where: {
        workspaceId,
        ...(provider && { provider }),
        ...(modelName && { modelName })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  /**
   * 获取模型目录
   */
  static async getModelCatalog(workspaceId: string) {
    return await prisma.modelCatalog.findMany({
      where: { workspaceId },
      orderBy: [
        { isPrimary: 'desc' },
        { fallbackOrder: 'asc' },
        { provider: 'asc' },
        { modelName: 'asc' }
      ]
    })
  }

  /**
   * 更新模型目录
   */
  static async updateModelCatalog(
    workspaceId: string,
    models: Array<{
      provider: string
      modelName: string
      displayName: string
      enabled: boolean
      isPrimary: boolean
      fallbackOrder?: number
      metadata?: Record<string, any>
    }>
  ) {
    // 使用事务批量更新
    await prisma.$transaction(async tx => {
      // 删除现有目录
      await tx.modelCatalog.deleteMany({ where: { workspaceId } })

      // 插入新目录
      await tx.modelCatalog.createMany({
        data: models.map(m => ({
          workspaceId,
          provider: m.provider,
          modelName: m.modelName,
          displayName: m.displayName,
          enabled: m.enabled,
          isPrimary: m.isPrimary,
          fallbackOrder: m.fallbackOrder,
          metadata: JSON.stringify(m.metadata || {})
        }))
      })
    })
  }
}

export { prisma } from './db'
