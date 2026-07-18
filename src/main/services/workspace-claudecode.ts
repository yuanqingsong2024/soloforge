/**
 * Workspace Claude Code Client 封装
 *
 * 职责：
 * - 解析 workspace 对应的 Claude Code 客户端
 * - 管理 per-workspace 的连接配置
 *
 * 注意：此模块目前为占位符，后续与 Claude CodeClient 集成时完善
 */

import { ClaudeCodeClient } from './claudecode-client'

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
export async function resolveWorkspaceClaudeCodeClient(_workspaceId: string): Promise<ResolvedClient> {
  // TODO: 完整实现需要查询 workspace 关联的 ConnectionProfile 并创建对应的 Claude CodeClient
  // 目前返回占位数据，后续与 Claude CodeClient 集成时完善
  return {
    profileId: '',
    client: new ClaudeCodeClient('http://127.0.0.1:18789'),
    baseUrl: 'http://127.0.0.1:18789'
  }
}
