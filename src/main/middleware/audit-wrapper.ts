/**
 * 统一审计中间件模块
 *
 * 职责：
 * 1. 提供 `auditedRoute()` 包装器，统一处理 traceId 生成、审计日志写入、错误处理
 * 2. 消除 api-server.ts 和各路由模块中 50+ 处重复的 try/catch + prisma.auditLog.create() 模式
 * 3. 保证审计日志覆盖率达 100%，无遗漏端点
 *
 * 设计约束（AGENTS.md §6）：
 * - AuditLog 只允许 create，禁止 update/delete
 * - 敏感字段必须 mask（由 audit-log-writer 处理）
 * - 错误信息用中文且可定位，不含敏感信息
 * - 禁止空 catch 块
 *
 * 使用方式：
 * ```typescript
 * // 旧写法（大量重复）
 * fastify.post('/api/xxx', async (request, reply) => {
 *   const traceId = uuidv4()
 *   const actor = 'admin'
 *   try {
 *     const result = await doSomething()
 *     await prisma.auditLog.create({ data: { traceId, actor, action: 'XXX', ... } })
 *     return result
 *   } catch (error) {
 *     await prisma.auditLog.create({ data: { traceId, actor, action: 'XXX_FAILED', ... } })
 *     reply.code(500)
 *     return { success: false, error: error.message }
 *   }
 * })
 *
 * // 新写法（使用包装器）
 * fastify.post('/api/xxx', auditedRoute({
 *   action: 'XXX',
 *   tool: 'module-name',
 *   handler: async (request, actor) => {
 *     return await doSomething()
 *   }
 * }))
 * ```
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { writeAuditLog } from '../services/audit-log-writer'
import { extractActor, type ActorContext } from '../services/auth-context'
import { logger } from '../services/logger'

/**
 * 审计路由选项
 */
export interface AuditedRouteOptions {
  /** 动作名称（如 'WORKSPACE_CREATE' / 'CHANGE_REQUEST_EXECUTE'） */
  action: string
  /** 工具标识（如 'workspaces' / 'change-request' / 'deployment'） */
  tool: string
  /** 请求处理器，返回结果 */
  handler: (request: FastifyRequest, actor: ActorContext) => Promise<unknown>
  /**
   * 可选：从请求中提取 workspaceId 的路径参数名
   * 默认为 'workspaceId'
   * 如果为 false，则不自动从路径参数提取
   */
  workspaceIdParam?: string | false
  /**
   * 可选：是否记录响应内容（默认 true）
   * 设为 false 可避免大量响应数据的序列化开销
   */
  logResponse?: boolean
}

/**
 * 审计包装器结果
 */
interface AuditedResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * 统一的审计路由包装器
 *
 * 行为：
 * 1. 自动提取 Actor 上下文（userId / workspaceId / traceId）
 * 2. 自动生成 traceId（如果请求中未提供）
 * 3. 执行 handler，记录成功/失败的审计日志
 * 4. 统一错误处理，不泄漏敏感堆栈信息
 * 5. 统一响应格式：{ success: true, data: ... } 或 { success: false, error: '...' }
 *
 * @param options 审计路由选项
 * @returns Fastify 路由处理器
 */
export function auditedRoute(
  options: AuditedRouteOptions
) {
  const {
    action,
    tool,
    handler,
    workspaceIdParam = 'workspaceId',
    logResponse = true
  } = options

  return async function auditedHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<AuditedResult> {
    // 1. 提取 Actor 上下文
    let workspaceIdFromParams: string | undefined
    if (workspaceIdParam !== false) {
      const params = request.params as Record<string, string | undefined>
      workspaceIdFromParams = params[workspaceIdParam as string]
    }
    const actor = extractActor(request, workspaceIdFromParams)
    const traceId = actor.traceId

    // 2. 记录请求开始时间（用于耗时计算）
    const startTime = Date.now()

    try {
      // 3. 执行实际业务逻辑
      const result = await handler(request, actor)

      // 4. 计算耗时
      const durationMs = Date.now() - startTime

      // 5. 写入成功审计日志
      await writeAuditLog({
        traceId,
        workspaceId: actor.workspaceId,
        actor: actor.userId,
        action,
        tool,
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          durationMs
        },
        response: logResponse
          ? { success: true, data: result }
          : { success: true, data: '[omitted]' }
      })

      // 6. 返回成功响应
      return { success: true, data: result }
    } catch (error) {
      // 7. 计算耗时
      const durationMs = Date.now() - startTime

      // 8. 提取错误消息（不泄漏敏感堆栈）
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 9. 写入失败审计日志
      await writeAuditLog({
        traceId,
        workspaceId: actor.workspaceId,
        actor: actor.userId,
        action: `${action}_FAILED`,
        tool,
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          durationMs
        },
        response: { success: false, error: errorMessage }
      })

      // 10. 记录错误到应用日志（用于调试，不含敏感信息）
      logger.error(`[Audit] ${action} failed traceId=${traceId} actor=${actor.userId} error=${errorMessage}`)

      // 11. 返回失败响应
      reply.code(500)
      return { success: false, error: errorMessage }
    }
  }
}

/**
 * 简化版审计路由包装器（仅传入异步函数，自动提取 actor）
 *
 * 适用于不需要 FastifyRequest 完整对象的简单端点
 *
 * @param options 审计路由选项（handler 只接收 actor 上下文）
 * @returns Fastify 路由处理器
 */
export function simpleAuditedRoute(
  options: Omit<AuditedRouteOptions, never> & {
    handler: (actor: ActorContext) => Promise<unknown>
    workspaceIdParam?: string | false
  }
) {
  const { action, tool, handler, workspaceIdParam = 'workspaceId', logResponse = true } = options

  return async function simpleAuditedHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<AuditedResult> {
    let workspaceIdFromParams: string | undefined
    if (workspaceIdParam !== false) {
      const params = request.params as Record<string, string | undefined>
      workspaceIdFromParams = params[workspaceIdParam as string]
    }
    const actor = extractActor(request, workspaceIdFromParams)
    const traceId = actor.traceId
    const startTime = Date.now()

    try {
      const result = await handler(actor)
      const durationMs = Date.now() - startTime

      await writeAuditLog({
        traceId,
        workspaceId: actor.workspaceId,
        actor: actor.userId,
        action,
        tool,
        request: { method: request.method, url: request.url, params: request.params, durationMs },
        response: logResponse ? { success: true, data: result } : { success: true, data: '[omitted]' }
      })

      return { success: true, data: result }
    } catch (error) {
      const durationMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      await writeAuditLog({
        traceId,
        workspaceId: actor.workspaceId,
        actor: actor.userId,
        action: `${action}_FAILED`,
        tool,
        request: { method: request.method, url: request.url, params: request.params, durationMs },
        response: { success: false, error: errorMessage }
      })

      logger.error(`[Audit] ${action} failed traceId=${traceId} actor=${actor.userId} error=${errorMessage}`)
      reply.code(500)
      return { success: false, error: errorMessage }
    }
  }
}

/**
 * 获取当前请求的 Actor 上下文
 *
 * 用于在 handler 内部获取 actor 信息（如记录关联的 ticketId 等）
 *
 * @param request Fastify 请求对象
 * @param workspaceIdParam 路径参数中的 workspaceId 字段名
 * @returns ActorContext
 */
export function getActorContext(request: FastifyRequest, workspaceIdParam = 'workspaceId'): ActorContext {
  const params = request.params as Record<string, string | undefined>
  const workspaceIdFromParams = params[workspaceIdParam]
  return extractActor(request, workspaceIdFromParams)
}
