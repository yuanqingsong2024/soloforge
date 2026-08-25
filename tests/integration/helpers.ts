/**
 * 集成测试基础设施
 * 
 * 提供 Prisma 客户端和测试数据管理辅助函数
 */

import { PrismaClient } from '@prisma/client'

// 测试数据库连接
export const testPrisma = new PrismaClient()

// 默认 Workspace ID
export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 初始化测试数据库
 * 在所有测试开始前调用一次
 */
export async function initTestDatabase(): Promise<void> {
  await testPrisma.$connect()
  // SQLite 需要显式启用外键约束
  await testPrisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')
}

/**
 * 清理测试数据
 * 每个测试的 beforeEach 中调用
 */
export async function cleanupTestData(): Promise<void> {
  // 按依赖关系顺序删除（从叶子到根）
  const orderedTables = [
    // 叶子表
    'audit_logs',
    'outbound_messages',
    'template_runs',
    'artifacts',
    'ticket_tags',
    'contact_targets',
    'ticket_pipeline_states',
    'pipeline_steps',
    'pipelines',
    // 工单相关（contacts 是参考数据，不清理）
    'tickets',
    'tags',
    'approvals',
    // Jobs 和事件
    'jobs',
    'outbox_events',
    'event_records',
    'operation_steps',
    'operation_phases',
    'operations',
    // 监控和告警
    'alerts',
    'doctor_checks',
    'doctor_schedules',
    'notification_policies',
    // 快照和变更
    'snapshot_diffs',
    'workspace_snapshots',
    'change_requests',
    // Agent 相关
    'agent_logs',
    'agent_heartbeats',
    'agent_actions',
    'agent_registrations',
    'host_agents',
    // 部署相关
    'deployment_jobs',
    'upgrade_runs',
    'upgrade_plans',
    'upgrade_policies',
    'maintenance_windows',
    'installed_versions',
    'version_catalogs',
    'deployment_targets',
    'openclaw_detections',
    // 配置相关
    'model_test_results',
    'model_catalog',
    'config_drafts',
    'diagnostic_reports',
    'message_templates',
    'comms_targets',
    'comms_profiles',
    'workspace_policies',
    'workspace_profiles',
    'agent_tools',
    'agents',
    // 保留 roles, tools, connection_profiles (seed 数据)
    // 保留 DEFAULT_WORKSPACE_ID
  ]

  // 清理 workspaces（除了 DEFAULT_WORKSPACE_ID）
  try {
    await testPrisma.$executeRawUnsafe(
      `DELETE FROM workspaces WHERE id != '${DEFAULT_WORKSPACE_ID}'`
    )
  } catch (e) {
    // 忽略错误
  }

  for (const table of orderedTables) {
    try {
      await testPrisma.$executeRawUnsafe(`DELETE FROM ${table}`)
    } catch (e) {
      // 忽略错误
    }
  }

  // 确保默认 workspace 存在
  try {
    const existing = await testPrisma.workspace.findUnique({
      where: { id: DEFAULT_WORKSPACE_ID }
    })
    if (!existing) {
      await testPrisma.workspace.create({
        data: {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Default',
          description: 'Default workspace',
          envType: 'DEV',
          setupCompleted: true
        }
      })
    }
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 生成测试用 trace_id
 */
export function generateTestTraceId(): string {
  return `test-trace-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * 创建测试用 Workspace
 */
export async function createTestWorkspace(name: string): Promise<string> {
  const id = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  await testPrisma.workspace.create({
    data: {
      id,
      name,
      description: `Test workspace: ${name}`,
      envType: 'DEV',
      setupCompleted: true
    }
  })
  return id
}

/**
 * 清理测试 Workspace
 */
export async function cleanupTestWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    return // 不删除默认 workspace
  }
  
  // 先清理所有关联表（按依赖关系）
  const relatedTables = [
    'audit_logs',
    'outbound_messages',
    'template_runs',
    'artifacts',
    'ticket_tags',
    'contact_targets',
    'ticket_pipeline_states',
    'tickets',
    'approvals',
    'jobs',
    'outbox_events',
    'event_records',
    'operation_steps',
    'operation_phases',
    'operations',
    'alerts',
    'doctor_checks',
    'doctor_schedules',
    'notification_policies',
    'snapshot_diffs',
    'workspace_snapshots',
    'change_requests',
    'agent_logs',
    'agent_heartbeats',
    'agent_actions',
    'agent_registrations',
    'host_agents',
    'deployment_jobs',
    'upgrade_runs',
    'upgrade_plans',
    'upgrade_policies',
    'maintenance_windows',
    'installed_versions',
    'version_catalogs',
    'deployment_targets',
    'openclaw_detections',
    'model_test_results',
    'model_catalog',
    'config_drafts',
    'diagnostic_reports',
    'message_templates',
    'comms_targets',
    'comms_profiles',
    'workspace_policies',
    'workspace_profiles',
    'contacts',
  ]
  
  for (const table of relatedTables) {
    try {
      await testPrisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE workspace_id = '${workspaceId}'`)
    } catch (e) {
      // 忽略错误
    }
  }
  
  // 最后删除 workspace
  try {
    await testPrisma.workspace.delete({
      where: { id: workspaceId }
    })
  } catch (e) {
    // 忽略错误
  }
}
