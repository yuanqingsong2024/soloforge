/**
 * Hermes Workers API 路由
 *
 * 提供 Hermes Worker 配置和任务管理的 REST API
 */

import type { FastifyInstance } from 'fastify'
import { HermesAdapter } from '../hermes-adapter'
import { HarnessController } from '../harness-controller'
import { WorkerRegistry } from '../worker-registry'

// Schema 定义
const workerSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    baseUrl: { type: 'string' },
    wsUrl: { type: 'string', nullable: true },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    capabilities: { type: 'object' },
    lastHealthAt: { type: 'string', nullable: true },
    lastHealthStatus: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  }
}

const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    workerId: { type: 'string' },
    ticketId: { type: 'string', nullable: true },
    taskType: { type: 'string' },
    prompt: { type: 'string' },
    status: { type: 'string' },
    result: { type: 'object', nullable: true },
    error: { type: 'string', nullable: true },
    logs: { type: 'string', nullable: true },
    traceId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    worker: workerSchema
  }
}

const healthReportSchema = {
  type: 'object',
  properties: {
    workerId: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    latency: { type: 'number', nullable: true },
    error: { type: 'string', nullable: true },
    checkedAt: { type: 'string' }
  }
}

export async function registerHermesRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================
  // Worker 管理
  // ============================================

  /**
   * 列出所有 Hermes Worker
   */
  fastify.get('/api/hermes/workers', {
    schema: {
      description: '列出所有 Hermes Worker',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: workerSchema
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const workers = await HermesAdapter.listWorkers()
    return reply.send({
      success: true,
      data: workers.map(w => ({
        ...w,
        tags: JSON.parse(w.tags || '[]'),
        capabilities: JSON.parse(w.capabilities || '{}')
      }))
    })
  })

  /**
   * 创建 Hermes Worker
   */
  fastify.post('/api/hermes/workers', {
    schema: {
      description: '创建 Hermes Worker',
      body: {
        type: 'object',
        required: ['name', 'baseUrl'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          baseUrl: { type: 'string' },
          wsUrl: { type: 'string' },
          authToken: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          capabilities: {
            type: 'object',
            properties: {
              code: { type: 'boolean' },
              analysis: { type: 'boolean' },
              general: { type: 'boolean' },
              tools: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: workerSchema
          }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const worker = await HermesAdapter.createWorker({
      name: body.name as string,
      description: body.description as string | undefined,
      baseUrl: body.baseUrl as string,
      wsUrl: body.wsUrl as string | undefined,
      authToken: body.authToken as string | undefined,
      tags: body.tags as string[] | undefined,
      capabilities: body.capabilities as Record<string, unknown> | undefined
    })

    // 同步到 Worker 注册表
    await WorkerRegistry.syncHermesWorkers()

    return reply.send({
      success: true,
      data: {
        ...worker,
        tags: JSON.parse(worker.tags || '[]'),
        capabilities: JSON.parse(worker.capabilities || '{}')
      }
    })
  })

  /**
   * 获取 Worker 详情
   */
  fastify.get('/api/hermes/workers/:id', {
    schema: {
      description: '获取 Hermes Worker 详情',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: workerSchema
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const worker = await HermesAdapter.getWorker(id)
    if (!worker) {
      return reply.code(404).send({ success: false, error: 'Worker 不存在' })
    }

    return reply.send({
      success: true,
      data: {
        ...worker,
        tags: JSON.parse(worker.tags || '[]'),
        capabilities: JSON.parse(worker.capabilities || '{}')
      }
    })
  })

  /**
   * 更新 Worker
   */
  fastify.put('/api/hermes/workers/:id', {
    schema: {
      description: '更新 Hermes Worker',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          baseUrl: { type: 'string' },
          wsUrl: { type: 'string' },
          authToken: { type: 'string' },
          enabled: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          capabilities: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: workerSchema
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>

    try {
      const worker = await HermesAdapter.updateWorker(id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        baseUrl: body.baseUrl as string | undefined,
        wsUrl: body.wsUrl as string | undefined,
        authToken: body.authToken as string | undefined,
        enabled: body.enabled as boolean | undefined,
        tags: body.tags as string[] | undefined,
        capabilities: body.capabilities as Record<string, unknown> | undefined
      })

      // 同步到 Worker 注册表
      await WorkerRegistry.syncHermesWorkers()

      return reply.send({
        success: true,
        data: {
          ...worker,
          tags: JSON.parse(worker.tags || '[]'),
          capabilities: JSON.parse(worker.capabilities || '{}')
        }
      })
    } catch (error) {
      return reply.code(404).send({
        success: false,
        error: error instanceof Error ? error.message : '更新失败'
      })
    }
  })

  /**
   * 删除 Worker
   */
  fastify.delete('/api/hermes/workers/:id', {
    schema: {
      description: '删除 Hermes Worker',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await HermesAdapter.deleteWorker(id)
      // 从注册表移除
      WorkerRegistry.unregister('hermes', id)

      return reply.send({ success: true })
    } catch (error) {
      return reply.code(404).send({
        success: false,
        error: error instanceof Error ? error.message : '删除失败'
      })
    }
  })

  /**
   * Worker 健康检查
   */
  fastify.post('/api/hermes/workers/:id/ping', {
    schema: {
      description: 'Hermes Worker 健康检查',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            latency: { type: 'number' },
            error: { type: 'string', nullable: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await HermesAdapter.ping(id)

    // 更新注册表中的健康状态
    WorkerRegistry.updateHealth('hermes', id, result.success ? 'healthy' : 'degraded')

    return reply.send({
      success: result.success,
      latency: result.latency,
      error: result.error || null
    })
  })

  // ============================================
  // 任务管理
  // ============================================

  /**
   * 列出任务
   */
  fastify.get('/api/hermes/tasks', {
    schema: {
      description: '列出 Hermes 任务',
      querystring: {
        type: 'object',
        properties: {
          workerId: { type: 'string' },
          ticketId: { type: 'string' },
          status: { type: 'string' },
          taskType: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: taskSchema
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const query = request.query as {
      workerId?: string
      ticketId?: string
      status?: string
      taskType?: string
    }

    const tasks = await HarnessController.listTasks({
      workerId: query.workerId,
      ticketId: query.ticketId,
      status: query.status,
      taskType: query.taskType
    })

    return reply.send({
      success: true,
      data: tasks.map(task => ({
        ...task,
        result: task.result || null,
        error: task.error || null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      }))
    })
  })

  /**
   * 派发任务
   */
  fastify.post('/api/hermes/tasks', {
    schema: {
      description: '派发 Hermes 任务',
      body: {
        type: 'object',
        required: ['taskType', 'prompt'],
        properties: {
          ticketId: { type: 'string' },
          taskType: { type: 'string' },
          prompt: { type: 'string' },
          context: { type: 'object' },
          preferredWorkerType: { type: 'string' },
          preferredWorkerId: { type: 'string' },
          requireApproval: { type: 'boolean' },
          createdBy: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                workerId: { type: 'string' },
                workerType: { type: 'string' },
                workerName: { type: 'string' },
                traceId: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>

    try {
      const result = await HarnessController.dispatch({
        ticketId: body.ticketId as string | undefined,
        taskType: body.taskType as string,
        prompt: body.prompt as string,
        context: body.context as Record<string, unknown> | undefined,
        preferredWorkerType: body.preferredWorkerType as 'hermes' | undefined,
        preferredWorkerId: body.preferredWorkerId as string | undefined,
        requireApproval: body.requireApproval as boolean | undefined,
        createdBy: body.createdBy as string | undefined
      })

      return reply.send({
        success: true,
        data: result
      })
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : '派发失败'
      })
    }
  })

  /**
   * 获取任务详情
   */
  fastify.get('/api/hermes/tasks/:id', {
    schema: {
      description: '获取任务详情',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: taskSchema
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const task = await HarnessController.getTaskStatus(id)
      return reply.send({
        success: true,
        data: {
          ...task,
          result: task.result || null,
          error: task.error || null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString()
        }
      })
    } catch (error) {
      return reply.code(404).send({
        success: false,
        error: error instanceof Error ? error.message : '任务不存在'
      })
    }
  })

  /**
   * 取消任务
   */
  fastify.post('/api/hermes/tasks/:id/cancel', {
    schema: {
      description: '取消 Hermes 任务',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await HarnessController.cancelTask(id)
      return reply.send({ success: true })
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : '取消失败'
      })
    }
  })

  // ============================================
  // 系统接口
  // ============================================

  /**
   * 获取 Worker 统计
   */
  fastify.get('/api/hermes/stats', {
    schema: {
      description: '获取 Worker 统计信息',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                byType: { type: 'object' },
                byHealth: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const stats = HarnessController.getWorkerStats()
    return reply.send({
      success: true,
      data: stats
    })
  })

  /**
   * 健康检查所有 Worker
   */
  fastify.post('/api/hermes/health-check', {
    schema: {
      description: '健康检查所有 Hermes Worker',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: healthReportSchema
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const reports = await WorkerRegistry.healthCheck()
    return reply.send({
      success: true,
      data: reports.map(r => ({
        ...r,
        checkedAt: r.checkedAt.toISOString()
      }))
    })
  })

  /**
   * 同步 Worker 注册表
   */
  fastify.post('/api/hermes/sync', {
    schema: {
      description: '同步 Worker 注册表',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    await HarnessController.syncWorkerRegistry()
    return reply.send({ success: true })
  })
}
