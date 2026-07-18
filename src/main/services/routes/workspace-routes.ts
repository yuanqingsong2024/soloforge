/**
 * Workspace Routes 路由模块
 * 
 * 注意：路由已拆分到独立文件：
 * - workspace-env.ts: 工作区环境管理
 * - workspace-snapshots.ts: 工作区快照管理
 * - workspace-drift.ts: 工作区配置漂移检测
 * - workspace-changes.ts: 变更请求管理
 * 
 * 本文件保留空实现以保持 API 兼容性。
 */

import { type FastifyInstance } from 'fastify'

/**
 * @deprecated 路由已拆分到独立文件
 */
export function registerWorkspaceRoutes(_fastify: FastifyInstance): void {
  // 路由已拆分到独立文件：
  // - registerWorkspaceEnvRoutes (workspace-env.ts)
  // - registerWorkspaceSnapshotsRoutes (workspace-snapshots.ts)
  // - registerWorkspaceDriftRoutes (workspace-drift.ts)
  // - registerWorkspaceChangesRoutes (workspace-changes.ts)
}
