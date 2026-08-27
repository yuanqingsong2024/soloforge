/**
 * Workspace Claude Code Client 封装
 *
 * 职责：
 * - 解析 workspace 对应的 Claude Code 客户端
 * - 管理 per-workspace 的连接配置
 *
 * 连接配置由 WorkspaceProfile 解析，凭证通过安全存储在调用层注入。
 */

import { ClaudeCodeClient } from './claudecode-client'
import { prisma } from './db'

// 导出 client 类型供其他模块使用
export type ClaudeCodeClientType = ClaudeCodeClient

export interface ResolvedClient {
  profileId: string
  client: ClaudeCodeClientType
  baseUrl: string
}

/**
 * 解析 workspace 对应的 Claude Code 客户端
 *
 * @param workspaceId - Workspace ID (预留，后续实现需要)
 * @returns 包含 profileId 和 client 的解析结果
 */
export async function resolveWorkspaceClaudeCodeClient(workspaceId: string): Promise<ResolvedClient> {
  const workspaceProfile = await prisma.workspaceProfile.findFirst({
    where: { workspaceId },
    orderBy: { isDefault: 'desc' },
    include: { profile: true }
  })
  if (!workspaceProfile) {
    throw new Error(`Workspace ${workspaceId} 未配置连接 Profile`)
  }

  return {
    profileId: workspaceProfile.profileId,
    client: new ClaudeCodeClient(workspaceProfile.profile.baseUrl),
    baseUrl: workspaceProfile.profile.baseUrl
  }
}
