/**
 * i18n 枚举映射文件
 * 用于将数据库枚举值映射到翻译键
 */

/**
 * 工单状态映射
 */
export const ticketStatusMap: Record<string, string> = {
  INBOX: 'tickets:status.inbox',
  SPEC: 'tickets:status.spec',
  DEV: 'tickets:status.dev',
  TEST: 'tickets:status.test',
  DELIVERY: 'tickets:status.delivery',
  DONE: 'tickets:status.done'
}

/**
 * 工单优先级映射
 */
export const ticketPriorityMap: Record<string, string> = {
  LOW: 'tickets:priority.low',
  MEDIUM: 'tickets:priority.medium',
  HIGH: 'tickets:priority.high',
  URGENT: 'tickets:priority.urgent'
}

/**
 * 工单来源映射
 */
export const ticketSourceMap: Record<string, string> = {
  EMAIL: 'tickets:source.email',
  SLACK: 'tickets:source.slack',
  MANUAL: 'tickets:source.manual',
  API: 'tickets:source.api'
}

/**
 * 审批状态映射
 */
export const approvalStatusMap: Record<string, string> = {
  PENDING: 'approval:status.pending',
  APPROVED: 'approval:status.approved',
  REJECTED: 'approval:status.rejected',
  CANCELED: 'approval:status.canceled'
}

/**
 * 审批动作类型映射
 */
export const approvalTypeMap: Record<string, string> = {
  SEND_EXTERNAL: 'approval:actionTypes.sendExternal',
  MERGE_MAIN: 'approval:actionTypes.mergeMain',
  DEPLOY_PROD: 'approval:actionTypes.deployProd',
  EXPORT_DATA: 'approval:actionTypes.exportData',
  PURCHASE: 'approval:actionTypes.purchase',
  CHANGE_CONFIG: 'approval:actionTypes.changeConfig',
  ROTATE_TOKEN: 'approval:actionTypes.rotateToken',
  CHANGE_POLICY: 'approval:actionTypes.changePolicy',
  CHANGE_WORKSPACE_ENV: 'approval:actionTypes.changeWorkspaceEnv',
  UNLOCK_WORKSPACE: 'approval:actionTypes.unlockWorkspace',
  START_SERVICE: 'approval:actionTypes.startService',
  STOP_SERVICE: 'approval:actionTypes.stopService',
  RESTART_SERVICE: 'approval:actionTypes.restartService',
  UPGRADE_SERVICE: 'approval:actionTypes.upgradeService'
}

/**
 * 交付物类型映射
 */
export const artifactTypeMap: Record<string, string> = {
  PRD: 'tickets:artifacts.types.prd',
  PLAN: 'tickets:artifacts.types.plan',
  CODE_CHANGE: 'tickets:artifacts.types.codeChange',
  TEST_CASES: 'tickets:artifacts.types.testCases',
  DEPLOY: 'tickets:artifacts.types.deploy',
  ROLLBACK: 'tickets:artifacts.types.rollback',
  DELIVERY_LIST: 'tickets:artifacts.types.deliveryList',
  CLIENT_MSG: 'tickets:artifacts.types.clientMsg'
}

/**
 * 部署类型映射
 */
export const deploymentTypeMap: Record<string, string> = {
  LOCAL_HOST: 'deployment:types.localHost',
  LOCAL_DOCKER: 'deployment:types.localDocker',
  REMOTE_HOST: 'deployment:types.remoteHost',
  REMOTE_DOCKER: 'deployment:types.remoteDocker'
}

/**
 * 部署状态映射
 */
export const deploymentStatusMap: Record<string, string> = {
  HEALTHY: 'deployment:status.healthy',
  DEGRADED: 'deployment:status.degraded',
  UNREACHABLE: 'deployment:status.unreachable',
  UNKNOWN: 'deployment:status.unknown'
}

/**
 * 工具风险等级映射
 */
export const toolRiskLevelMap: Record<string, string> = {
  LOW: 'team:tools.riskLevels.low',
  MEDIUM: 'team:tools.riskLevels.medium',
  HIGH: 'team:tools.riskLevels.high',
  CRITICAL: 'team:tools.riskLevels.critical'
}

/**
 * 通用状态映射
 */
export const commonStatusMap: Record<string, string> = {
  DRAFT: 'common:status.draft',
  PENDING_APPROVAL: 'common:status.pendingApproval',
  APPROVED: 'common:status.approved',
  ACKED: 'common:status.acked',
  RESOLVED: 'common:status.resolved',
  PASS: 'common:status.pass',
  FAIL: 'common:status.fail',
  CONNECTED: 'common:status.connected',
  DISCONNECTED: 'common:status.disconnected',
  ONLINE: 'common:status.online',
  OFFLINE: 'common:status.offline',
  DEGRADED: 'common:status.degraded',
  HEALTHY: 'common:status.healthy',
  UNHEALTHY: 'common:status.unhealthy',
  RUNNING: 'common:status.running',
  SENDING: 'common:status.sending',
  SENT: 'common:status.sent',
  STOPPED: 'common:status.stopped',
  PENDING: 'common:status.pending',
  SUCCEEDED: 'common:status.succeeded',
  FAILED: 'common:status.failed'
}

/**
 * 外发消息状态映射
 */
export const outboundMessageStatusMap: Record<string, string> = {
  DRAFT: 'common:status.draft',
  PENDING_APPROVAL: 'common:status.pendingApproval',
  APPROVED: 'common:status.approved',
  SENDING: 'common:status.sending',
  SENT: 'common:status.sent',
  FAILED: 'common:status.failed',
  CANCELED: 'common:status.canceled'
}

