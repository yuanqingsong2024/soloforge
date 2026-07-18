/**
 * Infrastructure 辅助函数模块
 * 
 * 注意：路由已拆分到独立文件：
 * - models.ts: Models 测试/目录
 * - backup.ts: 备份导入导出
 * - search.ts: 全局搜索
 * - doctor.ts: 诊断检查
 * - alerts.ts: 告警管理
 * - notification-policies.ts: 通知策略
 * - doctor-scheduler.ts: 巡检调度
 * - operations.ts: 操作运行时
 * 
 * 本文件保留共享的辅助函数和类型定义。
 */

import { type FastifyInstance } from 'fastify'
import {
  TEST_WORKSPACE_ID,
  TEST_WORKSPACE_NAME
} from '../api-shared'

// ==================== 类型定义 ====================

interface TestDashboardScenario {
  id: string
  label: string
  payload: { overview: Record<string, unknown>; [key: string]: unknown }
}

// ==================== Dashboard 测试场景（供 operations.ts 使用） ====================

function createTestDashboardScenario(scenarioId: string): TestDashboardScenario {
  const nowIso = new Date('2026-03-15T10:00:00.000+08:00').toISOString()

  const baseScenario: TestDashboardScenario = {
    id: 'default',
    label: '默认 Dashboard 场景',
    payload: {
      generatedAt: nowIso,
      scope: {
        workspaceId: TEST_WORKSPACE_ID,
        workspaceName: TEST_WORKSPACE_NAME,
        mode: 'workspace'
      },
      overview: {
        workspaceCount: 2,
        targetTotals: {
          total: 6,
          healthy: 3,
          degraded: 2,
          unreachable: 1
        },
        openAlerts: 3,
        criticalDrift: 2,
        runningOperations: 1,
        pendingApprovals: 2,
        agents: {
          online: 3,
          offline: 1
        },
        availableUpdates: 2
      },
      criticalIssues: [
        {
          id: 'issue-offline-agent',
          issueType: 'OFFLINE_AGENT',
          severity: 'CRITICAL',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-agent-1',
          targetName: 'edge-host-01',
          summary: 'Host Agent 已离线，需要人工排查。',
          lastOccurredAt: nowIso,
          actions: [{ label: '查看 Agent', route: '/host-agents' }]
        },
        {
          id: 'issue-alert',
          issueType: 'CRITICAL_ALERT',
          severity: 'HIGH',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-alert-1',
          targetName: 'gateway-prod',
          summary: '存在未确认的关键告警。',
          lastOccurredAt: nowIso,
          actions: [{ label: '查看 Alerts', route: '/alerts' }]
        }
      ],
      runtime: {
        operations: {
          running: 1,
          waitingApproval: 2,
          todaySucceeded: 5,
          todayFailed: 1,
          last24hSucceeded: 5,
          last24hFailed: 1,
          last7dSucceeded: 18,
          last7dFailed: 2,
          recent: [{ id: 'op-1', title: '同步实际状态', type: 'SYNC', status: 'RUNNING', updatedAt: nowIso }]
        },
        hostAgents: {
          online: 3,
          degraded: 0,
          offline: 1,
          recentHeartbeatAnomalies: 1,
          recentAnomalies: [{ id: 'agent-1', name: 'edge-host-01', status: 'OFFLINE', lastHeartbeatAt: nowIso }]
        },
        deployments: {
          healthy: 3,
          degraded: 2,
          unreachable: 1,
          recentJobs: [{ id: 'deploy-1', targetId: 'target-1', targetName: 'gateway-prod', type: 'RESTART', status: 'FAILED', createdAt: nowIso }]
        },
        remediation: {
          todayTotal: 4,
          blocked: 1,
          failed: 1,
          succeeded: 2,
          running: 0,
          recent: [{ id: 'remediation-1', title: '恢复 host-agent 连接', status: 'FAILED', updatedAt: nowIso }]
        },
        trends: {
          criticalEvents24h: 2,
          criticalEvents7d: 5
        }
      },
      pendingActions: [
        {
          id: 'pending-approval-1',
          actionType: 'PENDING_APPROVAL',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待审批配置变更',
          summary: '需要人工确认后继续执行。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/approvals'
        },
        {
          id: 'pending-change-1',
          actionType: 'PENDING_CHANGE_REQUEST',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待处理变更单',
          summary: '存在待收敛的 Drift 变更。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/changes'
        },
        {
          id: 'pending-upgrade-1',
          actionType: 'PENDING_UPGRADE_PLAN',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待处理升级计划',
          summary: '有可执行升级，等待确认。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/upgrade-plans'
        }
      ],
      activityPreview: [
        {
          id: 'activity-1',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-1',
          targetName: 'gateway-prod',
          sourceType: 'SYSTEM',
          eventType: 'TARGET_UNREACHABLE',
          severity: 'CRITICAL',
          title: '目标不可达',
          summary: '监测到 gateway-prod 不可达。',
          traceId: 'trace-activity-1',
          createdAt: nowIso
        },
        {
          id: 'activity-2',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          sourceType: 'HOST_AGENT',
          eventType: 'HEARTBEAT_MISSED',
          severity: 'WARN',
          title: 'Host Agent 心跳异常',
          summary: 'edge-host-01 在阈值内未上报心跳。',
          traceId: 'trace-activity-2',
          createdAt: nowIso
        }
      ],
      healthScore: {
        score: 68,
        label: 'WARNING',
        summary: '存在离线 Agent 与未处理风险项。',
        factors: [
          { key: 'alerts', label: 'Alerts 严重度', weight: 30, penalty: 12, description: '存在高优先级风险告警。' },
          { key: 'agents', label: 'Host Agent 在线率', weight: 20, penalty: 8, description: '1 个 Agent 离线。' }
        ]
      }
    }
  }

  if (scenarioId === 'workspace-secondary') {
    return {
      id: 'workspace-secondary',
      label: 'Secondary Workspace Dashboard 场景',
      payload: {
        ...baseScenario.payload,
        scope: {
          workspaceId: '00000000-0000-0000-0000-000000000002',
          workspaceName: 'Remote Workspace',
          mode: 'workspace'
        },
        overview: {
          ...baseScenario.payload.overview,
          targetTotals: { total: 2, healthy: 2, degraded: 0, unreachable: 0 },
          openAlerts: 1,
          criticalDrift: 0,
          pendingApprovals: 1,
          agents: { online: 2, offline: 0 },
          availableUpdates: 1
        },
        criticalIssues: [
          {
            id: 'issue-secondary-alert',
            issueType: 'CRITICAL_ALERT',
            severity: 'HIGH',
            workspaceId: '00000000-0000-0000-0000-000000000002',
            workspaceName: 'Remote Workspace',
            targetId: 'target-remote-1',
            targetName: 'remote-runner',
            summary: 'Remote Workspace 存在待处理 Alert。',
            lastOccurredAt: nowIso,
            actions: [{ label: '查看 Alerts', route: '/alerts' }]
          }
        ],
        pendingActions: [
          {
            id: 'pending-secondary-approval',
            actionType: 'PENDING_APPROVAL',
            workspaceId: '00000000-0000-0000-0000-000000000002',
            workspaceName: 'Remote Workspace',
            title: 'Remote Workspace 审批项',
            summary: '切换后上下文应更新为新 Workspace。',
            status: 'PENDING',
            createdAt: nowIso,
            route: '/approvals'
          }
        ],
        activityPreview: [
          {
            id: 'activity-secondary-1',
            workspaceId: '00000000-0000-0000-0000-000000000002',
            workspaceName: 'Remote Workspace',
            sourceType: 'SYSTEM',
            eventType: 'REMOTE_SYNC_OK',
            severity: 'INFO',
            title: 'Remote Workspace 同步成功',
            summary: '远程工作区数据已刷新。',
            traceId: 'trace-secondary-1',
            createdAt: nowIso
          }
        ],
        healthScore: {
          score: 84,
          label: 'GOOD',
          summary: 'Remote Workspace 整体状态良好。',
          factors: [{ key: 'agents', label: 'Host Agent 在线率', weight: 20, penalty: 0, description: '所有 Agent 均在线。' }]
        }
      }
    }
  }

  if (scenarioId === 'empty-state') {
    return {
      id: 'empty-state',
      label: '空状态 Dashboard 场景',
      payload: {
        ...baseScenario.payload,
        overview: {
          ...baseScenario.payload.overview,
          openAlerts: 0,
          criticalDrift: 0,
          pendingApprovals: 0
        },
        criticalIssues: [],
        pendingActions: [],
        activityPreview: [
          {
            id: 'activity-empty-1',
            workspaceId: TEST_WORKSPACE_ID,
            workspaceName: TEST_WORKSPACE_NAME,
            sourceType: 'SYSTEM',
            eventType: 'DASHBOARD_IDLE',
            severity: 'INFO',
            title: '当前无待处理风险',
            summary: 'Dashboard 处于空状态展示。',
            traceId: 'trace-empty-1',
            createdAt: nowIso
          }
        ],
        healthScore: {
          score: 96,
          label: 'GOOD',
          summary: '当前无关键风险项。',
          factors: [{ key: 'alerts', label: 'Alerts 严重度', weight: 30, penalty: 0, description: '无未解决风险告警。' }]
        }
      }
    }
  }

  return baseScenario
}

export function getTestDashboardResponse(workspaceId?: string): TestDashboardScenario['payload'] {
  const scenario = workspaceId === '00000000-0000-0000-0000-000000000002'
    ? createTestDashboardScenario('workspace-secondary')
    : createTestDashboardScenario(process.env.SOLOFORGE_E2E_DASHBOARD_SCENARIO || 'default')

  return scenario.payload
}

// ==================== 路由注册（保留空实现以保持 API 兼容性） ====================

/**
 * @deprecated 路由已拆分到独立文件，此函数保留空实现以保持 API 兼容性
 */
export function registerInfrastructureRoutes(_fastify: FastifyInstance): void {
  // 路由已拆分到独立文件：
  // - registerModelsRoutes (models.ts)
  // - registerBackupRoutes (backup.ts)
  // - registerSearchRoutes (search.ts)
  // - registerDoctorRoutes (doctor.ts)
  // - registerAlertsRoutes (alerts.ts)
  // - registerNotificationPolicyRoutes (notification-policies.ts)
  // - registerDoctorSchedulerRoutes (doctor-scheduler.ts)
  // - registerOperationsRoutes (operations.ts)
}
