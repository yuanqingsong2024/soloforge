/**
 * Actor 上下文提取模块
 *
 * 职责：
 * 1. 从 Fastify 请求中提取操作者上下文（userId / workspaceId / traceId）
 * 2. 提供默认值回退，保证向后兼容
 * 3. 为审计日志提供动态 actor 信息，替代硬编码的 'admin'
 *
 * 设计约束（AGENTS.md §6）：
 * - 错误信息用中文且可定位，不含敏感信息
 * - 禁止空 catch 块
 *
 * 演进路线：
 * - 短期（当前）：从 HTTP header 提取（X-User-Id / X-Workspace-Id / X-Trace-Id）
 * - 中期：从 JWT Token 提取
 * - 长期：支持多角色（admin / operator / viewer）权限分级
 */

import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

/**
 * 操作者角色
 * - admin：完全权限（当前阶段所有用户默认为 admin）
 * - operator：可执行操作，但不能修改安全配置
 * - viewer：只读访问
 */
export type ActorRole = 'admin' | 'operator' | 'viewer'

/**
 * Actor 上下文
 * 贯穿整个请求处理链路，用于审计日志、权限检查
 */
export interface ActorContext {
  /** 操作者 ID（从 X-User-Id 提取，默认 'admin'） */
  userId: string
  /** 工作区 ID（从 X-Workspace-Id 或路径参数提取） */
  workspaceId: string
  /** 操作者角色（当前阶段固定为 admin） */
  role: ActorRole
  /** 追踪 ID（从 X-Trace-Id 提取，或自动生成） */
  traceId: string
}

/** 默认工作区 ID（与数据库 schema 中 @default 保持一致） */
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

/** 默认操作者（向后兼容：无 header 时回退到 'admin'） */
const DEFAULT_ACTOR = 'admin'

/**
 * 从 Fastify 请求中提取 Actor 上下文
 *
 * 提取策略（按优先级）：
 * 1. X-User-Id header → userId
 * 2. X-Workspace-Id header → workspaceId（可被路径参数覆盖）
 * 3. X-Trace-Id header → traceId（无则自动生成）
 *
 * @param request Fastify 请求对象
 * @param fallbackWorkspaceId 路径参数中的 workspaceId（优先级高于 header）
 * @returns 完整的 ActorContext
 */
export function extractActor(
  request: FastifyRequest,
  fallbackWorkspaceId?: string
): ActorContext {
  const headers = request.headers

  const userId = (headers['x-user-id'] as string | undefined) || DEFAULT_ACTOR

  const headerWorkspaceId = headers['x-workspace-id'] as string | undefined
  const workspaceId = fallbackWorkspaceId || headerWorkspaceId || DEFAULT_WORKSPACE_ID

  const traceId = (headers['x-trace-id'] as string | undefined) || uuidv4()

  return {
    userId,
    workspaceId,
    role: 'admin', // 短期固定为 admin，中期从 JWT 提取
    traceId
  }
}

/**
 * 从请求路径参数中提取 workspaceId
 *
 * 适用于 /api/workspaces/:workspaceId/... 形式的路由
 *
 * @param request Fastify 请求对象
 * @param paramName 路径参数名，默认 'workspaceId'
 * @returns 路径参数中的 workspaceId，不存在则返回 undefined
 */
export function extractWorkspaceIdFromParams(
  request: FastifyRequest,
  paramName = 'workspaceId'
): string | undefined {
  const params = request.params as Record<string, string | undefined>
  const value = params[paramName]
  return value || undefined
}

/**
 * 创建系统级 Actor 上下文
 *
 * 用于非 HTTP 请求触发的操作（如定时任务、后台调度器、Outbox 重试等）
 *
 * @param action 系统动作名称（如 'doctor-scheduler' / 'outbox-retry'）
 * @param workspaceId 工作区 ID，默认为 DEFAULT_WORKSPACE_ID
 * @returns 系统级 ActorContext
 */
export function createSystemActor(
  action: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID
): ActorContext {
  return {
    userId: `system:${action}`,
    workspaceId,
    role: 'admin',
    traceId: uuidv4()
  }
}