/**
 * Dashboard 健康评分标签映射
 */
export const healthScoreLabelMap: Record<string, string> = {
  GOOD: 'dashboard:healthScore.good',
  WARNING: 'dashboard:healthScore.warning',
  CRITICAL: 'dashboard:healthScore.critical'
}

/**
 * Dashboard 关键问题类型映射
 */
export const criticalIssueTypeMap: Record<string, string> = {
  CRITICAL_ALERT: 'dashboard:criticalIssues.types.criticalAlert',
  CRITICAL_DRIFT: 'dashboard:criticalIssues.types.criticalDrift',
  FAILED_UPGRADE: 'dashboard:criticalIssues.types.failedUpgrade',
  FAILED_REMEDIATION: 'dashboard:criticalIssues.types.failedRemediation',
  OFFLINE_AGENT: 'dashboard:criticalIssues.types.offlineAgent',
  UNREACHABLE_TARGET: 'dashboard:criticalIssues.types.unreachableTarget',
  FAILED_JOB: 'dashboard:criticalIssues.types.failedJob',
  OUTBOX_FAILURE: 'dashboard:criticalIssues.types.outboxFailure',
  BACKUP_STALE: 'dashboard:criticalIssues.types.backupStale',
  MIGRATION_ISSUE: 'dashboard:criticalIssues.types.migrationIssue'
}

/**
 * Dashboard 待办类型映射
 */
export const pendingActionTypeMap: Record<string, string> = {
  PENDING_APPROVAL: 'dashboard:pendingActions.approvals',
  PENDING_CHANGE_REQUEST: 'dashboard:pendingActions.changeRequests',
  PENDING_UPGRADE_PLAN: 'dashboard:pendingActions.upgradePlans',
  PENDING_RECONCILE_PLAN: 'dashboard:pendingActions.reconcilePlans',
  MANUAL_REMEDIATION: 'dashboard:pendingActions.remediationIssues'
}

/**
 * 严重级别映射
 */
export const severityMap: Record<string, string> = {
  INFO: 'common:severity.info',
  LOW: 'common:severity.low',
  MEDIUM: 'common:severity.medium',
  WARN: 'common:severity.warn',
  WARNING: 'common:severity.warning',
  ERROR: 'common:severity.error',
  HIGH: 'common:severity.high',
  CRITICAL: 'common:severity.critical'
}

/**
 * 常见操作状态映射
 */
export const operationStatusMap: Record<string, string> = {
  PENDING: 'common:status.pending',
  RUNNING: 'common:status.running',
  WAITING_APPROVAL: 'common:status.waitingApproval',
  SUCCEEDED: 'common:status.succeeded',
  FAILED: 'common:status.failed',
  BLOCKED: 'common:status.blocked',
  CANCELED: 'common:status.canceled',
  APPROVED: 'approval:status.approved',
  REJECTED: 'approval:status.rejected',
  ONLINE: 'common:status.online',
  OFFLINE: 'common:status.offline',
  DEGRADED: 'common:status.degraded',
  HEALTHY: 'common:status.healthy',
  UNREACHABLE: 'common:status.unreachable',
  OPEN: 'common:status.open',
  CLOSED: 'common:status.closed'
}

/**
 * 常见系统动作映射
 */
export const systemActionMap: Record<string, string> = {
  GLOBAL_SEARCH: 'common:systemActions.globalSearch',
  BACKUP_EXPORT_HISTORY: 'common:systemActions.backupExportHistory',
  CHANGE_REQUEST_GET: 'common:systemActions.changeRequestGet',
  CHANGE_REQUEST_LIST: 'common:systemActions.changeRequestList',
  CHANGE_REQUEST_CREATE: 'common:systemActions.changeRequestCreate',
  JOB_CREATED: 'common:systemActions.jobCreated',
  JOB_EXECUTED: 'common:systemActions.jobExecuted',
  MIGRATION_ISSUE: 'dashboard:criticalIssues.types.migrationIssue'
}

/**
 * Doctor 分类映射
 */
export const doctorCategoryMap: Record<string, string> = {
  WS_CONNECTION: 'common:doctorCategories.wsConnection',
  AUTH: 'common:doctorCategories.auth',
  CONFIG_DRIFT: 'common:doctorCategories.configDrift',
  HOOKS: 'common:doctorCategories.hooks',
  TRUSTED_PROXIES: 'common:doctorCategories.trustedProxies',
  BACKUP: 'common:doctorCategories.backup',
  MIGRATION_STATE: 'common:doctorCategories.migrationState',
  DEPLOYMENT_HEALTH: 'common:doctorCategories.deploymentHealth',
  HOST_AGENT: 'common:doctorCategories.hostAgent',
  OUTBOX: 'common:doctorCategories.outbox',
  APPROVAL_BACKLOG: 'common:doctorCategories.approvalBacklog'
}

/**
 * 环境类型映射
 */
export const envTypeMap: Record<string, string> = {
  DEV: 'common:envType.DEV',
  STAGING: 'common:envType.STAGING',
  PROD: 'common:envType.PROD'
}

/**
 * 获取翻译键的辅助函数
 * @param map 映射对象
 * @param key 枚举值
 * @param fallback 回退值
 * @returns 翻译键或回退值
 */
export function getTranslationKey(
  map: Record<string, string>,
  key: string,
  fallback?: string
): string {
  return map[key] || fallback || key
}
