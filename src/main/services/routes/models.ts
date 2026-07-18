/**
 * Models 路由模块 - 模型测试/目录管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ModelTester, type BatchTestConfig, type LatencyStats } from '../model-tester'
import {
  prisma,
  ok,
  fail,
  toErrorMessage
} from '../api-shared'

// ==================== 类型定义 ====================

interface ModelTestBatchBody {
  workspaceId: string
  models: BatchTestConfig['models']
  testPayload: BatchTestConfig['testPayload']
  timeout?: number
  concurrency?: number
}

interface UpdateModelCatalogBody {
  workspaceId: string
  models: Array<{
    provider: string
    modelName: string
    displayName: string
    enabled: boolean
    isPrimary: boolean
    fallbackOrder?: number
    metadata?: Record<string, unknown>
  }>
}

// ==================== 路由注册 ====================

export function registerModelsRoutes(fastify: FastifyInstance): void {
  // 批量测试模型
  fastify.post('/api/models/test-batch', async (request, reply) => {
    const traceId = uuidv4()
    const body = request.body as ModelTestBatchBody
    try {
      const workspaceId = (body.workspaceId || '').trim()
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      if (!Array.isArray(body.models) || body.models.length === 0) {
        reply.code(400)
        return fail('models 不能为空')
      }

      if (!body.testPayload || !Array.isArray(body.testPayload.messages) || body.testPayload.messages.length === 0) {
        reply.code(400)
        return fail('testPayload.messages 不能为空')
      }

      const results = await ModelTester.batchTest(workspaceId, {
        models: body.models,
        testPayload: body.testPayload,
        ...(body.timeout !== undefined ? { timeout: body.timeout } : {}),
        ...(body.concurrency !== undefined ? { concurrency: body.concurrency } : {})
      })

      const computed = ModelTester.calculateLatencyStats(results)
      const stats: LatencyStats =
        computed ||
        ({
          p50: 0,
          p95: 0,
          p99: 0,
          avg: 0,
          min: 0,
          max: 0
        } satisfies LatencyStats)

      return ok({ results, stats })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '批量测试模型失败')
      reply.code(500)
      return fail(`批量测试模型失败：${errMsg}`)
    }
  })

  // 获取模型目录
  fastify.get('/api/models/catalog', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId } = request.query as { workspaceId?: string }
    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const models = await ModelTester.getModelCatalog(wid)
      return ok(models)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取模型目录失败')
      reply.code(500)
      return fail(`获取模型目录失败：${errMsg}`)
    }
  })

  // 更新模型目录
  fastify.put('/api/models/catalog', async (request, reply) => {
    const traceId = uuidv4()
    const body = request.body as UpdateModelCatalogBody
    try {
      const workspaceId = (body.workspaceId || '').trim()
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!Array.isArray(body.models)) {
        reply.code(400)
        return fail('models 必须是数组')
      }

      await ModelTester.updateModelCatalog(workspaceId, body.models)
      return ok({ updated: true })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '更新模型目录失败')
      reply.code(500)
      return fail(`更新模型目录失败：${errMsg}`)
    }
  })

  // 获取模型测试历史
  fastify.get('/api/models/test-history', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId, provider, modelName, limit } = request.query as {
      workspaceId?: string
      provider?: string
      modelName?: string
      limit?: string
    }
    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const parsedLimit = limit === undefined || limit === '' ? undefined : Number(limit)
      if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        reply.code(400)
        return fail('limit 必须是正整数')
      }

      const history = await ModelTester.getTestHistory(wid, {
        provider: provider || undefined,
        modelName: modelName || undefined,
        limit: parsedLimit
      })

      return ok(history)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取模型测试历史失败')
      reply.code(500)
      return fail(`获取模型测试历史失败：${errMsg}`)
    }
  })

  // 兼容端点：前端配置中心使用 /api/model-catalog
  fastify.get('/api/model-catalog', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId } = request.query as { workspaceId?: string }
    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const models = await ModelTester.getModelCatalog(wid)
      const latest = await prisma.modelTestResult.findMany({
        where: { workspaceId: wid },
        orderBy: { createdAt: 'desc' },
        take: 500
      })
      const latestMap = new Map<string, { status: string; latencyMs: number | null; createdAt: Date }>()
      for (const row of latest) {
        const key = `${row.provider}::${row.modelName}`
        if (!latestMap.has(key)) {
          latestMap.set(key, { status: row.status, latencyMs: row.latencyMs ?? null, createdAt: row.createdAt })
        }
      }

      const merged = models.map(m => {
        const key = `${m.provider}::${m.modelName}`
        const lt = latestMap.get(key)
        return {
          ...m,
          latestTest: lt
            ? {
                status: lt.status,
                latencyMs: lt.latencyMs,
                createdAt: lt.createdAt.toISOString()
              }
            : null
        }
      })

      return ok(merged)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取模型目录(兼容)失败')
      reply.code(500)
      return fail(`获取模型目录失败：${errMsg}`)
    }
  })
}
