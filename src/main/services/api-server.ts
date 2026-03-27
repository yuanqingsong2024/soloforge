import Fastify from 'fastify'
import cors from '@fastify/cors'
import { app } from 'electron'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { KeychainService } from './keychain'
import { OpenClawClient } from './openclaw-client'
import { resolveWorkspaceOpenClawClient } from './workspace-openclaw'
import { ConfigManager } from './config-manager'
import { ApprovalGuard } from './approval-guard'
// PolicyGuard 已导入但在当前端点中未直接使用（保留以备将来扩展）
import { PipelineManager } from './pipeline-manager'
import { JobManager, type JobStatus } from './job-manager'
import { OutboxManager } from './outbox-manager'
import { ModelTester, type BatchTestConfig, type LatencyStats } from './model-tester'
import { GatewayValidator, type GatewayConfig } from './gateway-validator'
import { BackupManager, type BackupPack } from './backup-manager'
import { DoctorService } from './doctor-service'
import { EventBusService } from './event-bus'
import { NotificationPolicyService } from './notification-policy-service'
import { ReleaseUpgradeService } from './release-upgrade-service'
import { HostAgentService, type AgentCapabilities, type AgentActionType, type AgentHeartbeatInput, type CompleteAgentActionInput } from './host-agent-service'
import { DashboardService } from './dashboard-service'

const prisma = new PrismaClient()
const fastify = Fastify({ logger: true })
fastify.register(cors, { origin: true })
const openClawClients = new Map<string, OpenClawClient>()

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360]
const MAX_RETRY_ATTEMPTS = 8

type OutboundMessageStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED'

type TemplateScenario = 'REQUIREMENTS_CLARIFY' | 'QUOTE' | 'DELIVERY_NOTICE' | 'STATUS_UPDATE' | 'CUSTOM'
type ContentFormat = 'MARKDOWN' | 'PLAINTEXT'

interface CreateCommsProfileBody {
  name: string
  provider: 'openclaw' | 'webhook'
  openclawProfileId?: string
  enabled?: boolean
}

interface UpdateCommsProfileBody {
  name?: string
  provider?: 'openclaw' | 'webhook'
  openclawProfileId?: string | null
  enabled?: boolean
}

interface CreateCommsTargetBody {
  commsProfileId: string
  channel: string
  to: string
  displayName: string
  allowlisted?: boolean
  notes?: string
}

interface UpdateCommsTargetBody {
  channel?: string
  to?: string
  displayName?: string
  allowlisted?: boolean
  notes?: string | null
}

interface CreateOutboundMessageBody {
  ticketId?: string
  artifactId?: string
  approvalId?: string
  templateId?: string
  provider?: string
  channel: string
  to: string
  subject?: string
  body: string
  status?: OutboundMessageStatus
  idempotencyKey?: string
}

interface UpdateOutboundMessageBody {
  channel?: string
  to?: string
  subject?: string | null
  body?: string
  status?: OutboundMessageStatus
  lastError?: string | null
}

interface ApprovalDecisionBody {
  status: 'APPROVED' | 'REJECTED'
  approvedBy: string
}

interface SendExternalApprovalPayload {
  outboundMessageId: string
  traceId: string
  channel: string
  to: string
}

interface CreateContactBody {
  name: string
  company?: string
  tags?: string[]
  notes?: string
}

interface UpdateContactBody {
  name?: string
  company?: string
  tags?: string[]
  notes?: string
}

interface BindContactTargetBody {
  commsTargetId: string
  isPrimary?: boolean
}

interface CreateTemplateBody {
  name: string
  scenario: TemplateScenario
  channelConstraints?: string[]
  contentFormat: ContentFormat
  subjectTemplate?: string
  bodyTemplate: string
  variablesSchema?: Record<string, unknown>
  defaults?: Record<string, unknown>
  enabled?: boolean
}

interface RenderTemplateBody {
  templateId: string
  ticketId?: string
  variables?: Record<string, unknown>
  channel?: string
  to?: string
}

// ==================== Models / Gateway / Backup / Doctor ====================
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

interface BackupExportBody {
  workspaceId: string
  exportedBy: string
  includeChangeRequests?: boolean
  includeSnapshots?: boolean
}

interface BackupImportBody {
  backupPack: BackupPack
  importedBy: string
  createNewWorkspace?: boolean
  targetWorkspaceId?: string
}

interface DoctorRunBody {
  workspaceId: string
  createdBy: string
}

interface CreateOperationBody {
  workspaceId: string
  targetId?: string
  type: 'DEPLOY' | 'UPGRADE' | 'RESTORE' | 'DOCTOR_FIX' | 'SYNC' | 'CUSTOM'
  title?: string
  summary?: string
  phases: Array<{
    name: string
    steps: Array<{
      name: string
      stepType: 'PRECHECK' | 'BACKUP' | 'WRITE_CONFIG' | 'START' | 'STOP' | 'RESTART' | 'VERIFY' | 'CLEANUP' | 'CUSTOM'
      requestJson?: Record<string, unknown>
    }>
  }>
}

interface UpdateOperationStepBody {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
  resultJson?: Record<string, unknown>
  logs?: string
  deploymentJobId?: string
  changeRequestId?: string
  alertId?: string
}

interface UpdateAlertBody {
  status: 'ACKED' | 'RESOLVED'
}

interface CreateNotificationPolicyBody {
  workspaceId: string
  name: string
  enabled?: boolean
  eventFilters?: Record<string, unknown>
  targetFilters?: Record<string, unknown>
  deliveryTargets: string[]
  templateId?: string | null
  cooldownSeconds?: number
  dedupeWindowSeconds?: number
  quietHours?: { start: string; end: string } | null
}

interface CreateVersionCatalogBody {
  workspaceId: string
  component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
  version: string
  releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
  source: string
  metadataJson?: string
  releaseNotesSummary?: string
}

interface CreateUpgradePlanBody {
  workspaceId: string
  targetId: string
  policyId?: string | null
  component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
  targetVersion: string
  releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
}

interface ExecuteUpgradePlanBody {
  actor?: string
  approvalId?: string
}

interface CreateBootstrapTokenBody {
  workspaceId: string
  targetId?: string | null
  expiresInMinutes?: number
}

interface RegisterHostAgentBody {
  bootstrapToken: string
  name: string
  hostname: string
  osType: string
  arch: string
  agentVersion: string
  capabilities: AgentCapabilities
  labels?: Record<string, string>
}

interface CreateHostAgentActionBody {
  workspaceId: string
  targetId: string
  hostAgentId: string
  actionType: AgentActionType
  request: Record<string, unknown>
  timeoutSeconds?: number
  actor?: string
}

interface DetectInstalledVersionBody {
  workspaceId: string
  targetId: string
  actor?: string
}

interface ImportVersionManifestBody {
  workspaceId: string
  items: Array<{
    component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
    version: string
    releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
    source: string
    metadataJson?: string
    releaseNotesSummary?: string
  }>
}

interface UpsertUpgradePolicyBody {
  id?: string
  workspaceId: string
  name: string
  enabled?: boolean
  targetScopeJson?: string
  releaseChannelScopeJson?: string
  autoDetectUpdates?: boolean
  requireBackup?: boolean
  requireApproval?: boolean
  requireMaintenanceWindow?: boolean
  allowAutoRollback?: boolean
}

interface UpsertMaintenanceWindowBody {
  id?: string
  workspaceId: string
  name: string
  enabled?: boolean
  timezone?: string
  cronOrRule: string
  notes?: string
}

interface TeamHireTemplateMember {
  roleName: string
  description: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  agentName: string
  model: string
  runtime: string
  toolScopes: string[]
}

interface TeamHireBody {
  profileId: string
  template: 'core-team' | 'support-pod'
}

interface BootstrapOpenClawBody {
  workspaceId: string
  name: string
  targetType: 'REMOTE_HOST' | 'REMOTE_DOCKER'
  host: string
  sshUser: string
  sshPort?: number
  gatewayPort?: number
  envType?: 'DEV' | 'STAGING' | 'PROD'
  authMode?: 'token' | 'password' | 'trusted-proxy'
  autoHireTemplate?: 'core-team' | 'support-pod' | null
}

interface BootstrapInstallJobBody {
  targetId: string
  profileId: string
  registrationId: string
}

interface TeamHireResultItem {
  roleId: string
  roleName: string
  agentId: string
  agentName: string
  grantedToolCount: number
}

interface GlobalSearchTicketResult {
  id: string
  title: string
  source: string
  status: string
  priority: string
}

interface GlobalSearchApprovalResult {
  id: string
  actionType: string
  status: string
  requestedBy: string
  ticketId: string | null
}

interface GlobalSearchAuditResult {
  id: string
  traceId: string
  actor: string
  action: string
  ts: string
}

interface GlobalSearchResponse {
  query: string
  tickets: GlobalSearchTicketResult[]
  approvals: GlobalSearchApprovalResult[]
  auditLogs: GlobalSearchAuditResult[]
}

function parseApprovalPayload(payload: string): SendExternalApprovalPayload | null {
  try {
    const parsed = JSON.parse(payload) as Partial<SendExternalApprovalPayload>
    if (!parsed.outboundMessageId || !parsed.traceId || !parsed.channel || !parsed.to) {
      return null
    }
    return {
      outboundMessageId: parsed.outboundMessageId,
      traceId: parsed.traceId,
      channel: parsed.channel,
      to: parsed.to
    }
  } catch {
    return null
  }
}

function maskTarget(raw: string): string {
  if (!raw) return '***'
  if (raw.length <= 4) return `${raw[0]}***`
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}

function maskSecret(raw: string): string {
  if (!raw) return '***'
  const trimmed = String(raw)
  // 保留常见前缀（如 sk-），便于用户识别来源
  if (trimmed.startsWith('sk-')) {
    if (trimmed.length <= 7) return 'sk-***'
    return `sk-****${trimmed.slice(-4)}`
  }
  if (trimmed.length <= 4) return `${trimmed[0]}***`
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-4)}`
}

function sanitizeDraftContent(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const key = (parentKey || '').toLowerCase()
    if (
      key.includes('token') ||
      key.includes('password') ||
      key.includes('secret') ||
      key.includes('api_key') ||
      key.includes('apikey') ||
      key.includes('edge')
    ) {
      return maskSecret(value)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(v => sanitizeDraftContent(v, parentKey))
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const k of Object.keys(record)) {
      next[k] = sanitizeDraftContent(record[k], k)
    }
    return next
  }
  return value
}

function stableJson(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data)
  }
  if (Array.isArray(data)) {
    return `[${data.map(stableJson).join(',')}]`
  }
  const record = data as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

function computeContentHash(input: { channel: string; to: string; subject?: string | null; body: string }): string {
  const payload = `${input.channel}|${input.to}|${input.subject || ''}|${input.body}`
  return createHash('sha256').update(payload).digest('hex')
}

function computeIdempotencyKey(input: {
  ticketId?: string | null
  templateId?: string | null
  scenario?: string | null
  channel: string
  to: string
  body: string
  subject?: string | null
  dateBucket?: string
}): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex')
  const bucket = input.dateBucket || new Date().toISOString().slice(0, 10)
  const raw = [
    input.ticketId || 'no-ticket',
    input.templateId || 'no-template',
    input.scenario || 'CUSTOM',
    input.channel,
    input.to,
    input.subject || '',
    bodyHash,
    bucket
  ].join('|')
  return createHash('sha256').update(raw).digest('hex')
}

function computeNextRetryAt(attempts: number): Date | null {
  if (attempts >= MAX_RETRY_ATTEMPTS) return null
  const idx = Math.min(attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)
  const minutes = RETRY_BACKOFF_MINUTES[idx]
  return new Date(Date.now() + minutes * 60 * 1000)
}

function classifySendError(error: unknown): { category: 'AUTH_FAILED' | 'RATE_LIMIT' | 'NETWORK' | 'INVALID_TARGET' | 'UNKNOWN'; retriable: boolean; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('allowlist') || lower.includes('invalid target') || lower.includes('目标')) {
    return { category: 'INVALID_TARGET', retriable: false, message }
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
    return { category: 'AUTH_FAILED', retriable: false, message }
  }
  if (lower.includes('429') || lower.includes('rate')) {
    return { category: 'RATE_LIMIT', retriable: true, message }
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('fetch failed') || lower.includes('econn')) {
    return { category: 'NETWORK', retriable: true, message }
  }
  return { category: 'UNKNOWN', retriable: true, message }
}

function renderTemplateText(template: string, variables: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key: string) => {
    const value = variables[key]
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return stableJson(value)
    return String(value)
  })
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

async function writeApiAuditLog(input: {
  traceId: string
  ticketId?: string
  actor: string
  action: string
  tool: string
  request: unknown
  response: unknown
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ticketId: input.ticketId,
        traceId: input.traceId,
        actor: input.actor,
        action: input.action,
        tool: input.tool,
        request: JSON.stringify(input.request),
        response: JSON.stringify(input.response),
        ts: new Date()
      }
    })
  } catch (error) {
    fastify.log.error({ traceId: input.traceId, err: toErrorMessage(error) }, `写入审计日志失败：${input.action}`)
  }
}

async function emitApiEvent(input: {
  workspaceId: string
  targetId?: string
  sourceType: 'CONFIG' | 'CHANGE_REQUEST' | 'DEPLOYMENT_JOB' | 'DOCTOR' | 'BACKUP' | 'SYSTEM' | 'COMMUNICATION' | 'HOST_AGENT'
  sourceId: string
  eventType: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  title: string
  summary: string
  payload: unknown
  traceId?: string
}): Promise<void> {
  try {
    await EventBusService.emit({
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      traceId: input.traceId
    })

    // 仅由统一事件层触发通知策略，避免各模块各自发送。
    // 为防止通知相关事件再次触发通知导致递归，这里显式跳过 COMMUNICATION 源与通知策略内部事件。
    if (input.sourceType !== 'COMMUNICATION' && !input.eventType.startsWith('NOTIFICATION_')) {
      await triggerNotificationPolicies({
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        sourceType: input.sourceType,
        eventType: input.eventType,
        severity: input.severity,
        title: input.title,
        summary: input.summary,
        traceId: input.traceId,
        payload: (typeof input.payload === 'object' && input.payload !== null
          ? (input.payload as Record<string, unknown>)
          : { value: input.payload })
      })
    }
  } catch (error) {
    fastify.log.error({ traceId: input.traceId, err: toErrorMessage(error) }, `写入事件失败：${input.eventType}`)
  }
}

async function triggerNotificationPolicies(input: {
  workspaceId: string
  targetId?: string
  sourceType: string
  eventType: string
  severity: string
  title: string
  summary: string
  traceId?: string
  payload: Record<string, unknown>
}): Promise<void> {
  try {
    const policies = await NotificationPolicyService.matchPolicies({
      workspaceId: input.workspaceId,
      targetId: input.targetId || null,
      sourceType: input.sourceType,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      traceId: input.traceId || null,
      payload: input.payload
    })

    for (const policy of policies) {
      const targets = safeParseJson<string[]>(policy.deliveryTargets, [])
      const dedupeWindowSeconds = policy.dedupeWindowSeconds || 900
      const cooldownSeconds = policy.cooldownSeconds || 300
      const rendered = NotificationPolicyService.renderPolicyMessage({
        policyName: policy.name,
        event: {
          workspaceId: input.workspaceId,
          targetId: input.targetId || null,
          sourceType: input.sourceType,
          eventType: input.eventType,
          severity: input.severity,
          title: input.title,
          summary: input.summary,
          traceId: input.traceId || null,
          payload: input.payload
        }
      })

      for (const targetId of targets) {
        const target = await prisma.commsTarget.findUnique({ where: { id: targetId } })
        if (!target || !target.allowlisted) continue

        const dedupeKey = `${policy.id}:${target.id}:${input.eventType}:${input.severity}`
        const now = Date.now()

        const deduped = await prisma.outboxEvent.findFirst({
          where: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            status: { in: ['SENDING', 'SUCCEEDED'] },
            createdAt: { gte: new Date(now - dedupeWindowSeconds * 1000) },
            payload: { contains: `"dedupeKey":"${dedupeKey}"` }
          },
          orderBy: { createdAt: 'desc' }
        })
        if (deduped) {
          continue
        }

        const cooldownHit = await prisma.outboxEvent.findFirst({
          where: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            status: { in: ['SENDING', 'SUCCEEDED'] },
            createdAt: { gte: new Date(now - cooldownSeconds * 1000) },
            payload: { contains: `"policyId":"${policy.id}"` }
          },
          orderBy: { createdAt: 'desc' }
        })
        if (cooldownHit) {
          continue
        }

        const dispatchEvent = await prisma.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            kind: 'NOTIFICATION_DISPATCH',
            traceId: input.traceId || uuidv4(),
            status: 'SENDING',
            payload: JSON.stringify({
              policyId: policy.id,
              targetId: target.id,
              eventType: input.eventType,
              severity: input.severity,
              dedupeKey
            }),
            attempts: 0
          }
        })

        const draft = await prisma.outboundMessage.create({
          data: {
            workspaceId: input.workspaceId,
            templateId: policy.templateId || null,
            provider: 'openclaw',
            channel: target.channel,
            to: target.to,
            toMasked: maskTarget(target.to),
            subject: rendered.subject,
            body: rendered.body,
            status: 'DRAFT',
            idempotencyKey: createHash('sha256').update(`${policy.id}:${target.id}:${input.eventType}:${input.traceId || ''}`).digest('hex'),
            traceId: input.traceId || uuidv4(),
            contentHash: computeContentHash({
              channel: target.channel,
              to: target.to,
              subject: rendered.subject,
              body: rendered.body
            }),
            attempts: 0
          }
        })

        await emitApiEvent({
          workspaceId: input.workspaceId,
          targetId: input.targetId,
          sourceType: 'COMMUNICATION',
          sourceId: draft.id,
          eventType: 'NOTIFICATION_POLICY_TRIGGERED',
          severity: input.severity === 'CRITICAL' ? 'CRITICAL' : input.severity === 'ERROR' ? 'ERROR' : 'INFO',
          title: `通知策略触发：${policy.name}`,
          summary: `${input.eventType} 命中通知策略并创建外发草稿`,
          payload: {
            policyId: policy.id,
            outboundMessageId: draft.id,
            commsTargetId: target.id
          },
          traceId: input.traceId
        })

        await fastify.inject({
          method: 'POST',
          url: `/api/outbound-messages/${draft.id}/send`
        })

        await prisma.outboxEvent.update({
          where: { id: dispatchEvent.id },
          data: {
            status: 'SUCCEEDED',
            attempts: { increment: 1 },
            lastError: null
          }
        })
      }
    }
  } catch (error) {
    fastify.log.error({ traceId: input.traceId, err: toErrorMessage(error) }, '触发通知策略失败')
  }
}

function ok<T>(data: T) {
  return { success: true as const, data }
}

function fail(message: string) {
  return { success: false as const, error: message }
}

type DashboardIssueType = 'CRITICAL_ALERT' | 'CRITICAL_DRIFT' | 'FAILED_UPGRADE' | 'FAILED_REMEDIATION' | 'OFFLINE_AGENT' | 'UNREACHABLE_TARGET'
type DashboardSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'HIGH' | 'FAILED' | 'OFFLINE'

interface TestDashboardScenario {
  id: string
  label: string
  payload: {
    generatedAt: string
    scope: {
      workspaceId?: string
      workspaceName?: string
      mode: 'global' | 'workspace'
    }
    overview: {
      workspaceCount: number
      targetTotals: {
        total: number
        healthy: number
        degraded: number
        unreachable: number
      }
      openAlerts: number
      criticalDrift: number
      runningOperations: number
      pendingApprovals: number
      agents: {
        online: number
        offline: number
      }
      availableUpdates: number
    }
    criticalIssues: Array<{
      id: string
      issueType: DashboardIssueType
      severity: 'CRITICAL' | 'HIGH'
      workspaceId: string
      workspaceName: string
      targetId?: string
      targetName?: string
      summary: string
      lastOccurredAt: string
      actions: Array<{
        label: string
        route: string
      }>
    }>
    runtime: {
      operations: {
        running: number
        waitingApproval: number
        todaySucceeded: number
        todayFailed: number
        last24hSucceeded: number
        last24hFailed: number
        last7dSucceeded: number
        last7dFailed: number
        recent: Array<{
          id: string
          title: string
          type: string
          status: string
          updatedAt: string
        }>
      }
      hostAgents: {
        online: number
        degraded: number
        offline: number
        recentHeartbeatAnomalies: number
        recentAnomalies: Array<{
          id: string
          name: string
          status: string
          lastHeartbeatAt?: string | null
        }>
      }
      deployments: {
        healthy: number
        degraded: number
        unreachable: number
        recentJobs: Array<{
          id: string
          targetId: string
          targetName: string
          type: string
          status: string
          createdAt: string
        }>
      }
      remediation: {
        todayTotal: number
        blocked: number
        failed: number
        succeeded: number
        running: number
        recent: Array<{
          id: string
          title: string
          status: string
          updatedAt: string
        }>
      }
      trends: {
        criticalEvents24h: number
        criticalEvents7d: number
      }
    }
    pendingActions: Array<{
      id: string
      actionType: 'PENDING_APPROVAL' | 'PENDING_CHANGE_REQUEST' | 'PENDING_UPGRADE_PLAN' | 'PENDING_RECONCILE_PLAN' | 'MANUAL_REMEDIATION'
      workspaceId: string
      workspaceName: string
      title: string
      summary: string
      status: string
      createdAt: string
      route: string
    }>
    activityPreview: Array<{
      id: string
      workspaceId: string
      workspaceName: string
      targetId?: string
      targetName?: string
      sourceType: string
      eventType: string
      severity: DashboardSeverity
      title: string
      summary: string
      traceId?: string | null
      createdAt: string
    }>
    healthScore: {
      score: number
      label: 'GOOD' | 'WARNING' | 'CRITICAL'
      summary: string
      factors: Array<{
        key: string
        label: string
        weight: number
        penalty: number
        description: string
      }>
    }
  }
}

const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const TEST_WORKSPACE_NAME = 'Local'

function isE2ETestMode(): boolean {
  return process.env.SOLOFORGE_E2E === '1'
}

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

function getTestDashboardResponse(workspaceId?: string): TestDashboardScenario['payload'] {
  const scenario = workspaceId === '00000000-0000-0000-0000-000000000002'
    ? createTestDashboardScenario('workspace-secondary')
    : createTestDashboardScenario(process.env.SOLOFORGE_E2E_DASHBOARD_SCENARIO || 'default')

  return scenario.payload
}

async function recomputeOperationState(operationId: string): Promise<void> {
  const phases = await prisma.operationPhase.findMany({
    where: { operationId },
    include: { steps: true },
    orderBy: { orderNo: 'asc' }
  })

  let operationStatus: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' = 'PENDING'

  for (const phase of phases) {
    const stepStatuses = phase.steps.map(step => step.status)
    let nextPhaseStatus: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' = 'PENDING'

    if (stepStatuses.some(status => status === 'FAILED')) {
      nextPhaseStatus = 'FAILED'
      operationStatus = 'FAILED'
    } else if (stepStatuses.length > 0 && stepStatuses.every(status => status === 'SUCCEEDED' || status === 'SKIPPED')) {
      nextPhaseStatus = 'SUCCEEDED'
      if (operationStatus !== 'FAILED') {
        operationStatus = 'SUCCEEDED'
      }
    } else if (stepStatuses.some(status => status === 'RUNNING')) {
      nextPhaseStatus = 'RUNNING'
      operationStatus = 'RUNNING'
    }

    await prisma.operationPhase.update({
      where: { id: phase.id },
      data: {
        status: nextPhaseStatus,
        startedAt: nextPhaseStatus === 'RUNNING' && !phase.startedAt ? new Date() : phase.startedAt,
        endedAt: nextPhaseStatus === 'SUCCEEDED' || nextPhaseStatus === 'FAILED' ? new Date() : null
      }
    })
  }

  if (phases.length > 0 && phases.some(phase => phase.steps.some(step => step.status === 'PENDING'))) {
    if (operationStatus === 'SUCCEEDED') {
      operationStatus = 'RUNNING'
    }
  }

  await prisma.operation.update({
    where: { id: operationId },
    data: { status: operationStatus }
  })
}

const TEAM_HIRE_TEMPLATES: Record<'core-team' | 'support-pod', TeamHireTemplateMember[]> = {
  'core-team': [
    {
      roleName: 'Support',
      description: '处理一线客户问题与外发沟通',
      riskLevel: 'LOW',
      agentName: 'Support Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'approval', 'artifact', 'communication']
    },
    {
      roleName: 'PM',
      description: '负责需求整理、计划与交付协调',
      riskLevel: 'MEDIUM',
      agentName: 'PM Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'approval', 'workspace']
    },
    {
      roleName: 'Dev',
      description: '负责开发实现与技术修复',
      riskLevel: 'MEDIUM',
      agentName: 'Dev Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'workspace', 'config']
    },
    {
      roleName: 'QA',
      description: '负责验证、回归与质量门禁',
      riskLevel: 'LOW',
      agentName: 'QA Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'approval']
    },
    {
      roleName: 'Ops',
      description: '负责环境、发布与运维响应',
      riskLevel: 'HIGH',
      agentName: 'Ops Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['workspace', 'config', 'approval']
    }
  ],
  'support-pod': [
    {
      roleName: 'Support',
      description: '处理一线支持请求与消息回执',
      riskLevel: 'LOW',
      agentName: 'Support Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'approval', 'communication']
    },
    {
      roleName: 'QA',
      description: '负责答复校验与交付检查',
      riskLevel: 'LOW',
      agentName: 'QA Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact']
    }
  ]
}

function buildRolePrompt(profileName: string, roleName: string): string {
  return `你是 ${profileName} 环境中的 ${roleName} 员工，请遵循既有审批、审计与最小权限规则执行任务。`
}

async function executeTeamHire(profileId: string, template: 'core-team' | 'support-pod') {
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new Error('Connection Profile 不存在')
  }

  const toolPool = await prisma.tool.findMany()
  const hired: TeamHireResultItem[] = []

  await prisma.$transaction(async tx => {
    for (const member of TEAM_HIRE_TEMPLATES[template]) {
      const role = await tx.role.upsert({
        where: { name: member.roleName },
        update: {
          description: member.description,
          defaultPrompt: buildRolePrompt(profile.name, member.roleName),
          outputSchema: JSON.stringify({ profileId: profile.id, profileName: profile.name, role: member.roleName }),
          riskLevel: member.riskLevel
        },
        create: {
          name: member.roleName,
          description: member.description,
          defaultPrompt: buildRolePrompt(profile.name, member.roleName),
          outputSchema: JSON.stringify({ profileId: profile.id, profileName: profile.name, role: member.roleName }),
          riskLevel: member.riskLevel
        }
      })

      const agentName = `${profile.name} · ${member.agentName}`
      const agent = await tx.agent.upsert({
        where: { name: agentName },
        update: {
          roleId: role.id,
          model: member.model,
          runtime: member.runtime,
          enabled: true
        },
        create: {
          name: agentName,
          roleId: role.id,
          model: member.model,
          runtime: member.runtime,
          enabled: true
        }
      })

      const grantedTools = toolPool.filter(tool =>
        member.toolScopes.includes(tool.scope) && tool.riskClass !== 'CRITICAL'
      )

      for (const tool of grantedTools) {
        await tx.agentTool.upsert({
          where: {
            agentId_toolId: {
              agentId: agent.id,
              toolId: tool.id
            }
          },
          update: {
            permissionJson: JSON.stringify({ level: 'template-default', profileId: profile.id })
          },
          create: {
            agentId: agent.id,
            toolId: tool.id,
            permissionJson: JSON.stringify({ level: 'template-default', profileId: profile.id })
          }
        })
      }

      hired.push({
        roleId: role.id,
        roleName: role.name,
        agentId: agent.id,
        agentName: agent.name,
        grantedToolCount: grantedTools.length
      })
    }
  })

  return { profile, hired }
}

function diagnosticSeverityToEventSeverity(severity: string): 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL'
    case 'ERROR':
      return 'ERROR'
    case 'WARNING':
      return 'WARN'
    default:
      return 'INFO'
  }
}

function diagnosticSeverityToAlertStatus(severity: string): 'OK' | 'WARN' | 'ERROR' | 'CRITICAL' {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL'
    case 'ERROR':
      return 'ERROR'
    case 'WARNING':
      return 'WARN'
    default:
      return 'OK'
  }
}

async function createOrUpdateAlert(input: {
  workspaceId: string
  targetId?: string | null
  sourceCheckId: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  title: string
  summary: string
  dedupeKey: string
  traceId?: string
}): Promise<{ alertId: string; created: boolean }> {
  const existing = await prisma.alert.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dedupeKey: input.dedupeKey,
      status: { in: ['OPEN', 'ACKED'] }
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (existing) {
    const updated = await prisma.alert.update({
      where: { id: existing.id },
      data: {
        severity: input.severity,
        summary: input.summary,
        title: input.title,
        traceId: input.traceId || existing.traceId,
        sourceCheckId: input.sourceCheckId,
        targetId: input.targetId || existing.targetId
      }
    })
    return { alertId: updated.id, created: false }
  }

  const created = await prisma.alert.create({
    data: {
      workspaceId: input.workspaceId,
      targetId: input.targetId || null,
      sourceCheckId: input.sourceCheckId,
      severity: input.severity,
      status: 'OPEN',
      title: input.title,
      summary: input.summary,
      dedupeKey: input.dedupeKey,
      traceId: input.traceId || null
    }
  })

  return { alertId: created.id, created: true }
}

function resolveSqliteDbPath(): string {
  const url = process.env.DATABASE_URL
  if (url && url.startsWith('file:')) {
    const filePart = url.slice('file:'.length)
    // sqlite file: URL 可能是相对路径（如 ./dev.db）
    if (filePart.startsWith('/') || /^[a-zA-Z]:\\/.test(filePart)) {
      return filePart
    }
    return path.resolve(process.cwd(), filePart)
  }

  // 默认 schema.prisma 使用 file:./dev.db，通常落在项目 prisma/dev.db
  const candidates = [
    path.resolve(process.cwd(), 'prisma', 'dev.db'),
    path.resolve(app.getAppPath(), 'prisma', 'dev.db')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function mergeTemplateVariables(
  defaults: Record<string, unknown>,
  inferred: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...defaults,
    ...inferred,
    ...input
  }
}

async function createOpenClawClientByProfileId(profileId: string): Promise<OpenClawClient> {
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new Error('连接档案不存在')
  }

  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)

  return new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined,
    eventPath: profile.eventPath || undefined
  })
}

async function resolveAllowlistedTarget(channel: string, to: string) {
  return await prisma.commsTarget.findFirst({
    where: {
      channel,
      to,
      allowlisted: true,
      commsProfile: { enabled: true }
    },
    include: { commsProfile: true }
  })
}

function extractProviderReceipt(result: unknown): { providerMessageId: string | null; receipt: string } {
  const data = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
  const candidate = data.message_id || data.messageId || data.id
  const providerMessageId = typeof candidate === 'string' ? candidate : null
  return { providerMessageId, receipt: JSON.stringify(data) }
}

async function dispatchOutboundMessage(
  outboundMessageId: string,
  actor: string
): Promise<{ traceId: string; result: unknown }> {
  const message = await prisma.outboundMessage.findUnique({ where: { id: outboundMessageId } })
  if (!message) {
    throw new Error('外发消息不存在')
  }

  if (message.status === 'SENT') {
    return { traceId: message.traceId, result: { status: 'already_sent' } }
  }

  const duplicated = await prisma.outboundMessage.findFirst({
    where: {
      id: { not: message.id },
      contentHash: message.contentHash,
      status: { in: ['SENDING', 'SENT'] }
    },
    orderBy: { updatedAt: 'desc' }
  })
  if (duplicated) {
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: duplicated.status === 'SENT' ? 'SENT' : 'SENDING',
        providerMessageId: duplicated.providerMessageId,
        providerReceipt: duplicated.providerReceipt,
        lastError: null
      }
    })
    return { traceId: message.traceId, result: { status: 'deduplicated', duplicateMessageId: duplicated.id } }
  }

  const allowlistedTarget = await resolveAllowlistedTarget(message.channel, message.to)
  if (!allowlistedTarget) {
    throw new Error('目标未加入 allowlist，禁止发送')
  }

  if (allowlistedTarget.commsProfile.provider !== 'openclaw' || !allowlistedTarget.commsProfile.openclawProfileId) {
    throw new Error('当前仅支持通过 OpenClaw provider 发送')
  }

  const client = await createOpenClawClientByProfileId(allowlistedTarget.commsProfile.openclawProfileId)

  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: {
      status: 'SENDING',
      lastError: null
    }
  })

  const traceId = message.traceId

  try {
    const providerResult = await client.sendChannelMessage({
      channel: message.channel,
      to: message.to,
      subject: message.subject || undefined,
      body: message.body,
      traceId
    })
    const { providerMessageId, receipt } = extractProviderReceipt(providerResult)

    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: {
        status: 'SENT',
        lastError: null,
        lastSentAt: new Date(),
        providerMessageId,
        providerReceipt: receipt,
        attempts: { increment: 1 },
        nextRetryAt: null
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: message.workspaceId,
        ticketId: message.ticketId || undefined,
        traceId,
        actor,
        action: 'OUTBOUND_SENT',
        tool: message.provider,
        approvalId: message.approvalId || undefined,
        templateId: message.templateId || undefined,
        outboundMessageId: message.id,
        providerMessageId: providerMessageId || undefined,
        request: JSON.stringify({
          outboundMessageId: message.id,
          channel: message.channel,
          to: maskTarget(message.to),
          subject: message.subject || null
        }),
        response: receipt,
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: message.workspaceId,
      sourceType: 'COMMUNICATION',
      sourceId: message.id,
      eventType: 'COMMUNICATION_SENT',
      severity: 'INFO',
      title: '通知发送成功',
      summary: `消息已成功发送到 ${maskTarget(message.to)}`,
      payload: {
        outboundMessageId: message.id,
        providerMessageId,
        channel: message.channel,
        toMasked: maskTarget(message.to)
      },
      traceId
    })

    return { traceId, result: providerResult }
  } catch (error) {
    const classified = classifySendError(error)
    const nextAttempts = message.attempts + 1
    const nextRetryAt = classified.retriable ? computeNextRetryAt(nextAttempts) : null

    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: {
        status: 'FAILED',
        lastError: `${classified.category}: ${classified.message}`,
        attempts: nextAttempts,
        nextRetryAt
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: message.workspaceId,
        ticketId: message.ticketId || undefined,
        traceId,
        actor,
        action: 'OUTBOUND_FAILED',
        tool: message.provider,
        approvalId: message.approvalId || undefined,
        templateId: message.templateId || undefined,
        outboundMessageId: message.id,
        request: JSON.stringify({
          outboundMessageId: message.id,
          channel: message.channel,
          to: maskTarget(message.to)
        }),
        response: JSON.stringify({
          category: classified.category,
          retriable: classified.retriable,
          message: classified.message,
          nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null
        }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: message.workspaceId,
      sourceType: 'COMMUNICATION',
      sourceId: message.id,
      eventType: 'COMMUNICATION_FAILED',
      severity: 'ERROR',
      title: '通知发送失败',
      summary: `${message.channel} 发送失败：${classified.message}`,
      payload: {
        outboundMessageId: message.id,
        channel: message.channel,
        toMasked: maskTarget(message.to),
        category: classified.category,
        retriable: classified.retriable,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null
      },
      traceId
    })

    throw new Error(`${classified.category}: ${classified.message}`)
  }
}
// ==================== Roles ====================
fastify.get('/api/roles', async () => {
  return await prisma.role.findMany()
})

fastify.get('/api/roles/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.role.findUnique({ where: { id } })
})

// ==================== Agents ====================
fastify.get('/api/agents', async () => {
  return await prisma.agent.findMany({ include: { role: true, tools: { include: { tool: true } } } })
})

fastify.post('/api/agents', async (request) => {
  const data = request.body as any
  return await prisma.agent.create({ data })
})

fastify.put('/api/agents/:id', async (request) => {
  const { id } = request.params as { id: string }
  const data = request.body as any
  return await prisma.agent.update({ where: { id }, data })
})

fastify.delete('/api/agents/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.agent.delete({ where: { id } })
})

// ==================== Tools ====================
fastify.get('/api/tools', async () => {
  return await prisma.tool.findMany()
})

// ==================== Tickets ====================
fastify.get('/api/tickets', async () => {
  return await prisma.ticket.findMany({
    include: {
      assignee: true,
      contact: true,
      primaryTarget: true,
      artifacts: true,
      approvals: true,
      tags: { include: { tag: true } }
    }
  })
})

fastify.get('/api/tickets/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignee: true,
      contact: true,
      primaryTarget: true,
      artifacts: true,
      approvals: true,
      tags: { include: { tag: true } }
    }
  })

  if (!ticket) {
    reply.code(404)
    return fail('工单不存在')
  }

  return ok(ticket)
})

fastify.post('/api/tickets', async (request) => {
  const body = request.body as any
  const data = {
    title: body.title || '未命名工单',
    source: body.source || 'manual',
    status: body.status || 'INBOX',
    priority: body.priority || 'MEDIUM',
    customerMeta: body.customerMeta || '{}',
    ...(body.assigneeAgentId ? { assigneeAgentId: body.assigneeAgentId } : {}),
    ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
    ...(body.primaryTargetId !== undefined ? { primaryTargetId: body.primaryTargetId } : {}),
    ...(body.dueAt ? { dueAt: new Date(body.dueAt) } : {})
  }
  return await prisma.ticket.create({
    data,
    include: { assignee: true, contact: true, primaryTarget: true, artifacts: true, approvals: true, tags: { include: { tag: true } } }
  })
})

fastify.put('/api/tickets/:id', async (request) => {
  const { id } = request.params as { id: string }
  const data = request.body as any
  return await prisma.ticket.update({ 
    where: { id }, 
    data,
    include: { assignee: true, contact: true, primaryTarget: true, artifacts: true, approvals: true, tags: { include: { tag: true } } }
  })
})

// ==================== Tags ====================
fastify.get('/api/tags', async () => {
  return await prisma.tag.findMany({
    orderBy: { name: 'asc' }
  })
})
fastify.post('/api/tags', async (request) => {
  const { name, color } = request.body as { name: string; color?: string }
  return await prisma.tag.create({
    data: { name, color: color || '#3B82F6' }
  })
})
fastify.put('/api/tags/:id', async (request) => {
  const { id } = request.params as { id: string }
  const data = request.body as { name?: string; color?: string }
  return await prisma.tag.update({ where: { id }, data })
})
fastify.delete('/api/tags/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.tag.delete({ where: { id } })
})
// 工单标签关联
fastify.get('/api/tickets/:id/tags', async (request) => {
  const { id } = request.params as { id: string }
  const ticketTags = await prisma.ticketTag.findMany({
    where: { ticketId: id },
    include: { tag: true }
  })
  return ticketTags.map(tt => tt.tag)
})
fastify.post('/api/tickets/:id/tags', async (request) => {
  const { id } = request.params as { id: string }
  const { tagId } = request.body as { tagId: string }
  return await prisma.ticketTag.create({
    data: { ticketId: id, tagId },
    include: { tag: true }
  })
})
fastify.delete('/api/tickets/:id/tags/:tagId', async (request) => {
  const { id, tagId } = request.params as { id: string; tagId: string }
  const ticketTag = await prisma.ticketTag.findFirst({
    where: { ticketId: id, tagId }
  })
  if (ticketTag) {
    await prisma.ticketTag.delete({ where: { id: ticketTag.id } })
  }
  return { success: true }
})
// ==================== Artifacts ====================
fastify.post('/api/artifacts', async (request) => {
  const data = request.body as any
  return await prisma.artifact.create({ data })
})

// ==================== Approvals ====================
fastify.get('/api/approvals', async (request) => {
  const { status } = request.query as { status?: string }
  return await prisma.approval.findMany({
    where: status ? { status } : undefined,
    include: { ticket: true }
  })
})

fastify.post('/api/approvals', async (request) => {
  const data = request.body as any
  return await prisma.approval.create({ data })
})

fastify.put('/api/approvals/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { status, approvedBy } = request.body as ApprovalDecisionBody

  const updatedApproval = await prisma.approval.update({
    where: { id },
    data: {
      status,
      approvedBy,
      decidedAt: new Date()
    }
  })

  if (updatedApproval.actionType === 'SEND_EXTERNAL' && status === 'APPROVED') {
    const payload = parseApprovalPayload(updatedApproval.payload)
    if (!payload) {
      throw new Error('审批载荷格式错误，无法执行外发发送')
    }

    await prisma.outboundMessage.update({
      where: { id: payload.outboundMessageId },
      data: { status: 'APPROVED', lastError: null }
    })

    await dispatchOutboundMessage(payload.outboundMessageId, approvedBy)
  }

  if (updatedApproval.actionType === 'SEND_EXTERNAL' && status === 'REJECTED') {
    const payload = parseApprovalPayload(updatedApproval.payload)
    if (payload) {
      await prisma.outboundMessage.update({
        where: { id: payload.outboundMessageId },
        data: { status: 'CANCELED', lastError: '审批拒绝，未发送' }
      })

      await prisma.auditLog.create({
        data: {
          traceId: payload.traceId,
          actor: approvedBy,
          action: 'OUTBOUND_CANCELED',
          tool: 'approval',
          approvalId: updatedApproval.id,
          outboundMessageId: payload.outboundMessageId,
          request: JSON.stringify({ reason: 'approval_rejected' }),
          response: JSON.stringify({ status: 'CANCELED' }),
          ts: new Date()
        }
      })
    }
  }

  if (updatedApproval.actionType === 'CHANGE_CONFIG' && status === 'APPROVED') {
    try {
      const payload = JSON.parse(updatedApproval.payload) as { kind?: string; targetId?: string; channel?: string; to?: string }
      if (payload.kind === 'ALLOWLIST_TARGET' && payload.targetId) {
        await prisma.commsTarget.update({
          where: { id: payload.targetId },
          data: { allowlisted: true }
        })

        const traceId = uuidv4()
        await prisma.auditLog.create({
          data: {
            traceId,
            actor: approvedBy,
            action: 'ALLOWLIST_TARGET_APPROVED',
            tool: 'communications',
            request: JSON.stringify({ targetId: payload.targetId, channel: payload.channel, to: payload.to }),
            response: JSON.stringify({ allowlisted: true }),
            ts: new Date()
          }
        })
      }
    } catch {
      // 非 allowlist 场景的 CHANGE_CONFIG，忽略扩展处理
    }
  }

  return updatedApproval
})

// ==================== Audit Logs ====================
fastify.get('/api/audit-logs', async (request) => {
  const { ticketId, traceId, actor } = request.query as { ticketId?: string; traceId?: string; actor?: string }
  return await prisma.auditLog.findMany({
    where: {
      ...(ticketId && { ticketId }),
      ...(traceId && { traceId }),
      ...(actor && { actor })
    },
    orderBy: { ts: 'desc' },
    take: 100
  })
})

fastify.post('/api/audit-logs', async (request) => {
  const data = request.body as any
  return await prisma.auditLog.create({
    data: {
      ...data,
      traceId: data.traceId || uuidv4()
    }
  })
})

// ==================== Event Records / Activity Feed ====================
fastify.get('/api/event-records', async (request, reply) => {
  const {
    workspaceId,
    targetId,
    severity,
    sourceType,
    eventType,
    traceId,
    startAt,
    endAt,
    limit
  } = request.query as {
    workspaceId?: string
    targetId?: string
    severity?: string
    sourceType?: string
    eventType?: string
    traceId?: string
    startAt?: string
    endAt?: string
    limit?: string
  }

  try {
    const rows = await EventBusService.list({
      workspaceId,
      targetId,
      severity,
      sourceType,
      eventType,
      traceId,
      startAt,
      endAt,
      limit: limit ? Number.parseInt(limit, 10) : undefined
    })
    type ListedEvent = Awaited<ReturnType<typeof EventBusService.list>>[number]

    return ok(rows.map((row: ListedEvent) => ({
      ...row,
      payload: safeParseJson<unknown>(row.payloadJson, {}),
      payloadJson: undefined
    })))
  } catch (error) {
    reply.code(500)
    return fail(`获取事件流失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/event-records/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    const row = await EventBusService.getById(id)
    if (!row) {
      reply.code(404)
      return fail('事件不存在')
    }
    return ok({
      ...row,
      payload: safeParseJson<unknown>(row.payloadJson, {}),
      payloadJson: undefined
    })
  } catch (error) {
    reply.code(500)
    return fail(`获取事件详情失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/event-records/trace/:traceId', async (request, reply) => {
  const { traceId } = request.params as { traceId: string }
  try {
    const rows = await EventBusService.getTrace(traceId)
    type TracedEvent = Awaited<ReturnType<typeof EventBusService.getTrace>>[number]
    return ok(rows.map((row: TracedEvent) => ({
      ...row,
      payload: safeParseJson<unknown>(row.payloadJson, {}),
      payloadJson: undefined
    })))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Trace 事件链路失败：${toErrorMessage(error)}`)
  }
})

// ==================== Communications ====================
fastify.get('/api/comms/profiles', async () => {
  return await prisma.commsProfile.findMany({
    include: {
      openclawProfile: true,
      targets: true
    },
    orderBy: { createdAt: 'desc' }
  })
})

fastify.post('/api/comms/profiles', async (request) => {
  const { name, provider, openclawProfileId, enabled } = request.body as CreateCommsProfileBody
  return await prisma.commsProfile.create({
    data: {
      name,
      provider,
      openclawProfileId: openclawProfileId || null,
      enabled: enabled ?? true
    }
  })
})

fastify.put('/api/comms/profiles/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { name, provider, openclawProfileId, enabled } = request.body as UpdateCommsProfileBody
  return await prisma.commsProfile.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(provider !== undefined ? { provider } : {}),
      ...(openclawProfileId !== undefined ? { openclawProfileId } : {}),
      ...(enabled !== undefined ? { enabled } : {})
    }
  })
})

fastify.delete('/api/comms/profiles/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.commsProfile.delete({ where: { id } })
})

fastify.get('/api/comms/targets', async (request) => {
  const { commsProfileId, allowlisted } = request.query as { commsProfileId?: string; allowlisted?: string }
  return await prisma.commsTarget.findMany({
    where: {
      ...(commsProfileId ? { commsProfileId } : {}),
      ...(allowlisted !== undefined ? { allowlisted: allowlisted === 'true' } : {})
    },
    include: { commsProfile: true },
    orderBy: { createdAt: 'desc' }
  })
})

fastify.post('/api/comms/targets', async (request) => {
  const { commsProfileId, channel, to, displayName, allowlisted, notes } = request.body as CreateCommsTargetBody
  const requestedBy = 'admin'

  const createdTarget = await prisma.commsTarget.create({
    data: {
      commsProfileId,
      channel,
      to,
      displayName,
      allowlisted: false,
      notes: notes || null
    }
  })

  if (!allowlisted) {
    return { status: 'success', target: createdTarget }
  }

  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_CONFIG',
    {
      kind: 'ALLOWLIST_TARGET',
      targetId: createdTarget.id,
      channel: createdTarget.channel,
      to: createdTarget.to
    },
    requestedBy,
    async () => {
      await prisma.commsTarget.update({
        where: { id: createdTarget.id },
        data: { allowlisted: true }
      })

      const traceId = uuidv4()
      await prisma.auditLog.create({
        data: {
          traceId,
          actor: requestedBy,
          action: 'ALLOWLIST_TARGET',
          tool: 'communications',
          request: JSON.stringify({ targetId: createdTarget.id, channel: createdTarget.channel, to: createdTarget.to }),
          response: JSON.stringify({ allowlisted: true }),
          ts: new Date()
        }
      })

      return { allowlisted: true }
    }
  )

  if (approvalResult.needsApproval) {
    return {
      status: 'pending_approval',
      approvalId: approvalResult.approvalId,
      message: '目标创建成功，加入 allowlist 需要审批',
      target: createdTarget
    }
  }

  const updatedTarget = await prisma.commsTarget.findUnique({ where: { id: createdTarget.id } })
  return { status: 'success', target: updatedTarget }
})

fastify.put('/api/comms/targets/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { channel, to, displayName, allowlisted, notes } = request.body as UpdateCommsTargetBody
  return await prisma.commsTarget.update({
    where: { id },
    data: {
      ...(channel !== undefined ? { channel } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
      ...(allowlisted !== undefined ? { allowlisted } : {}),
      ...(notes !== undefined ? { notes } : {})
    }
  })
})

fastify.delete('/api/comms/targets/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.commsTarget.delete({ where: { id } })
})

fastify.post('/api/comms/targets/:id/request-allowlist', async (request) => {
  const { id } = request.params as { id: string }
  const target = await prisma.commsTarget.findUnique({ where: { id } })
  if (!target) {
    throw new Error('通讯目标不存在')
  }

  if (target.allowlisted) {
    return { status: 'already_allowlisted', message: '该目标已在 allowlist 中' }
  }

  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_CONFIG',
    {
      kind: 'ALLOWLIST_TARGET',
      targetId: target.id,
      channel: target.channel,
      to: target.to
    },
    'admin',
    async () => {
      await prisma.commsTarget.update({
        where: { id: target.id },
        data: { allowlisted: true }
      })

      const traceId = uuidv4()
      await prisma.auditLog.create({
        data: {
          traceId,
          actor: 'admin',
          action: 'ALLOWLIST_TARGET',
          tool: 'communications',
          request: JSON.stringify({ targetId: target.id, channel: target.channel, to: target.to }),
          response: JSON.stringify({ allowlisted: true }),
          ts: new Date()
        }
      })

      return { allowlisted: true }
    }
  )

  if (approvalResult.needsApproval) {
    return {
      status: 'pending_approval',
      approvalId: approvalResult.approvalId,
      message: '加入 allowlist 需要审批'
    }
  }

  return { status: 'success', result: approvalResult.result }
})

// ==================== Contacts ====================
fastify.get('/api/contacts', async () => {
  const traceId = uuidv4()
  try {
    const contacts = await prisma.contact.findMany({
      include: {
        contactTargets: {
          include: {
            commsTarget: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    const result = contacts.map(contact => ({
      ...contact,
      tags: safeParseJson<string[]>(contact.tags, [])
    }))

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_LIST',
        tool: 'contacts',
        request: JSON.stringify({}),
        response: JSON.stringify({ count: result.length }),
        ts: new Date()
      }
    })

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`获取联系人列表失败：${message}`)
  }
})

fastify.post('/api/contacts', async (request) => {
  const traceId = uuidv4()
  try {
    const body = request.body as CreateContactBody
    if (!body.name || !body.name.trim()) {
      throw new Error('联系人姓名不能为空')
    }

    const created = await prisma.contact.create({
      data: {
        name: body.name.trim(),
        company: body.company || null,
        tags: JSON.stringify(body.tags || []),
        notes: body.notes || ''
      }
    })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_CREATE',
        tool: 'contacts',
        request: JSON.stringify({
          name: created.name,
          company: created.company,
          tagsCount: (body.tags || []).length
        }),
        response: JSON.stringify({ contactId: created.id }),
        ts: new Date()
      }
    })

    return created
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`创建联系人失败：${message}`)
  }
})

fastify.put('/api/contacts/:id', async (request) => {
  const traceId = uuidv4()
  try {
    const { id } = request.params as { id: string }
    const body = request.body as UpdateContactBody

    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) {
      throw new Error('联系人不存在')
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.company !== undefined ? { company: body.company || null } : {}),
        ...(body.tags !== undefined ? { tags: JSON.stringify(body.tags || []) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {})
      }
    })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_UPDATE',
        tool: 'contacts',
        request: JSON.stringify({
          contactId: id,
          patch: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.company !== undefined ? { company: body.company || null } : {}),
            ...(body.tags !== undefined ? { tags: body.tags || [] } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {})
          }
        }),
        response: JSON.stringify({ contactId: updated.id }),
        ts: new Date()
      }
    })

    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`更新联系人失败：${message}`)
  }
})

fastify.delete('/api/contacts/:id', async (request) => {
  const traceId = uuidv4()
  try {
    const { id } = request.params as { id: string }
    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) {
      throw new Error('联系人不存在')
    }

    const deleted = await prisma.contact.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_DELETE',
        tool: 'contacts',
        request: JSON.stringify({ contactId: id }),
        response: JSON.stringify({ contactId: deleted.id }),
        ts: new Date()
      }
    })

    return deleted
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`删除联系人失败：${message}`)
  }
})

fastify.post('/api/contacts/:contactId/targets', async (request) => {
  const traceId = uuidv4()
  try {
    const { contactId } = request.params as { contactId: string }
    const body = request.body as BindContactTargetBody

    if (!body.commsTargetId) {
      throw new Error('commsTargetId 不能为空')
    }

    const commsTarget = await prisma.commsTarget.findUnique({ where: { id: body.commsTargetId } })
    if (!commsTarget) {
      throw new Error('通讯目标不存在')
    }

    const isPrimary = body.isPrimary ?? false
    const toMasked = maskTarget(commsTarget.to)

    const created = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.contactTarget.updateMany({ where: { contactId }, data: { isPrimary: false } })
      }

      return await tx.contactTarget.create({
        data: {
          contactId,
          commsTargetId: commsTarget.id,
          isPrimary,
          channel: commsTarget.channel,
          toMasked,
          displayName: commsTarget.displayName
        }
      })
    })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_BIND',
        tool: 'contacts',
        request: JSON.stringify({
          contactId,
          commsTargetId: commsTarget.id,
          isPrimary,
          channel: commsTarget.channel,
          to: toMasked,
          displayName: commsTarget.displayName
        }),
        response: JSON.stringify({ contactTargetId: created.id }),
        ts: new Date()
      }
    })

    return created
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`绑定联系人目标失败：${message}`)
  }
})

fastify.get('/api/contacts/:contactId/targets', async (request) => {
  const traceId = uuidv4()
  try {
    const { contactId } = request.params as { contactId: string }

    const rows = await prisma.contactTarget.findMany({
      where: { contactId },
      include: { commsTarget: true }
    })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_LIST',
        tool: 'contacts',
        request: JSON.stringify({ contactId }),
        response: JSON.stringify({ count: rows.length }),
        ts: new Date()
      }
    })

    return rows
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`获取联系人目标列表失败：${message}`)
  }
})

fastify.delete('/api/contacts/:contactId/targets/:targetId', async (request) => {
  const traceId = uuidv4()
  try {
    const { contactId, targetId } = request.params as { contactId: string; targetId: string }

    await prisma.contactTarget.delete({ where: { id: targetId } })

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_UNBIND',
        tool: 'contacts',
        request: JSON.stringify({ contactId, targetId }),
        response: JSON.stringify({ success: true }),
        ts: new Date()
      }
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`解绑联系人目标失败：${message}`)
  }
})

fastify.put('/api/tickets/:id/contact', async (request) => {
  const { id } = request.params as { id: string }
  const body = request.body as { contactId?: string | null; primaryTargetId?: string | null }

  let primaryTargetId = body.primaryTargetId ?? null
  if (!primaryTargetId && body.contactId) {
    const primaryBinding = await prisma.contactTarget.findFirst({
      where: { contactId: body.contactId, isPrimary: true },
      include: { commsTarget: true }
    })
    primaryTargetId = primaryBinding?.commsTargetId || null
  }

  return await prisma.ticket.update({
    where: { id },
    data: {
      contactId: body.contactId || null,
      primaryTargetId
    },
    include: {
      contact: true,
      primaryTarget: true,
      assignee: true,
      artifacts: true,
      approvals: true,
      tags: { include: { tag: true } }
    }
  })
})

// ==================== Message Templates ====================
fastify.get('/api/message-templates', async (request) => {
  const { enabled } = request.query as { enabled?: string }
  const rows = await prisma.messageTemplate.findMany({
    where: enabled === undefined ? undefined : { enabled: enabled === 'true' },
    orderBy: { updatedAt: 'desc' }
  })

  return rows.map(row => ({
    ...row,
    channelConstraints: safeParseJson<string[]>(row.channelConstraints, []),
    variablesSchema: safeParseJson<Record<string, unknown>>(row.variablesSchema, {}),
    defaults: safeParseJson<Record<string, unknown>>(row.defaults, {})
  }))
})

fastify.post('/api/message-templates', async (request) => {
  const body = request.body as CreateTemplateBody
  return await prisma.messageTemplate.create({
    data: {
      name: body.name,
      scenario: body.scenario,
      channelConstraints: JSON.stringify(body.channelConstraints || []),
      contentFormat: body.contentFormat,
      subjectTemplate: body.subjectTemplate || null,
      bodyTemplate: body.bodyTemplate,
      variablesSchema: JSON.stringify(body.variablesSchema || {}),
      defaults: JSON.stringify(body.defaults || {}),
      enabled: body.enabled ?? true
    }
  })
})

fastify.put('/api/message-templates/:id', async (request) => {
  const { id } = request.params as { id: string }
  const body = request.body as Partial<CreateTemplateBody>
  return await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.scenario !== undefined ? { scenario: body.scenario } : {}),
      ...(body.channelConstraints !== undefined ? { channelConstraints: JSON.stringify(body.channelConstraints) } : {}),
      ...(body.contentFormat !== undefined ? { contentFormat: body.contentFormat } : {}),
      ...(body.subjectTemplate !== undefined ? { subjectTemplate: body.subjectTemplate } : {}),
      ...(body.bodyTemplate !== undefined ? { bodyTemplate: body.bodyTemplate } : {}),
      ...(body.variablesSchema !== undefined ? { variablesSchema: JSON.stringify(body.variablesSchema) } : {}),
      ...(body.defaults !== undefined ? { defaults: JSON.stringify(body.defaults) } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {})
    }
  })
})

fastify.post('/api/message-templates/render', async (request) => {
  const traceId = uuidv4()
  const body = request.body as RenderTemplateBody

  const requestAuditPayload = {
    templateId: body.templateId,
    ticketId: body.ticketId || null,
    channel: body.channel || null,
    toMasked: body.to ? maskTarget(body.to) : null,
    variablesKeys: Object.keys(body.variables || {})
  }

  try {
    if (!body.templateId) {
      throw new Error('templateId 必填')
    }

    const template = await prisma.messageTemplate.findUnique({ where: { id: body.templateId } })
    if (!template || !template.enabled) {
      throw new Error('模板不存在或已禁用')
    }

    const ticket = body.ticketId
      ? await prisma.ticket.findUnique({
        where: { id: body.ticketId },
        include: {
          contact: true,
          primaryTarget: true,
          artifacts: { orderBy: { createdAt: 'desc' }, take: 3 }
        }
      })
      : null

    if (body.ticketId && !ticket) {
      throw new Error('工单不存在')
    }

    const inferred: Record<string, unknown> = {
      ticketId: ticket?.id || '',
      ticketTitle: ticket?.title || '',
      contactName: ticket?.contact?.name || '',
      contactCompany: ticket?.contact?.company || '',
      latestArtifact: ticket?.artifacts?.[0]?.content || ''
    }

    const defaults = safeParseJson<Record<string, unknown>>(template.defaults, {})
    const variables = mergeTemplateVariables(defaults, inferred, body.variables || {})
    const renderedSubject = template.subjectTemplate ? renderTemplateText(template.subjectTemplate, variables) : null
    const renderedBody = renderTemplateText(template.bodyTemplate, variables)

    const run = await prisma.templateRun.create({
      data: {
        templateId: template.id,
        ticketId: ticket?.id || null,
        variables: stableJson(variables),
        renderedSubject,
        renderedBody
      }
    })

    const targetTo = (body.to || ticket?.primaryTarget?.to || '').trim()
    const targetChannel = (body.channel || ticket?.primaryTarget?.channel || 'slack').trim()
    if (!targetTo) {
      throw new Error('缺少接收目标 to')
    }
    if (!targetChannel) {
      throw new Error('缺少 channel')
    }

    const contentHash = computeContentHash({
      channel: targetChannel,
      to: targetTo,
      subject: renderedSubject,
      body: renderedBody
    })

    const idempotencyKey = computeIdempotencyKey({
      ticketId: ticket?.id || null,
      templateId: template.id,
      scenario: template.scenario,
      channel: targetChannel,
      to: targetTo,
      subject: renderedSubject,
      body: renderedBody
    })

    const duplicated = await prisma.outboundMessage.findFirst({
      where: {
        contentHash,
        status: { in: ['SENDING', 'SENT'] }
      }
    })

    const draftMessageId = duplicated
      ? duplicated.id
      : (await prisma.outboundMessage.create({
        data: {
          ticketId: ticket?.id || null,
          templateId: template.id,
          provider: 'openclaw',
          channel: targetChannel,
          to: targetTo,
          toMasked: maskTarget(targetTo),
          subject: renderedSubject,
          body: renderedBody,
          status: 'DRAFT',
          idempotencyKey,
          traceId: uuidv4(),
          contentHash,
          attempts: 0
        }
      })).id

    await prisma.auditLog.create({
      data: {
        traceId,
        actor: 'admin',
        action: 'TEMPLATE_RENDER',
        tool: 'message-templates',
        request: JSON.stringify(requestAuditPayload),
        response: JSON.stringify({
          templateRunId: run.id,
          outboundMessageId: draftMessageId,
          deduplicated: Boolean(duplicated),
          channel: targetChannel,
          toMasked: maskTarget(targetTo)
        }),
        ts: new Date()
      }
    })

    return {
      templateRunId: run.id,
      draftMessageId,
      renderedSubject,
      renderedBody
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await prisma.auditLog.create({
        data: {
          traceId,
          actor: 'admin',
          action: 'TEMPLATE_RENDER',
          tool: 'message-templates',
          request: JSON.stringify(requestAuditPayload),
          response: JSON.stringify({ success: false, error: message }),
          ts: new Date()
        }
      })
    } catch (logError) {
      const logMessage = logError instanceof Error ? logError.message : String(logError)
      fastify.log.error({ traceId, err: logMessage }, '写入审计日志失败：TEMPLATE_RENDER')
    }
    throw new Error(`渲染模板失败：${message}`)
  }
})

fastify.post('/api/template-runs/render-draft', async (request) => {
  const body = request.body as RenderTemplateBody
  const template = await prisma.messageTemplate.findUnique({ where: { id: body.templateId } })
  if (!template || !template.enabled) {
    throw new Error('模板不存在或已禁用')
  }

  const ticket = body.ticketId
    ? await prisma.ticket.findUnique({
      where: { id: body.ticketId },
      include: {
        contact: true,
        primaryTarget: true,
        artifacts: { orderBy: { createdAt: 'desc' }, take: 3 }
      }
    })
    : null

  const inferred = {
    ticketId: ticket?.id || '',
    ticketTitle: ticket?.title || '',
    contactName: ticket?.contact?.name || '',
    contactCompany: ticket?.contact?.company || '',
    latestArtifact: ticket?.artifacts?.[0]?.content || ''
  }

  const defaults = safeParseJson<Record<string, unknown>>(template.defaults, {})
  const variables = mergeTemplateVariables(defaults, inferred, body.variables || {})
  const renderedSubject = template.subjectTemplate ? renderTemplateText(template.subjectTemplate, variables) : null
  const renderedBody = renderTemplateText(template.bodyTemplate, variables)

  const run = await prisma.templateRun.create({
    data: {
      templateId: template.id,
      ticketId: ticket?.id || null,
      variables: stableJson(variables),
      renderedSubject,
      renderedBody
    }
  })

  const targetTo = body.to || ticket?.primaryTarget?.to || ''
  const targetChannel = body.channel || ticket?.primaryTarget?.channel || 'slack'
  const contentHash = computeContentHash({
    channel: targetChannel,
    to: targetTo,
    subject: renderedSubject,
    body: renderedBody
  })

  const idempotencyKey = computeIdempotencyKey({
    ticketId: ticket?.id || null,
    templateId: template.id,
    scenario: template.scenario,
    channel: targetChannel,
    to: targetTo,
    subject: renderedSubject,
    body: renderedBody
  })

  const draft = await prisma.outboundMessage.create({
    data: {
      ticketId: ticket?.id || null,
      templateId: template.id,
      provider: 'openclaw',
      channel: targetChannel,
      to: targetTo,
      toMasked: maskTarget(targetTo),
      subject: renderedSubject,
      body: renderedBody,
      status: 'DRAFT',
      idempotencyKey,
      traceId: uuidv4(),
      contentHash,
      attempts: 0
    }
  })

  return {
    templateRun: run,
    outboundDraft: draft,
    rendered: {
      subject: renderedSubject,
      body: renderedBody,
      variables
    }
  }
})

// ==================== Outbound Messages ====================
fastify.get('/api/outbound-messages', async (request) => {
  const { status, ticketId, contactId, channel } = request.query as {
    status?: OutboundMessageStatus
    ticketId?: string
    contactId?: string
    channel?: string
  }
  return await prisma.outboundMessage.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(ticketId ? { ticketId } : {}),
      ...(channel ? { channel } : {}),
      ...(contactId ? { ticket: { contactId } } : {})
    },
    include: {
      ticket: true,
      artifact: true
    },
    orderBy: { createdAt: 'desc' }
  })
})

fastify.post('/api/outbound-messages', async (request) => {
  const { ticketId, artifactId, approvalId, templateId, provider, channel, to, subject, body, status } = request.body as CreateOutboundMessageBody
  const contentHash = computeContentHash({ channel, to, subject: subject || null, body })
  const idempotencyKey = computeIdempotencyKey({
    ticketId: ticketId || null,
    templateId: templateId || null,
    channel,
    to,
    subject: subject || null,
    body
  })

  const existing = await prisma.outboundMessage.findUnique({ where: { idempotencyKey } })
  if (existing) {
    return existing
  }

  const traceId = uuidv4()
  return await prisma.outboundMessage.create({
    data: {
      ticketId: ticketId || null,
      artifactId: artifactId || null,
      approvalId: approvalId || null,
      templateId: templateId || null,
      provider: provider || 'openclaw',
      channel,
      to,
      toMasked: maskTarget(to),
      subject: subject || null,
      body,
      status: status || 'DRAFT',
      idempotencyKey,
      traceId,
      contentHash
    }
  })
})

fastify.put('/api/outbound-messages/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { channel, to, subject, body, status, lastError } = request.body as UpdateOutboundMessageBody
  const current = await prisma.outboundMessage.findUnique({ where: { id } })
  if (!current) {
    throw new Error('外发消息不存在')
  }

  const nextChannel = channel ?? current.channel
  const nextTo = to ?? current.to
  const nextSubject = subject ?? current.subject
  const nextBody = body ?? current.body
  const nextContentHash = computeContentHash({ channel: nextChannel, to: nextTo, subject: nextSubject, body: nextBody })

  return await prisma.outboundMessage.update({
    where: { id },
    data: {
      ...(channel !== undefined ? { channel } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(to !== undefined ? { toMasked: maskTarget(to) } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
      contentHash: nextContentHash
    }
  })
})

fastify.post('/api/outbound-messages/:id/send', async (request) => {
  const { id } = request.params as { id: string }
  const actor = 'admin'

  let message:
    | (Awaited<ReturnType<typeof prisma.outboundMessage.findUnique>>)
    | null = null

  try {
    message = await prisma.outboundMessage.findUnique({ where: { id } })
    if (!message) {
      throw new Error('外发消息不存在')
    }

    if (message.status !== 'DRAFT' && message.status !== 'APPROVED') {
      throw new Error('仅 DRAFT 或 APPROVED 状态允许发送')
    }

    const outboundMessageId = message.id
    const ticketId = message.ticketId || undefined
    const provider = message.provider
    const templateId = message.templateId || undefined
    const existingApprovalId = message.approvalId || undefined
    const msgTraceId = message.traceId
    const channel = message.channel
    const toMasked = maskTarget(message.to)

    const approvalPayload: SendExternalApprovalPayload = {
      outboundMessageId,
      traceId: msgTraceId,
      channel,
      to: toMasked
    }

    // 已审批的消息允许直接发送（避免重复创建审批）
    if (message.status === 'APPROVED') {
      const result = await dispatchOutboundMessage(outboundMessageId, actor)

      await prisma.auditLog.create({
        data: {
          ticketId,
          traceId: msgTraceId,
          actor,
          action: 'OUTBOUND_SEND_REQUESTED',
          tool: provider,
          approvalId: existingApprovalId,
          templateId,
          outboundMessageId,
          request: JSON.stringify(approvalPayload),
          response: JSON.stringify({ dispatched: true, via: 'already_approved' }),
          ts: new Date()
        }
      })

      return { status: 'sent', result }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'SEND_EXTERNAL',
      approvalPayload,
      actor,
      async () => {
        return await dispatchOutboundMessage(outboundMessageId, actor)
      },
      ticketId
    )

    if (approvalResult.needsApproval) {
      await prisma.outboundMessage.update({
        where: { id: outboundMessageId },
        data: {
          status: 'PENDING_APPROVAL',
          approvalId: approvalResult.approvalId || null,
          lastError: null
        }
      })

      await prisma.auditLog.create({
        data: {
          ticketId,
          traceId: msgTraceId,
          actor,
          action: 'OUTBOUND_SEND_REQUESTED',
          tool: provider,
          templateId,
          outboundMessageId,
          approvalId: approvalResult.approvalId || undefined,
          request: JSON.stringify(approvalPayload),
          response: JSON.stringify({ needsApproval: true, approvalId: approvalResult.approvalId }),
          ts: new Date()
        }
      })

      return {
        status: 'pending_approval',
        approvalId: approvalResult.approvalId,
        message: '外发消息需要审批后发送'
      }
    }

    await prisma.auditLog.create({
      data: {
        ticketId,
        traceId: msgTraceId,
        actor,
        action: 'OUTBOUND_SEND_REQUESTED',
        tool: provider,
        approvalId: existingApprovalId,
        templateId,
        outboundMessageId,
        request: JSON.stringify(approvalPayload),
        response: JSON.stringify({ needsApproval: false, dispatched: true }),
        ts: new Date()
      }
    })

    return {
      status: 'sent',
      result: approvalResult.result
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    if (message) {
      try {
        await prisma.auditLog.create({
          data: {
            ticketId: message.ticketId || undefined,
            traceId: message.traceId,
            actor,
            action: 'OUTBOUND_SEND_REQUESTED',
            tool: message.provider,
            approvalId: message.approvalId || undefined,
            templateId: message.templateId || undefined,
            outboundMessageId: message.id,
            request: JSON.stringify({
              outboundMessageId: message.id,
              traceId: message.traceId,
              channel: message.channel,
              to: maskTarget(message.to)
            }),
            response: JSON.stringify({ success: false, error: errMsg }),
            ts: new Date()
          }
        })
      } catch (logError) {
        const logMsg = logError instanceof Error ? logError.message : String(logError)
        fastify.log.error({ traceId: message.traceId, err: logMsg }, '写入审计日志失败：OUTBOUND_SEND_REQUESTED')
      }
    }

    throw new Error(`发送外发消息失败：${errMsg}`)
  }
})

fastify.post('/api/outbound-messages/:id/retry', async (request) => {
  const { id } = request.params as { id: string }
  const message = await prisma.outboundMessage.findUnique({ where: { id } })

  if (!message) {
    throw new Error('外发消息不存在')
  }

  if (message.status !== 'FAILED') {
    return { status: 'skipped', message: '仅 FAILED 状态允许重试' }
  }

  if (message.approvalId) {
    const approval = await prisma.approval.findUnique({ where: { id: message.approvalId } })
    if (!approval || approval.status !== 'APPROVED') {
      return { status: 'blocked', message: '外发重试需要有效审批（APPROVED）' }
    }
  } else {
    return { status: 'blocked', message: '未关联审批，禁止直接重试' }
  }

  if (message.nextRetryAt && message.nextRetryAt.getTime() > Date.now()) {
    return { status: 'deferred', message: '仍在退避窗口内', nextRetryAt: message.nextRetryAt.toISOString() }
  }

  const result = await dispatchOutboundMessage(message.id, 'admin')
  return { status: 'sent', result }
})

fastify.post('/api/outbound-messages/retry-due', async () => {
  const traceId = uuidv4()
  const actor = 'system'

  try {
    const now = new Date()
    const dueMessages = await prisma.outboundMessage.findMany({
      where: {
        status: 'FAILED',
        attempts: { lt: MAX_RETRY_ATTEMPTS },
        OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null }]
      },
      orderBy: { nextRetryAt: 'asc' }
    })

    const results: Array<{ id: string; success: boolean; error?: string }> = []
    let successCount = 0

    for (const msg of dueMessages) {
      try {
        await dispatchOutboundMessage(msg.id, actor)
        results.push({ id: msg.id, success: true })
        successCount += 1
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        results.push({ id: msg.id, success: false, error: errMsg })
      }
    }

    await prisma.auditLog.create({
      data: {
        traceId,
        actor,
        action: 'OUTBOUND_BATCH_RETRY',
        tool: 'outbound-messages',
        request: JSON.stringify({
          now: now.toISOString(),
          criteria: {
            status: 'FAILED',
            attemptsLt: MAX_RETRY_ATTEMPTS,
            nextRetryAtDueOrNull: true
          }
        }),
        response: JSON.stringify({
          total: dueMessages.length,
          successCount,
          failureCount: dueMessages.length - successCount
        }),
        ts: new Date()
      }
    })

    return {
      retriedCount: successCount,
      results
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    try {
      await prisma.auditLog.create({
        data: {
          traceId,
          actor,
          action: 'OUTBOUND_BATCH_RETRY',
          tool: 'outbound-messages',
          request: JSON.stringify({ reason: 'exception' }),
          response: JSON.stringify({ success: false, error: errMsg }),
          ts: new Date()
        }
      })
    } catch (logError) {
      const logMsg = logError instanceof Error ? logError.message : String(logError)
      fastify.log.error({ traceId, err: logMsg }, '写入审计日志失败：OUTBOUND_BATCH_RETRY')
    }
    throw new Error(`批量重试外发消息失败：${errMsg}`)
  }
})
// ==================== Connection Profiles ====================
fastify.get('/api/profiles', async () => {
  return await prisma.connectionProfile.findMany()
})

fastify.post('/api/profiles', async (request) => {
  const { name, baseUrl, wsUrl, authMode, token, password, edgeToken } = request.body as any
  
  // 存储敏感信息到 Keychain
  if (token) {
    await KeychainService.setPassword(`${name}-token`, token)
  }
  if (password) {
    await KeychainService.setPassword(`${name}-password`, password)
  }
  if (edgeToken) {
    await KeychainService.setPassword(`${name}-edge-token`, edgeToken)
  }
  
  // 只存储非敏感信息到数据库
  return await prisma.connectionProfile.create({
    data: { name, baseUrl, wsUrl, authMode }
  })
})

fastify.get('/api/profiles/:id/credentials', async (request) => {
  const { id } = request.params as { id: string }
  const profile = await prisma.connectionProfile.findUnique({ where: { id } })
  if (!profile) throw new Error('Profile not found')
  
  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)
  
  return {
    token: KeychainService.maskValue(token),
    password: KeychainService.maskValue(password),
    edgeToken: KeychainService.maskValue(edgeToken),
    hasToken: !!token,
    hasPassword: !!password,
    hasEdgeToken: !!edgeToken
  }
})

// ==================== Health Check ====================
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// ==================== Tools CRUD ====================
fastify.post('/api/tools', async (request) => {
  const data = request.body as { name: string; scope: string; riskClass: string; configSchema: string }
  return await prisma.tool.create({ data })
})

fastify.put('/api/tools/:id', async (request) => {
  const { id } = request.params as { id: string }
  const data = request.body as { name?: string; scope?: string; riskClass?: string; configSchema?: string }
  return await prisma.tool.update({ where: { id }, data })
})

fastify.delete('/api/tools/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.tool.delete({ where: { id } })
})

// ==================== AgentTool Authorization ====================
fastify.get('/api/agent-tools', async (request) => {
  const { agentId } = request.query as { agentId?: string }
  return await prisma.agentTool.findMany({
    where: agentId ? { agentId } : undefined,
    include: { agent: true, tool: true }
  })
})

fastify.post('/api/agent-tools', async (request) => {
  const { agentId, toolId, permissionJson } = request.body as { agentId: string; toolId: string; permissionJson: string }
  return await prisma.agentTool.create({
    data: { agentId, toolId, permissionJson }
  })
})

fastify.put('/api/agent-tools/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { permissionJson } = request.body as { permissionJson: string }
  return await prisma.agentTool.update({
    where: { id },
    data: { permissionJson }
  })
})

fastify.delete('/api/agent-tools/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.agentTool.delete({ where: { id } })
})

fastify.post('/api/team/hire', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as TeamHireBody

  try {
    if (!body.profileId) {
      reply.code(400)
      return fail('profileId 不能为空')
    }
    if (!body.template || !(body.template in TEAM_HIRE_TEMPLATES)) {
      reply.code(400)
      return fail('template 无效')
    }

    const { profile, hired } = await executeTeamHire(body.profileId, body.template)

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'TEAM_HIRE_TEMPLATE',
      tool: 'team-management',
      request: {
        profileId: profile.id,
        profileName: profile.name,
        template: body.template
      },
      response: {
        hiredCount: hired.length,
        hiredAgents: hired.map(item => item.agentName)
      }
    })

    return ok({
      profileId: profile.id,
      profileName: profile.name,
      template: body.template,
      hired
    })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'TEAM_HIRE_TEMPLATE',
      tool: 'team-management',
      request: body,
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`一键招聘失败：${errMsg}`)
  }
})

fastify.post('/api/openclaw/bootstrap', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as BootstrapOpenClawBody

  try {
    if (!body.workspaceId || !body.name || !body.targetType || !body.host || !body.sshUser) {
      reply.code(400)
      return fail('workspaceId/name/targetType/host/sshUser 不能为空')
    }

    const gatewayPort = body.gatewayPort ?? 18789
    const sshPort = body.sshPort ?? 22
    const envType = body.envType ?? 'DEV'
    const authMode = body.authMode ?? 'token'
    const target = await prisma.deploymentTarget.create({
      data: {
        workspaceId: body.workspaceId,
        name: body.name,
        targetType: body.targetType,
        connectionMode: 'SSH',
        host: body.host,
        port: gatewayPort,
        sshUser: body.sshUser,
        sshPort,
        gatewayUrl: `http://${body.host}:${gatewayPort}`,
        dockerEnabled: body.targetType === 'REMOTE_DOCKER',
        tailscaleEnabled: false,
        envType,
        status: 'UNKNOWN',
        metadata: JSON.stringify({ installMode: body.targetType === 'REMOTE_DOCKER' ? 'docker' : 'native' })
      }
    })

    const bootstrapResult = await HostAgentService.createBootstrapRegistration({
      workspaceId: body.workspaceId,
      targetId: target.id,
      expiresInMinutes: 15
    })

    const profile = await prisma.connectionProfile.create({
      data: {
        name: `${body.name} OpenClaw`,
        baseUrl: `http://${body.host}:${gatewayPort}`,
        wsUrl: `ws://${body.host}:${gatewayPort}`,
        authMode
      }
    })

    let hired: TeamHireResultItem[] = []
    if (body.autoHireTemplate) {
      const hireResult = await executeTeamHire(profile.id, body.autoHireTemplate)
      hired = hireResult.hired
    }

    const installCommand = [
      '$env:SOLOFORGE_SERVER_URL="http://<soloForge-host>:13789"',
      `$env:SOLOFORGE_BOOTSTRAP_TOKEN=\"${bootstrapResult.bootstrapToken}\"`,
      '$env:SOLOFORGE_AGENT_NAME="soloforge-host-agent"',
      'npx tsx src/host-agent/index.ts'
    ].join('; ')

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OPENCLAW_BOOTSTRAP_CREATE',
      tool: 'deployment',
      request: {
        workspaceId: body.workspaceId,
        name: body.name,
        targetType: body.targetType,
        host: body.host,
        envType,
        autoHireTemplate: body.autoHireTemplate || null
      },
      response: {
        targetId: target.id,
        profileId: profile.id,
        registrationId: bootstrapResult.registration.id,
        hiredCount: hired.length
      }
    })

    return ok({
      target: {
        id: target.id,
        name: target.name,
        host: target.host,
        gatewayUrl: target.gatewayUrl,
        envType: target.envType,
        targetType: target.targetType
      },
      profile: {
        id: profile.id,
        name: profile.name,
        baseUrl: profile.baseUrl,
        wsUrl: profile.wsUrl,
        authMode: profile.authMode
      },
      bootstrap: {
        registrationId: bootstrapResult.registration.id,
        bootstrapToken: bootstrapResult.bootstrapToken,
        expiresAt: bootstrapResult.expiresAt,
        installCommand
      },
      hired
    })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OPENCLAW_BOOTSTRAP_CREATE',
      tool: 'deployment',
      request: body,
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`一键部署 OpenClaw 失败：${errMsg}`)
  }
})

fastify.post('/api/openclaw/bootstrap/install-job', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as BootstrapInstallJobBody

  try {
    if (!body.targetId || !body.profileId || !body.registrationId) {
      reply.code(400)
      return fail('targetId/profileId/registrationId 不能为空')
    }

    const [target, profile] = await Promise.all([
      prisma.deploymentTarget.findUnique({ where: { id: body.targetId } }),
      prisma.connectionProfile.findUnique({ where: { id: body.profileId } })
    ])

    if (!target) {
      reply.code(404)
      return fail('部署目标不存在')
    }
    if (!profile) {
      reply.code(404)
      return fail('连接配置不存在')
    }

    const installMode = target.targetType === 'REMOTE_DOCKER' ? 'docker' : 'native'
    const jobRequest = {
      targetId: target.id,
      targetName: target.name,
      profileId: profile.id,
      profileName: profile.name,
      registrationId: body.registrationId,
      suggestedGatewayUrl: target.gatewayUrl,
      installMode,
      projectName: 'openclaw-gateway',
      remotePath: '/opt/openclaw'
    }

    const job = await prisma.deploymentJob.create({
      data: {
        workspaceId: target.workspaceId,
        targetId: target.id,
        type: 'OPENCLAW_BOOTSTRAP_INSTALL',
        traceId,
        requestJson: JSON.stringify(jobRequest),
        status: 'PENDING'
      }
    })

    let dispatchMessage = '安装作业已入队，等待后续处理'
    let dispatchedActionId: string | null = null

    const onlineAgent = await prisma.hostAgent.findFirst({
      where: {
        workspaceId: target.workspaceId,
        targetId: target.id,
        status: 'ONLINE'
      },
      orderBy: { updatedAt: 'desc' }
    })

    if (onlineAgent && target.targetType === 'REMOTE_DOCKER') {
      const action = await HostAgentService.createAction({
        workspaceId: target.workspaceId,
        targetId: target.id,
        hostAgentId: onlineAgent.id,
        actionType: 'DOCKER_COMPOSE_UP',
        request: {
          projectName: 'openclaw-gateway',
          remotePath: '/opt/openclaw',
          gatewayUrl: target.gatewayUrl,
          deploymentJobId: job.id,
          registrationId: body.registrationId
        },
        actor,
        traceId
      })

      if ('status' in action && action.status === 'BLOCKED') {
        dispatchMessage = action.errorSummary || 'Host Agent 已在线，但当前动作被策略阻止'
        await prisma.deploymentJob.update({
          where: { id: job.id },
          data: {
            resultJson: JSON.stringify({ dispatch: 'blocked', reason: dispatchMessage })
          }
        })
      } else {
        dispatchedActionId = action.id
        dispatchMessage = '安装作业已分派给在线 Host Agent，等待 Agent 拉取执行'
        await prisma.deploymentJob.update({
          where: { id: job.id },
          data: {
            status: 'RUNNING',
            resultJson: JSON.stringify({ dispatch: 'host-agent', actionId: action.id, hostAgentId: onlineAgent.id })
          }
        })
      }
    } else {
      dispatchMessage = onlineAgent
        ? '当前目标不是 REMOTE_DOCKER，作业已入队，等待后续原生安装执行器接管'
        : '当前无在线 Host Agent，作业已入队，等待 Agent 上线后接管'

      await prisma.deploymentJob.update({
        where: { id: job.id },
        data: {
          resultJson: JSON.stringify({ dispatch: 'queued', reason: dispatchMessage })
        }
      })
    }

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OPENCLAW_BOOTSTRAP_INSTALL_JOB_CREATE',
      tool: 'deployment',
      request: body,
      response: { jobId: job.id, targetId: target.id, profileId: profile.id, dispatchedActionId, dispatchMessage }
    })

    return ok({
      jobId: job.id,
      status: dispatchedActionId ? 'RUNNING' : job.status,
      targetId: target.id,
      targetName: target.name,
      profileId: profile.id,
      profileName: profile.name,
      dispatchedActionId,
      dispatchMessage
    })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OPENCLAW_BOOTSTRAP_INSTALL_JOB_CREATE',
      tool: 'deployment',
      request: body,
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`发起安装作业失败：${errMsg}`)
  }
})

// ==================== Connection Profiles Extended ====================
fastify.put('/api/profiles/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { name, baseUrl, wsUrl, authMode, token, password, edgeToken } = request.body as {
    name?: string; baseUrl?: string; wsUrl?: string; authMode?: string
    token?: string; password?: string; edgeToken?: string
  }
  
  const profile = await prisma.connectionProfile.findUnique({ where: { id } })
  if (!profile) throw new Error('Profile not found')
  
  const profileName = name || profile.name
  
  if (token) await KeychainService.setPassword(`${profileName}-token`, token)
  if (password) await KeychainService.setPassword(`${profileName}-password`, password)
  if (edgeToken) await KeychainService.setPassword(`${profileName}-edge-token`, edgeToken)
  
  return await prisma.connectionProfile.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(baseUrl && { baseUrl }),
      ...(wsUrl && { wsUrl }),
      ...(authMode && { authMode })
    }
  })
})

fastify.delete('/api/profiles/:id', async (request) => {
  const { id } = request.params as { id: string }
  const profile = await prisma.connectionProfile.findUnique({ where: { id } })
  if (!profile) throw new Error('Profile not found')
  
  // 清理 Keychain
  await KeychainService.deletePassword(`${profile.name}-token`)
  await KeychainService.deletePassword(`${profile.name}-password`)
  await KeychainService.deletePassword(`${profile.name}-edge-token`)
  
  // 断开连接
  const client = openClawClients.get(id)
  if (client) {
    client.disconnect()
    openClawClients.delete(id)
  }
  
  return await prisma.connectionProfile.delete({ where: { id } })
})

// ==================== OpenClaw Client ====================
fastify.post('/api/openclaw/ping', async (request) => {
  const { profileId } = request.body as { profileId: string }
  
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw new Error('Profile not found')
  
  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)
  
  const client = new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined
  })
  
  const result = await client.ping()
  
  // 更新健康检查状态
  await prisma.connectionProfile.update({
    where: { id: profileId },
    data: {
      lastHealthCheck: new Date(),
      lastHealthStatus: result.success ? 'healthy' : 'unhealthy'
    }
  })
  
  return result
})

fastify.post('/api/openclaw/connect', async (request) => {
  const { profileId } = request.body as { profileId: string }
  
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw new Error('Profile not found')
  
  // 如果已连接，先断开
  const existing = openClawClients.get(profileId)
  if (existing) {
    existing.disconnect()
    openClawClients.delete(profileId)
  }
  
  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)
  
  const client = new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined
  })
  
  try {
    await client.connect()
    openClawClients.set(profileId, client)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

fastify.post('/api/openclaw/disconnect', async (request) => {
  const { profileId } = request.body as { profileId: string }
  const client = openClawClients.get(profileId)
  if (client) {
    client.disconnect()
    openClawClients.delete(profileId)
  }
  return { success: true }
})

fastify.get('/api/openclaw/:profileId/status', async (request) => {
  const { profileId } = request.params as { profileId: string }
  const client = openClawClients.get(profileId)
  return { connected: client ? client.isConnected() : false }
})

// ==================== OpenClaw Config ====================
fastify.get('/api/openclaw/:profileId/config', async (request) => {
  const { profileId } = request.params as { profileId: string }
  const client = openClawClients.get(profileId)
  if (!client) throw new Error('Client not connected. 请先连接到 OpenClaw。')
  return await client.getConfig()
})

fastify.post('/api/config/apply', async (request) => {
  const { profileId, config } = request.body as { profileId: string; config: unknown }
  
  // 限频检查
  const rateCheck = ConfigManager.checkRateLimit(profileId)
  if (!rateCheck.allowed) {
    return {
      status: 'rate_limited',
      message: `写入限频中，请在 ${Math.ceil(rateCheck.resetIn / 1000)} 秒后重试`,
      resetIn: rateCheck.resetIn,
      remaining: rateCheck.remaining
    }
  }
  
  // trustedProxies 校验
  const configObj = config as Record<string, unknown>
  const gateway = configObj?.gateway as Record<string, unknown> | undefined
  if (gateway?.trustedProxies && Array.isArray(gateway.trustedProxies)) {
    const validation = ConfigManager.validateTrustedProxies(gateway.trustedProxies as string[])
    if (!validation.valid) {
      return { status: 'validation_error', errors: validation.errors }
    }
  }
  
  // 审批检查
  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_CONFIG',
    { profileId, config },
    'admin',
    async () => {
      const client = openClawClients.get(profileId)
      if (!client) throw new Error('Client not connected')
      
      const traceId = uuidv4()
      
      // 保存快照（应用前）
      await ConfigManager.saveSnapshot(profileId, config)
      
      // 应用配置
      const result = await client.applyConfig(config, traceId)
      
      // 记录写入
      ConfigManager.recordWrite(profileId)
      
      // 审计日志
      await prisma.auditLog.create({
        data: {
          traceId,
          actor: 'admin',
          action: 'APPLY_CONFIG',
          request: JSON.stringify(config),
          response: JSON.stringify(result),
          ts: new Date()
        }
      })
      
      return result
    }
  )
  
  if (approvalResult.needsApproval) {
    return {
      status: 'pending_approval',
      approvalId: approvalResult.approvalId,
      message: '配置变更需要审批'
    }
  }
  
  return { status: 'success', result: approvalResult.result }
})

// ==================== Config Snapshots ====================
fastify.get('/api/config/snapshots', async (request) => {
  const { profileId } = request.query as { profileId: string }
  if (!profileId) throw new Error('profileId is required')
  return await ConfigManager.listSnapshots(profileId)
})

fastify.get('/api/config/snapshots/:id', async (request) => {
  const { id } = request.params as { id: string }
  const config = await ConfigManager.getSnapshot(id)
  if (!config) throw new Error('Snapshot not found')
  return config
})

fastify.post('/api/config/rollback', async (request) => {
  const { profileId, snapshotId } = request.body as { profileId: string; snapshotId: string }
  
  // 限频检查
  const rateCheck = ConfigManager.checkRateLimit(profileId)
  if (!rateCheck.allowed) {
    return {
      status: 'rate_limited',
      message: `写入限频中，请在 ${Math.ceil(rateCheck.resetIn / 1000)} 秒后重试`,
      resetIn: rateCheck.resetIn
    }
  }
  
  // 审批检查（回滚也属于 CHANGE_CONFIG）
  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_CONFIG',
    { profileId, snapshotId, action: 'rollback' },
    'admin',
    async () => {
      const config = await ConfigManager.rollback(snapshotId)
      const client = openClawClients.get(profileId)
      if (!client) throw new Error('Client not connected')
      
      const traceId = uuidv4()
      const result = await client.applyConfig(config, traceId)
      
      ConfigManager.recordWrite(profileId)
      
      await prisma.auditLog.create({
        data: {
          traceId,
          actor: 'admin',
          action: 'ROLLBACK_CONFIG',
          request: JSON.stringify({ snapshotId }),
          response: JSON.stringify(result),
          ts: new Date()
        }
      })
      
      return result
    }
  )
  
  if (approvalResult.needsApproval) {
    return {
      status: 'pending_approval',
      approvalId: approvalResult.approvalId,
      message: '配置回滚需要审批'
    }
  }
  
  return { status: 'success', result: approvalResult.result }
})

fastify.get('/api/config/rate-limit', async (request) => {
  const { profileId } = request.query as { profileId: string }
  if (!profileId) throw new Error('profileId is required')
  return ConfigManager.checkRateLimit(profileId)
})

// ==================== Roles CRUD ====================
fastify.post('/api/roles', async (request) => {
  const data = request.body as {
    name: string; description: string; defaultPrompt: string
    outputSchema: string; riskLevel: string
  }
  return await prisma.role.create({ data })
})

fastify.put('/api/roles/:id', async (request) => {
  const { id } = request.params as { id: string }
  const data = request.body as {
    name?: string; description?: string; defaultPrompt?: string
    outputSchema?: string; riskLevel?: string
  }
  return await prisma.role.update({ where: { id }, data })
})

// ==================== Pipelines ====================
fastify.get('/api/pipelines', async (_request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  try {
    const pipelines = await prisma.pipeline.findMany({
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' }
    })

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'PIPELINE_LIST',
      tool: 'pipeline',
      request: {},
      response: { count: pipelines.length }
    })

    return ok(pipelines)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'PIPELINE_LIST',
      tool: 'pipeline',
      request: {},
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取 Pipeline 列表失败：${errMsg}`)
  }
})

fastify.get('/api/pipelines/:id', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const pipeline = await prisma.pipeline.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } }
    })
    if (!pipeline) {
      reply.code(404)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'PIPELINE_GET',
        tool: 'pipeline',
        request: { id },
        response: fail('Pipeline 不存在')
      })
      return fail('Pipeline 不存在')
    }

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'PIPELINE_GET',
      tool: 'pipeline',
      request: { id },
      response: { pipelineId: pipeline.id }
    })

    return ok(pipeline)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'PIPELINE_GET',
      tool: 'pipeline',
      request: { id },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取 Pipeline 失败：${errMsg}`)
  }
})

fastify.get('/api/tickets/:id/pipeline', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id: ticketId } = request.params as { id: string }

  try {
    if (!ticketId) {
      reply.code(400)
      return fail('ticketId 不能为空')
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      reply.code(404)
      await writeApiAuditLog({
        traceId,
        ticketId,
        actor,
        action: 'TICKET_PIPELINE_GET',
        tool: 'pipeline',
        request: { ticketId },
        response: fail('工单不存在')
      })
      return fail('工单不存在')
    }

    const state = await prisma.$transaction(async (tx) => {
      const existing = await tx.ticketPipelineState.findUnique({
        where: { ticketId },
        include: { pipeline: { include: { steps: true } } }
      })
      if (existing) return existing

      const pipeline = await tx.pipeline.findFirst({
        where: { enabled: true },
        orderBy: { createdAt: 'asc' },
        include: { steps: { orderBy: { order: 'asc' } } }
      })
      if (!pipeline) {
        throw new Error('未找到可用的 Pipeline（enabled=true）')
      }
      if (pipeline.steps.length === 0) {
        throw new Error('可用 Pipeline 未配置任何步骤')
      }

      const first = pipeline.steps[0]
      return await tx.ticketPipelineState.create({
        data: {
          ticketId,
          pipelineId: pipeline.id,
          currentStepOrder: first.order,
          status: 'RUNNING'
        },
        include: { pipeline: { include: { steps: true } } }
      })
    })

    const stepsSorted = state.pipeline.steps.slice().sort((a, b) => a.order - b.order)
    const currentStep = stepsSorted.find(s => s.order === state.currentStepOrder) || null
    const needsApproval = currentStep ? PipelineManager.requiresApproval(currentStep) : false

    await writeApiAuditLog({
      traceId,
      ticketId,
      actor,
      action: 'TICKET_PIPELINE_GET',
      tool: 'pipeline',
      request: { ticketId },
      response: { pipelineId: state.pipelineId, currentStepOrder: state.currentStepOrder, status: state.status }
    })

    return ok({
      ticketId,
      state: {
        id: state.id,
        pipelineId: state.pipelineId,
        currentStepOrder: state.currentStepOrder,
        status: state.status,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt
      },
      pipeline: {
        id: state.pipeline.id,
        name: state.pipeline.name,
        enabled: state.pipeline.enabled,
        steps: stepsSorted
      },
      currentStep,
      needsApproval
    })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      ticketId,
      actor,
      action: 'TICKET_PIPELINE_GET',
      tool: 'pipeline',
      request: { ticketId },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取工单 Pipeline 状态失败：${errMsg}`)
  }
})

fastify.post('/api/tickets/:id/pipeline/advance', async (request, reply) => {
  const { id: ticketId } = request.params as { id: string }
  const traceId = uuidv4()
  const body = request.body as { actor?: string }
  const actor = (body.actor || 'admin').trim()

  try {
    if (!ticketId) {
      reply.code(400)
      return fail('ticketId 不能为空')
    }
    if (!actor) {
      reply.code(400)
      return fail('actor 不能为空')
    }

    const result = await PipelineManager.advanceStep(ticketId, actor)
    await writeApiAuditLog({
      traceId: result.traceId || traceId,
      ticketId,
      actor,
      action: 'PIPELINE_ADVANCE_API',
      tool: 'pipeline',
      request: { ticketId },
      response: result
    })

    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      ticketId,
      actor,
      action: 'PIPELINE_ADVANCE_API',
      tool: 'pipeline',
      request: { ticketId },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`推进 Pipeline 失败：${errMsg}`)
  }
})

fastify.post('/api/tickets/:id/pipeline/rollback', async (request, reply) => {
  const { id: ticketId } = request.params as { id: string }
  const traceId = uuidv4()
  const body = request.body as { actor?: string }
  const actor = (body.actor || 'admin').trim()

  try {
    if (!ticketId) {
      reply.code(400)
      return fail('ticketId 不能为空')
    }
    if (!actor) {
      reply.code(400)
      return fail('actor 不能为空')
    }

    const result = await PipelineManager.rollbackStep(ticketId, actor)
    await writeApiAuditLog({
      traceId: result.traceId || traceId,
      ticketId,
      actor,
      action: 'PIPELINE_ROLLBACK_API',
      tool: 'pipeline',
      request: { ticketId },
      response: result
    })
    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      ticketId,
      actor,
      action: 'PIPELINE_ROLLBACK_API',
      tool: 'pipeline',
      request: { ticketId },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`回退 Pipeline 失败：${errMsg}`)
  }
})

// ==================== Jobs ====================
fastify.get('/api/jobs', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { ticketId } = request.query as { ticketId?: string }

  try {
    const where = ticketId ? { ticketId } : undefined
    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200
    })

    await writeApiAuditLog({
      traceId,
      actor,
      ticketId,
      action: 'JOB_LIST',
      tool: 'job',
      request: { ticketId: ticketId || null },
      response: { count: jobs.length }
    })

    return ok(jobs)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      ticketId,
      action: 'JOB_LIST',
      tool: 'job',
      request: { ticketId: ticketId || null },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取 Jobs 列表失败：${errMsg}`)
  }
})

fastify.get('/api/jobs/:id', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) {
      reply.code(404)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'JOB_GET',
        tool: 'job',
        request: { id },
        response: fail('Job 不存在')
      })
      return fail('Job 不存在')
    }

    await writeApiAuditLog({
      traceId,
      actor,
      ticketId: job.ticketId ?? undefined,
      action: 'JOB_GET',
      tool: 'job',
      request: { id },
      response: { id: job.id, status: job.status }
    })
    return ok(job)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'JOB_GET',
      tool: 'job',
      request: { id },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取 Job 失败：${errMsg}`)
  }
})

fastify.post('/api/jobs', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as { ticketId: string; type: string; request: unknown; stepOrder?: number }

  try {
    if (!body.ticketId) {
      reply.code(400)
      return fail('ticketId 不能为空')
    }
    if (!body.type || !body.type.trim()) {
      reply.code(400)
      return fail('type 不能为空')
    }

    const job = await JobManager.createJob(body.ticketId, body.type.trim(), body.request, body.stepOrder)

    await writeApiAuditLog({
      traceId: job.traceId || traceId,
      actor,
      ticketId: job.ticketId ?? undefined,
      action: 'JOB_CREATE_API',
      tool: 'job',
      request: { ticketId: body.ticketId, type: body.type, stepOrder: body.stepOrder ?? null },
      response: { jobId: job.id, status: job.status }
    })

    return ok(job)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      ticketId: body.ticketId,
      action: 'JOB_CREATE_API',
      tool: 'job',
      request: { ticketId: body.ticketId, type: body.type, stepOrder: body.stepOrder ?? null },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`创建 Job 失败：${errMsg}`)
  }
})

fastify.post('/api/jobs/:id/retry', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const newJob = await JobManager.retryJob(id)
    await writeApiAuditLog({
      traceId: newJob.traceId || traceId,
      actor,
      ticketId: newJob.ticketId ?? undefined,
      action: 'JOB_RETRY_API',
      tool: 'job',
      request: { jobId: id },
      response: { newJobId: newJob.id, status: newJob.status }
    })
    return ok(newJob)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'JOB_RETRY_API',
      tool: 'job',
      request: { jobId: id },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`重试 Job 失败：${errMsg}`)
  }
})

// ==================== Webhooks ====================
interface OpenClawJobResultBody {
  trace_id: string
  job_id: string
  status: JobStatus
  result?: unknown
  logs?: string
}

fastify.post('/webhooks/openclaw/job_result', async (request, reply) => {
  const body = request.body as OpenClawJobResultBody
  const actor = 'openclaw'
  const traceId = (body?.trace_id || '').trim() || uuidv4()

  try {
    if (!body || !body.trace_id || !body.job_id) {
      reply.code(400)
      return fail('trace_id 与 job_id 必填')
    }
    if (!body.status) {
      reply.code(400)
      return fail('status 必填')
    }

    // 幂等检查：基于 trace_id + job_id
    const existing = await prisma.job.findFirst({
      where: { traceId: body.trace_id, id: body.job_id }
    })
    if (!existing) {
      reply.code(404)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'WEBHOOK_JOB_RESULT',
        tool: 'webhook',
        request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
        response: fail('Job 不存在或 trace_id 不匹配')
      })
      return fail('Job 不存在或 trace_id 不匹配')
    }
    if (existing && existing.status !== 'PENDING') {
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId: existing.ticketId ?? undefined,
        action: 'WEBHOOK_JOB_RESULT',
        tool: 'webhook',
        request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
        response: { message: '已处理（幂等）', jobId: existing.id, status: existing.status }
      })
      return ok({ message: '已处理（幂等）', job: existing })
    }

    const updated = await JobManager.updateJobStatus(existing.id, body.status, body.result, body.logs)

    await writeApiAuditLog({
      traceId,
      actor,
      ticketId: updated.ticketId ?? undefined,
      action: 'WEBHOOK_JOB_RESULT',
      tool: 'webhook',
      request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
      response: { jobId: updated.id, status: updated.status }
    })

    return ok({ message: '已更新', job: updated })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'WEBHOOK_JOB_RESULT',
      tool: 'webhook',
      request: { trace_id: body?.trace_id, job_id: body?.job_id },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`处理 webhook 失败：${errMsg}`)
  }
})

// ==================== Outbox ====================
fastify.get('/api/outbox', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { status } = request.query as { status?: string }

  try {
    const allowed = new Set(['PENDING', 'SENDING', 'SUCCEEDED', 'FAILED'])
    if (status !== undefined && !allowed.has(status)) {
      reply.code(400)
      return fail('status 参数非法')
    }

    const events = await prisma.outboxEvent.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200
    })

    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OUTBOX_LIST',
      tool: 'outbox',
      request: { status: status || null },
      response: { count: events.length }
    })

    return ok(events)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OUTBOX_LIST',
      tool: 'outbox',
      request: { status: status || null },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`获取 Outbox 列表失败：${errMsg}`)
  }
})

fastify.post('/api/outbox/:id/retry', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const result = await OutboxManager.manualRetry(id)
    await writeApiAuditLog({
      traceId: result.traceId || traceId,
      actor,
      action: 'OUTBOX_RETRY_API',
      tool: 'outbox',
      request: { eventId: id },
      response: result
    })

    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OUTBOX_RETRY_API',
      tool: 'outbox',
      request: { eventId: id },
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`重试 Outbox 事件失败：${errMsg}`)
  }
})

fastify.post('/api/outbox/retry-due', async (_request, reply) => {
  const traceId = uuidv4()
  const actor = 'system'
  try {
    const stats = await OutboxManager.processRetries()
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OUTBOX_RETRY_DUE',
      tool: 'outbox',
      request: {},
      response: stats
    })
    return ok(stats)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await writeApiAuditLog({
      traceId,
      actor,
      action: 'OUTBOX_RETRY_DUE',
      tool: 'outbox',
      request: {},
      response: fail(errMsg)
    })
    reply.code(500)
    return fail(`批量重试到期 Outbox 事件失败：${errMsg}`)
  }
})

// ==================== Models ====================
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

// ==================== Config Drafts（本地草稿，不直接调用 OpenClaw） ====================
interface SaveConfigDraftBody {
  workspaceId: string
  category: string
  content: unknown
  createdBy?: string
}

fastify.get('/api/config-drafts', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId, category } = request.query as { workspaceId?: string; category?: string }
  try {
    const wid = (workspaceId || '').trim()
    if (!wid) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const row = await prisma.configDraft.findFirst({
      where: {
        workspaceId: wid,
        ...(category ? { category } : {})
      },
      orderBy: { updatedAt: 'desc' }
    })

    const parsed = row ? safeParseJson<unknown>(row.contentJson, {}) : null
    const response = row
      ? {
          ...row,
          content: parsed
        }
      : null

    await prisma.auditLog.create({
      data: {
        workspaceId: wid,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_GET',
        tool: 'config-drafts',
        request: JSON.stringify({ workspaceId: wid, category: category || null }),
        response: JSON.stringify({ found: Boolean(row) }),
        ts: new Date()
      }
    })

    return ok(response)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '获取配置草稿失败')
    reply.code(500)
    return fail(`获取配置草稿失败：${errMsg}`)
  }
})

fastify.post('/api/config-drafts', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as SaveConfigDraftBody
  try {
    const workspaceId = (body.workspaceId || '').trim()
    const category = (body.category || '').trim()
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!category) {
      reply.code(400)
      return fail('category 不能为空')
    }

    const sanitized = sanitizeDraftContent(body.content)
    const contentJson = JSON.stringify(sanitized)
    const contentHash = createHash('sha256').update(contentJson).digest('hex')
    const createdBy = (body.createdBy || actor).trim() || actor

    const existing = await prisma.configDraft.findFirst({
      where: { workspaceId, category },
      orderBy: { updatedAt: 'desc' }
    })

    const saved = existing
      ? await prisma.configDraft.update({
          where: { id: existing.id },
          data: {
            contentJson,
            contentHash,
            version: existing.version + 1,
            createdBy
          }
        })
      : await prisma.configDraft.create({
          data: {
            workspaceId,
            category,
            contentJson,
            contentHash,
            version: 1,
            createdBy
          }
        })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_SAVE',
        tool: 'config-drafts',
        request: JSON.stringify({ workspaceId, category, contentHash }),
        response: JSON.stringify({ draftId: saved.id, version: saved.version }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId,
      sourceType: 'CONFIG',
      sourceId: saved.id,
      eventType: 'CONFIG_DRAFT_SAVED',
      severity: 'INFO',
      title: '配置草稿已保存',
      summary: `已保存 ${category} 分类草稿，版本 ${saved.version}`,
      payload: {
        draftId: saved.id,
        category,
        version: saved.version,
        contentHash
      },
      traceId
    })

    return ok({ ...saved, content: sanitized })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '保存配置草稿失败')
    reply.code(500)
    return fail(`保存配置草稿失败：${errMsg}`)
  }
})

fastify.delete('/api/config-drafts/:id', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    const row = await prisma.configDraft.findUnique({ where: { id } })
    if (!row) {
      reply.code(404)
      return fail('配置草稿不存在')
    }

    await prisma.configDraft.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        workspaceId: row.workspaceId,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_RESET',
        tool: 'config-drafts',
        request: JSON.stringify({ draftId: id, category: row.category }),
        response: JSON.stringify({ deleted: true }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: row.workspaceId,
      sourceType: 'CONFIG',
      sourceId: row.id,
      eventType: 'CONFIG_DRAFT_RESET',
      severity: 'WARN',
      title: '配置草稿已重置',
      summary: `已删除 ${row.category} 分类草稿`,
      payload: {
        draftId: row.id,
        category: row.category,
        lastVersion: row.version
      },
      traceId
    })

    return ok({ deleted: true })
  } catch (error) {
    reply.code(500)
    return fail(`重置配置草稿失败：${toErrorMessage(error)}`)
  }
})

// ==================== Gateway ====================
fastify.post('/api/gateway/validate', async (request, reply) => {
  const traceId = uuidv4()
  try {
    const config = request.body as GatewayConfig
    const result = GatewayValidator.validate(config)
    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '校验网关配置失败')
    reply.code(500)
    return fail(`校验网关配置失败：${errMsg}`)
  }
})

// ==================== Backup ====================
fastify.post('/api/backup/export', async (request, reply) => {
  const traceId = uuidv4()
  const body = request.body as BackupExportBody
  try {
    // 兼容保留：确保本地 SQLite 路径解析逻辑仍被覆盖（避免死代码与后续回归）
    resolveSqliteDbPath()

    const workspaceId = (body.workspaceId || '').trim()
    const exportedBy = (body.exportedBy || '').trim()
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!exportedBy) {
      reply.code(400)
      return fail('exportedBy 不能为空')
    }

    const pack = await BackupManager.exportBackup(workspaceId, exportedBy, {
      includeChangeRequests: body.includeChangeRequests,
      includeSnapshots: body.includeSnapshots
    })

    await emitApiEvent({
      workspaceId,
      sourceType: 'BACKUP',
      sourceId: pack.metadata.hash,
      eventType: 'BACKUP_CREATED',
      severity: 'INFO',
      title: '备份包已创建',
      summary: `Workspace ${workspaceId} 备份导出完成`,
      payload: {
        workspaceId,
        exportedBy,
        exportedAt: pack.exportedAt,
        hash: pack.metadata.hash,
        itemCount: pack.metadata.itemCount
      },
      traceId
    })

    return ok(pack)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '导出备份包失败')
    reply.code(500)
    return fail(`导出备份失败：${errMsg}`)
  }
})

fastify.post('/api/backup/import', async (request, reply) => {
  const traceId = uuidv4()
  const body = request.body as BackupImportBody
  
  try {
    if (!body.backupPack) {
      reply.code(400)
      return fail('backupPack 不能为空')
    }
    const importedBy = (body.importedBy || '').trim()
    if (!importedBy) {
      reply.code(400)
      return fail('importedBy 不能为空')
    }

    const result = await BackupManager.importBackup(body.backupPack, importedBy, {
      createNewWorkspace: body.createNewWorkspace,
      targetWorkspaceId: body.targetWorkspaceId
    })

    const restoreWorkspaceId = result.workspaceId || body.targetWorkspaceId || body.backupPack.workspaceId
    await emitApiEvent({
      workspaceId: restoreWorkspaceId,
      sourceType: 'BACKUP',
      sourceId: body.backupPack.metadata.hash,
      eventType: 'RESTORE_COMPLETED',
      severity: result.success ? 'INFO' : 'ERROR',
      title: result.success ? '备份恢复完成' : '备份恢复失败',
      summary: result.success ? '备份包已成功导入' : '备份包导入失败',
      payload: {
        targetWorkspaceId: restoreWorkspaceId,
        importedBy,
        warnings: result.warnings,
        errors: result.errors,
        credentialsNeeded: result.credentialsNeeded
      },
      traceId
    })

    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '导入备份包失败')
    reply.code(500)
    return fail(`导入备份失败：${errMsg}`)
  }
})

fastify.get('/api/backup/history', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  const targetWorkspaceId = (workspaceId || '').trim()

  try {
    if (!targetWorkspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    return ok(await BackupManager.listBackups(targetWorkspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取备份历史失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/search', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { q, workspaceId } = request.query as { q?: string; workspaceId?: string }

  try {
    const query = (q || '').trim()
    if (!query) {
      reply.code(400)
      return fail('搜索关键词不能为空')
    }

    const scope = workspaceId ? { workspaceId } : {}

    const [tickets, approvals, auditLogs] = await Promise.all([
      prisma.ticket.findMany({
        where: {
          ...scope,
          OR: [
            { title: { contains: query } },
            { source: { contains: query } }
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          title: true,
          source: true,
          status: true,
          priority: true
        }
      }),
      prisma.approval.findMany({
        where: {
          ...(workspaceId
            ? {
                ticket: {
                  workspaceId
                }
              }
            : {}),
          OR: [
            { actionType: { contains: query } },
            { status: { contains: query } },
            { requestedBy: { contains: query } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          actionType: true,
          status: true,
          requestedBy: true,
          ticketId: true
        }
      }),
      prisma.auditLog.findMany({
        where: {
          ...scope,
          OR: [
            { traceId: { contains: query } },
            { actor: { contains: query } },
            { action: { contains: query } }
          ]
        },
        orderBy: { ts: 'desc' },
        take: 8,
        select: {
          id: true,
          traceId: true,
          actor: true,
          action: true,
          ts: true
        }
      })
    ])

    const result: GlobalSearchResponse = {
      query,
      tickets,
      approvals,
      auditLogs: auditLogs.map(item => ({
        ...item,
        ts: item.ts.toISOString()
      }))
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: workspaceId || '00000000-0000-0000-0000-000000000001',
        traceId,
        actor,
        action: 'GLOBAL_SEARCH',
        tool: 'search',
        request: JSON.stringify({ query, workspaceId: workspaceId || null }),
        response: JSON.stringify({
          tickets: result.tickets.length,
          approvals: result.approvals.length,
          auditLogs: result.auditLogs.length
        }),
        ts: new Date()
      }
    })

    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    reply.code(500)
    return fail(`搜索失败：${errMsg}`)
  }
})

// ==================== Doctor ====================
fastify.post('/api/doctor/run', async (request, reply) => {
  const traceId = uuidv4()
  const body = request.body as DoctorRunBody
  try {
    const workspaceId = (body.workspaceId || '').trim()
    const createdBy = (body.createdBy || '').trim()
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!createdBy) {
      reply.code(400)
      return fail('createdBy 不能为空')
    }

    const report = await DoctorService.runFullDiagnostic(workspaceId, createdBy)

    for (const finding of report.findings) {
      const check = await prisma.doctorCheck.create({
        data: {
          workspaceId,
          checkType: finding.category,
          status: diagnosticSeverityToAlertStatus(finding.severity),
          resultJson: JSON.stringify(finding),
          score: finding.severity === 'OK' ? 100 : finding.severity === 'WARNING' ? 70 : finding.severity === 'ERROR' ? 40 : 10,
          traceId
        }
      })

      if (finding.severity !== 'OK') {
        const dedupeKey = `${workspaceId}:${finding.category}:${finding.message}`
        const alertResult = await createOrUpdateAlert({
          workspaceId,
          sourceCheckId: check.id,
          severity: diagnosticSeverityToEventSeverity(finding.severity),
          title: `Doctor Alert · ${finding.category}`,
          summary: finding.message,
          dedupeKey,
          traceId
        })

        await emitApiEvent({
          workspaceId,
          sourceType: 'DOCTOR',
          sourceId: alertResult.alertId,
          eventType: 'DOCTOR_ALERT_RAISED',
          severity: diagnosticSeverityToEventSeverity(finding.severity),
          title: `Doctor Alert · ${finding.category}`,
          summary: finding.message,
          payload: {
            alertId: alertResult.alertId,
            sourceCheckId: check.id,
            recommendation: finding.recommendation,
            dedupeKey,
            created: alertResult.created
          },
          traceId
        })
      }
    }

    await emitApiEvent({
      workspaceId,
      sourceType: 'DOCTOR',
      sourceId: report.id,
      eventType: 'DOCTOR_REPORT_COMPLETED',
      severity: report.severity === 'CRITICAL' ? 'CRITICAL' : report.severity === 'ERROR' ? 'ERROR' : report.severity === 'WARNING' ? 'WARN' : 'INFO',
      title: 'Doctor 巡检已完成',
      summary: report.summary,
      payload: report,
      traceId
    })

    return ok(report)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '运行诊断失败')
    reply.code(500)
    return fail(`运行诊断失败：${errMsg}`)
  }
})

fastify.get('/api/alerts', async (request, reply) => {
  const { workspaceId, targetId, status, severity } = request.query as {
    workspaceId?: string
    targetId?: string
    status?: string
    severity?: string
  }

  try {
    const rows = await prisma.alert.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(targetId ? { targetId } : {}),
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {})
      },
      orderBy: { updatedAt: 'desc' }
    })
    return ok(rows)
  } catch (error) {
    reply.code(500)
    return fail(`获取 Alerts 失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/alerts/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const row = await prisma.alert.findUnique({ where: { id } })
    if (!row) {
      reply.code(404)
      return fail('Alert 不存在')
    }
    return ok(row)
  } catch (error) {
    reply.code(500)
    return fail(`获取 Alert 详情失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/alerts/:id/status', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }
  const body = request.body as UpdateAlertBody

  try {
    const existing = await prisma.alert.findUnique({ where: { id } })
    if (!existing) {
      reply.code(404)
      return fail('Alert 不存在')
    }

    const updated = await prisma.alert.update({
      where: { id },
      data: { status: body.status, traceId }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'ALERT_STATUS_UPDATED',
        tool: 'doctor-alerts',
        request: JSON.stringify({ alertId: id, status: body.status }),
        response: JSON.stringify({ alertId: updated.id }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: existing.workspaceId,
      targetId: existing.targetId || undefined,
      sourceType: 'DOCTOR',
      sourceId: updated.id,
      eventType: body.status === 'ACKED' ? 'ALERT_ACKED' : 'ALERT_RESOLVED',
      severity: body.status === 'ACKED' ? 'WARN' : 'INFO',
      title: body.status === 'ACKED' ? 'Alert 已确认' : 'Alert 已解决',
      summary: updated.title,
      payload: {
        alertId: updated.id,
        status: updated.status
      },
      traceId
    })

    return ok(updated)
  } catch (error) {
    reply.code(500)
    return fail(`更新 Alert 状态失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/alerts/:id/create-operation', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    const alert = await prisma.alert.findUnique({ where: { id } })
    if (!alert) {
      reply.code(404)
      return fail('Alert 不存在')
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: alert.workspaceId } })
    if (!workspace) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    if (workspace.isReadOnlyDefault && !unlocked) {
      reply.code(403)
      return fail('PROD Workspace 未解锁，不能生成修复 Operation')
    }

    const operation = await prisma.operation.create({
      data: {
        workspaceId: alert.workspaceId,
        targetId: alert.targetId || null,
        type: 'DOCTOR_FIX',
        status: 'PENDING',
        traceId,
        title: `修复 Alert：${alert.title}`,
        summary: alert.summary,
        phases: {
          create: [
            {
              name: 'Diagnose',
              orderNo: 1,
              status: 'PENDING',
              steps: {
                create: [
                  {
                    name: 'Review alert context',
                    stepType: 'PRECHECK',
                    status: 'PENDING',
                    requestJson: JSON.stringify({ alertId: alert.id, severity: alert.severity })
                  }
                ]
              }
            },
            {
              name: 'Apply Fix',
              orderNo: 2,
              status: 'PENDING',
              steps: {
                create: [
                  {
                    name: 'Apply corrective action',
                    stepType: 'CUSTOM',
                    status: 'PENDING',
                    requestJson: JSON.stringify({ alertId: alert.id })
                  }
                ]
              }
            },
            {
              name: 'Verify',
              orderNo: 3,
              status: 'PENDING',
              steps: {
                create: [
                  {
                    name: 'Run verification',
                    stepType: 'VERIFY',
                    status: 'PENDING',
                    requestJson: JSON.stringify({ alertId: alert.id })
                  }
                ]
              }
            }
          ]
        }
      },
      include: {
        phases: {
          include: { steps: true },
          orderBy: { orderNo: 'asc' }
        }
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: alert.workspaceId,
        traceId,
        actor,
        action: 'ALERT_OPERATION_CREATED',
        tool: 'doctor-alerts',
        request: JSON.stringify({ alertId: alert.id }),
        response: JSON.stringify({ operationId: operation.id }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: alert.workspaceId,
      targetId: alert.targetId || undefined,
      sourceType: 'DOCTOR',
      sourceId: operation.id,
      eventType: 'ALERT_OPERATION_CREATED',
      severity: 'WARN',
      title: '已从 Alert 生成修复 Operation',
      summary: alert.title,
      payload: {
        alertId: alert.id,
        operationId: operation.id
      },
      traceId
    })

    return ok(operation)
  } catch (error) {
    reply.code(500)
    return fail(`从 Alert 创建 Operation 失败：${toErrorMessage(error)}`)
  }
})

// ==================== Notification Policy Center ====================
fastify.get('/api/notification-policies', async (request, reply) => {
  const { workspaceId, enabled } = request.query as { workspaceId?: string; enabled?: string }

  try {
    const rows = await NotificationPolicyService.list({
      workspaceId,
      enabled: enabled === undefined ? undefined : enabled === 'true'
    })

    return ok(rows.map(row => ({
      ...row,
      eventFilters: safeParseJson(row.eventFilters, {}),
      targetFilters: safeParseJson(row.targetFilters, {}),
      deliveryTargets: safeParseJson(row.deliveryTargets, []),
      quietHours: safeParseJson(row.quietHoursJson, null)
    })))
  } catch (error) {
    reply.code(500)
    return fail(`获取通知策略失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/notification-policies', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as CreateNotificationPolicyBody

  try {
    if (!body.workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!body.name) {
      reply.code(400)
      return fail('name 不能为空')
    }
    if (!Array.isArray(body.deliveryTargets) || body.deliveryTargets.length === 0) {
      reply.code(400)
      return fail('deliveryTargets 不能为空')
    }

    const created = await prisma.notificationPolicy.create({
      data: {
        workspaceId: body.workspaceId,
        name: body.name,
        enabled: body.enabled ?? true,
        eventFilters: JSON.stringify(body.eventFilters || {}),
        targetFilters: JSON.stringify(body.targetFilters || {}),
        deliveryTargets: JSON.stringify(body.deliveryTargets),
        templateId: body.templateId || null,
        cooldownSeconds: body.cooldownSeconds ?? 300,
        dedupeWindowSeconds: body.dedupeWindowSeconds ?? 900,
        quietHoursJson: body.quietHours ? JSON.stringify(body.quietHours) : null
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'NOTIFICATION_POLICY_CREATED',
        tool: 'notification-policies',
        request: JSON.stringify({
          workspaceId: body.workspaceId,
          name: body.name,
          enabled: body.enabled ?? true
        }),
        response: JSON.stringify({ policyId: created.id }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: body.workspaceId,
      sourceType: 'SYSTEM',
      sourceId: created.id,
      eventType: 'NOTIFICATION_POLICY_CREATED',
      severity: 'INFO',
      title: '通知策略已创建',
      summary: body.name,
      payload: { policyId: created.id },
      traceId
    })

    return ok(created)
  } catch (error) {
    reply.code(500)
    return fail(`创建通知策略失败：${toErrorMessage(error)}`)
  }
})

fastify.put('/api/notification-policies/:id', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }
  const body = request.body as Partial<CreateNotificationPolicyBody>

  try {
    const existing = await prisma.notificationPolicy.findUnique({ where: { id } })
    if (!existing) {
      reply.code(404)
      return fail('通知策略不存在')
    }

    const updated = await prisma.notificationPolicy.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.eventFilters !== undefined ? { eventFilters: JSON.stringify(body.eventFilters) } : {}),
        ...(body.targetFilters !== undefined ? { targetFilters: JSON.stringify(body.targetFilters) } : {}),
        ...(body.deliveryTargets !== undefined ? { deliveryTargets: JSON.stringify(body.deliveryTargets) } : {}),
        ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
        ...(body.cooldownSeconds !== undefined ? { cooldownSeconds: body.cooldownSeconds } : {}),
        ...(body.dedupeWindowSeconds !== undefined ? { dedupeWindowSeconds: body.dedupeWindowSeconds } : {}),
        ...(body.quietHours !== undefined ? { quietHoursJson: body.quietHours ? JSON.stringify(body.quietHours) : null } : {})
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'NOTIFICATION_POLICY_UPDATED',
        tool: 'notification-policies',
        request: JSON.stringify({ policyId: id }),
        response: JSON.stringify({ policyId: updated.id }),
        ts: new Date()
      }
    })

    return ok(updated)
  } catch (error) {
    reply.code(500)
    return fail(`更新通知策略失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/notification-policies/:id/test', async (request, reply) => {
  const traceId = uuidv4()
  const { id } = request.params as { id: string }

  try {
    const policy = await prisma.notificationPolicy.findUnique({ where: { id } })
    if (!policy) {
      reply.code(404)
      return fail('通知策略不存在')
    }

    await triggerNotificationPolicies({
      workspaceId: policy.workspaceId,
      sourceType: 'SYSTEM',
      eventType: 'NOTIFICATION_POLICY_TEST',
      severity: 'INFO',
      title: '通知策略测试事件',
      summary: `策略 ${policy.name} 手动测试`,
      traceId,
      payload: { policyId: policy.id, manual: true }
    })

    return ok({ traceId, message: '已触发策略测试，请到 OutboundMessage/审批中心查看结果' })
  } catch (error) {
    reply.code(500)
    return fail(`测试通知策略失败：${toErrorMessage(error)}`)
  }
})

// ==================== Doctor Scheduler ====================
fastify.get('/api/doctor-schedules', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  try {
    const rows = await prisma.doctorSchedule.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {})
      },
      orderBy: { updatedAt: 'desc' }
    })
    return ok(rows.map(row => ({
      ...row,
      checkTypes: safeParseJson(row.checkTypesJson, [])
    })))
  } catch (error) {
    reply.code(500)
    return fail(`获取巡检调度配置失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/doctor-schedules', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as {
    workspaceId: string
    targetId?: string
    enabled?: boolean
    intervalMinutes?: number
    checkTypes?: string[]
  }

  try {
    if (!body.workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const created = await prisma.doctorSchedule.create({
      data: {
        workspaceId: body.workspaceId,
        targetId: body.targetId || null,
        enabled: body.enabled ?? true,
        intervalMinutes: body.intervalMinutes ?? 30,
        checkTypesJson: JSON.stringify(body.checkTypes || ['GATEWAY_HEALTH', 'WS_CONNECTIVITY', 'AUTH_STATUS', 'TRUSTED_PROXIES', 'HOOKS'])
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'DOCTOR_SCHEDULE_CREATED',
        tool: 'doctor-scheduler',
        request: JSON.stringify({ workspaceId: body.workspaceId, targetId: body.targetId || null }),
        response: JSON.stringify({ scheduleId: created.id }),
        ts: new Date()
      }
    })

    return ok(created)
  } catch (error) {
    reply.code(500)
    return fail(`创建巡检调度配置失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/doctor-schedules/:id/run-now', async (request, reply) => {
  const traceId = uuidv4()
  const { id } = request.params as { id: string }

  try {
    const schedule = await prisma.doctorSchedule.findUnique({ where: { id } })
    if (!schedule) {
      reply.code(404)
      return fail('巡检调度配置不存在')
    }

    const report = await DoctorService.runFullDiagnostic(schedule.workspaceId, 'manual-scheduler')
    await prisma.doctorSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date() }
    })

    await emitApiEvent({
      workspaceId: schedule.workspaceId,
      targetId: schedule.targetId || undefined,
      sourceType: 'DOCTOR',
      sourceId: report.id,
      eventType: 'DOCTOR_SCHEDULE_MANUAL_RUN_COMPLETED',
      severity: diagnosticSeverityToEventSeverity(report.severity),
      title: '巡检调度手动执行完成',
      summary: report.summary,
      payload: {
        scheduleId: schedule.id,
        reportId: report.id
      },
      traceId
    })

    return ok({ scheduleId: schedule.id, report })
  } catch (error) {
    reply.code(500)
    return fail(`手动执行巡检失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/doctor/reports', async (request, reply) => {
  const traceId = uuidv4()
  const { workspaceId, limit } = request.query as { workspaceId?: string; limit?: string }
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

    const rows = await DoctorService.getReportHistory(wid, parsedLimit ?? 20)
    return ok(rows)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '获取诊断历史失败')
    reply.code(500)
    return fail(`获取诊断历史失败：${errMsg}`)
  }
})

fastify.get('/api/doctor/reports/:id', async (request, reply) => {
  const traceId = uuidv4()
  const { id } = request.params as { id: string }
  try {
    const reportId = (id || '').trim()
    if (!reportId) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const report = await DoctorService.getReport(reportId)
    if (!report) {
      reply.code(404)
      return fail('诊断报告不存在')
    }

    return ok(report)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    fastify.log.error({ traceId, err: errMsg }, '获取诊断报告详情失败')
    reply.code(500)
    return fail(`获取诊断报告详情失败：${errMsg}`)
  }
})

// ==================== Operations Runtime Center ====================
fastify.get('/api/operations', async (request, reply) => {
  const { workspaceId, targetId, status, type } = request.query as {
    workspaceId?: string
    targetId?: string
    status?: string
    type?: string
  }

  try {
    const rows = await prisma.operation.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(targetId ? { targetId } : {}),
        ...(status ? { status } : {}),
        ...(type ? { type } : {})
      },
      include: {
        phases: {
          include: { steps: true },
          orderBy: { orderNo: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return ok(rows)
  } catch (error) {
    reply.code(500)
    return fail(`获取操作列表失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/operations/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const row = await prisma.operation.findUnique({
      where: { id },
      include: {
        phases: {
          include: { steps: true },
          orderBy: { orderNo: 'asc' }
        }
      }
    })

    if (!row) {
      reply.code(404)
      return fail('操作不存在')
    }

    return ok(row)
  } catch (error) {
    reply.code(500)
    return fail(`获取操作详情失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/operations', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const body = request.body as CreateOperationBody

  try {
    if (!body.workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!body.type) {
      reply.code(400)
      return fail('type 不能为空')
    }
    if (!Array.isArray(body.phases) || body.phases.length === 0) {
      reply.code(400)
      return fail('phases 不能为空')
    }

    const created = await prisma.operation.create({
      data: {
        workspaceId: body.workspaceId,
        targetId: body.targetId || null,
        type: body.type,
        status: 'PENDING',
        traceId,
        title: body.title || `${body.type} 操作`,
        summary: body.summary || '',
        phases: {
          create: body.phases.map((phase, phaseIndex) => ({
            name: phase.name,
            orderNo: phaseIndex + 1,
            status: 'PENDING',
            steps: {
              create: phase.steps.map(step => ({
                name: step.name,
                stepType: step.stepType,
                status: 'PENDING',
                requestJson: JSON.stringify(step.requestJson || {})
              }))
            }
          }))
        }
      },
      include: {
        phases: {
          include: { steps: true },
          orderBy: { orderNo: 'asc' }
        }
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_CREATED',
        tool: 'operations',
        request: JSON.stringify({
          workspaceId: body.workspaceId,
          targetId: body.targetId || null,
          type: body.type,
          title: body.title || null
        }),
        response: JSON.stringify({ operationId: created.id }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: body.workspaceId,
      targetId: body.targetId,
      sourceType: 'SYSTEM',
      sourceId: created.id,
      eventType: 'OPERATION_CREATED',
      severity: 'INFO',
      title: created.title || '操作已创建',
      summary: created.summary || `${body.type} 操作已建立阶段结构`,
      payload: {
        operationId: created.id,
        phaseCount: created.phases.length,
        type: created.type
      },
      traceId
    })

    return ok(created)
  } catch (error) {
    reply.code(500)
    return fail(`创建操作失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/operations/:id/start', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    const existing = await prisma.operation.findUnique({
      where: { id },
      include: { phases: { include: { steps: true }, orderBy: { orderNo: 'asc' } } }
    })
    if (!existing) {
      reply.code(404)
      return fail('操作不存在')
    }

    await prisma.operation.update({
      where: { id },
      data: { status: 'RUNNING' }
    })

    const firstPhase = existing.phases[0]
    if (firstPhase) {
      await prisma.operationPhase.update({
        where: { id: firstPhase.id },
        data: { status: 'RUNNING', startedAt: new Date() }
      })
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_STARTED',
        tool: 'operations',
        request: JSON.stringify({ operationId: id }),
        response: JSON.stringify({ status: 'RUNNING' }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: existing.workspaceId,
      targetId: existing.targetId || undefined,
      sourceType: 'SYSTEM',
      sourceId: existing.id,
      eventType: 'OPERATION_STARTED',
      severity: 'INFO',
      title: '操作已启动',
      summary: `${existing.title || existing.type} 已进入执行态`,
      payload: { operationId: existing.id },
      traceId
    })

    return ok({ status: 'RUNNING' })
  } catch (error) {
    reply.code(500)
    return fail(`启动操作失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/operation-steps/:id/update', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }
  const body = request.body as UpdateOperationStepBody

  try {
    const step = await prisma.operationStep.findUnique({
      where: { id },
      include: { phase: { include: { operation: true } } }
    })
    if (!step) {
      reply.code(404)
      return fail('操作步骤不存在')
    }

    await prisma.operationStep.update({
      where: { id },
      data: {
        status: body.status,
        resultJson: body.resultJson ? JSON.stringify(body.resultJson) : undefined,
        logs: body.logs,
        deploymentJobId: body.deploymentJobId,
        changeRequestId: body.changeRequestId,
        alertId: body.alertId,
        startedAt: body.status === 'RUNNING' && !step.startedAt ? new Date() : step.startedAt,
        endedAt: body.status === 'SUCCEEDED' || body.status === 'FAILED' || body.status === 'SKIPPED' ? new Date() : null
      }
    })

    await recomputeOperationState(step.phase.operation.id)

    await prisma.auditLog.create({
      data: {
        workspaceId: step.phase.operation.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_STEP_UPDATED',
        tool: 'operations',
        request: JSON.stringify({ operationStepId: id, status: body.status }),
        response: JSON.stringify({ operationId: step.phase.operation.id }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: step.phase.operation.workspaceId,
      targetId: step.phase.operation.targetId || undefined,
      sourceType: 'SYSTEM',
      sourceId: step.phase.operation.id,
      eventType: body.status === 'FAILED' ? 'OPERATION_STEP_FAILED' : 'OPERATION_STEP_UPDATED',
      severity: body.status === 'FAILED' ? 'ERROR' : body.status === 'RUNNING' ? 'WARN' : 'INFO',
      title: `步骤状态更新：${step.name}`,
      summary: `${step.name} → ${body.status}`,
      payload: {
        operationId: step.phase.operation.id,
        stepId: step.id,
        status: body.status,
        deploymentJobId: body.deploymentJobId,
        changeRequestId: body.changeRequestId,
        alertId: body.alertId
      },
      traceId
    })

    return ok({ updated: true })
  } catch (error) {
    reply.code(500)
    return fail(`更新操作步骤失败：${toErrorMessage(error)}`)
  }
})

// ==================== Workspaces ====================
fastify.get('/api/workspaces', async () => {
  if (isE2ETestMode()) {
    return [
      {
        id: TEST_WORKSPACE_ID,
        name: TEST_WORKSPACE_NAME,
        description: '本地默认工作区',
        envType: 'DEV',
        profiles: [],
        policies: [],
        _count: { tickets: 0, jobs: 0 }
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Remote Workspace',
        description: '用于 E2E 的固定工作区',
        envType: 'STAGING',
        profiles: [],
        policies: [],
        _count: { tickets: 0, jobs: 0 }
      }
    ]
  }

  const workspaces = await prisma.workspace.findMany({
    include: {
      profiles: { include: { profile: true } },
      policies: true,
      _count: { select: { tickets: true, jobs: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
  return workspaces
})

fastify.get('/api/workspaces/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  if (isE2ETestMode()) {
    const workspaces = [
      {
        id: TEST_WORKSPACE_ID,
        name: TEST_WORKSPACE_NAME,
        description: '本地默认工作区',
        envType: 'DEV',
        isReadOnlyDefault: false,
        unlockUntil: null,
        profiles: [],
        policies: [],
        _count: { tickets: 0, jobs: 0, contacts: 0 }
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Remote Workspace',
        description: '用于 E2E 的固定工作区',
        envType: 'STAGING',
        isReadOnlyDefault: false,
        unlockUntil: null,
        profiles: [],
        policies: [],
        _count: { tickets: 0, jobs: 0, contacts: 0 }
      }
    ]

    const workspace = workspaces.find(item => item.id === id)
    if (!workspace) {
      reply.code(404)
      return { error: 'Workspace not found' }
    }

    return workspace
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      profiles: { include: { profile: true } },
      policies: true,
      _count: { select: { tickets: true, jobs: true, contacts: true } }
    }
  })
  
  if (!workspace) {
    reply.code(404)
    return { error: 'Workspace not found' }
  }
  
  return workspace
})

fastify.post('/api/workspaces', async (request) => {
  const { name, description } = request.body as { name: string; description?: string }
  
  const workspace = await prisma.workspace.create({
    data: {
      name,
      description: description || '',
      policies: {
        create: {
          policyJson: JSON.stringify({
            tools_policy: { deny: ['deploy', 'delete_database', 'execute_shell'] },
            comms_policy: { allowed_targets: [] },
            config_policy: { allowed_paths: ['models.*', 'hooks.enabled', 'tools.allow'] },
            approval_policy: { required_actions: [] }
          }),
          version: 1
        }
      }
    },
    include: { policies: true }
  })
  
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      traceId: uuidv4(),
      actor: 'admin',
      action: 'WORKSPACE_CREATED',
      request: JSON.stringify({ name, description }),
      response: JSON.stringify({ id: workspace.id })
    }
  })
  
  return workspace
})

fastify.patch('/api/workspaces/:id', async (request) => {
  const { id } = request.params as { id: string }
  const { name, description } = request.body as { name?: string; description?: string }
  
  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name, description }
  })
  
  await prisma.auditLog.create({
    data: {
      workspaceId: id,
      traceId: uuidv4(),
      actor: 'admin',
      action: 'WORKSPACE_UPDATED',
      request: JSON.stringify({ name, description }),
      response: JSON.stringify({ id })
    }
  })
  
  return workspace
})

fastify.delete('/api/workspaces/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  
  const approvalResult = await ApprovalGuard.executeProtected(
    'EXPORT_DATA',
    { workspaceId: id },
    'admin',
    async () => {
      await prisma.workspace.delete({ where: { id } })
      return { deleted: true }
    }
  )
  
  if (approvalResult.needsApproval) {
    reply.code(202)
    return { message: 'Approval required', approvalId: approvalResult.approvalId }
  }
  
  return approvalResult.result
})

fastify.post('/api/workspaces/:id/profiles', async (request) => {
  const { id } = request.params as { id: string }
  const { profileId, isDefault } = request.body as { profileId: string; isDefault?: boolean }
  
  if (isDefault) {
    await prisma.workspaceProfile.updateMany({
      where: { workspaceId: id },
      data: { isDefault: false }
    })
  }
  
  const workspaceProfile = await prisma.workspaceProfile.create({
    data: {
      workspaceId: id,
      profileId,
      isDefault: isDefault || false
    },
    include: { profile: true }
  })
  
  return workspaceProfile
})

fastify.get('/api/workspaces/:id/export', async (request, reply) => {
  const { id } = request.params as { id: string }
  
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      profiles: { include: { profile: true } },
      policies: true,
      tickets: { include: { artifacts: true } },
      contacts: { include: { contactTargets: true } },
      commsTargets: true
    }
  })
  
  if (!workspace) {
    reply.code(404)
    return { error: 'Workspace not found' }
  }
  
  const exportData = {
    ...workspace,
    profiles: workspace.profiles.map(p => ({
      ...p,
      profile: {
        ...p.profile,
        authMode: p.profile.authMode,
        baseUrl: p.profile.baseUrl,
        wsUrl: p.profile.wsUrl
      }
    })),
    _meta: {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      note: 'Credentials not included. Please re-enter tokens/passwords after import.'
    }
  }
  
  reply.header('Content-Type', 'application/json')
  reply.header('Content-Disposition', `attachment; filename="workspace-${workspace.name}-${Date.now()}.json"`)
  return exportData
})

fastify.post('/api/workspaces/import', async (request, reply) => {
  const importData = request.body as any
  
  if (!importData.name || !importData.id) {
    reply.code(400)
    return { error: 'Invalid import data' }
  }
  
  const existing = await prisma.workspace.findFirst({
    where: { name: importData.name }
  })
  
  if (existing) {
    reply.code(409)
    return { error: 'Workspace with this name already exists' }
  }
  
  const workspace = await prisma.workspace.create({
    data: {
      name: importData.name,
      description: importData.description || '',
      policies: {
        create: importData.policies?.map((p: any) => ({
          policyJson: p.policyJson,
          version: p.version || 1
        })) || []
      }
    }
  })
  
  return {
    workspace,
    message: 'Workspace imported successfully. Please configure connection profiles and re-enter credentials.'
  }
})



// ==================== Policies ====================
fastify.get('/api/policies', async (request) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  
  const policies = await prisma.workspacePolicy.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    include: { workspace: true },
    orderBy: { createdAt: 'desc' }
  })
  
  return policies
})

fastify.get('/api/policies/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const policy = await prisma.workspacePolicy.findUnique({
    where: { id },
    include: { workspace: true }
  })
  
  if (!policy) {
    reply.code(404)
    return { error: 'Policy not found' }
  }
  
  return policy
})

fastify.post('/api/policies', async (request, reply) => {
  const { workspaceId, policyJson } = request.body as { workspaceId: string; policyJson: string }
  
  try {
    JSON.parse(policyJson)
  } catch (e) {
    reply.code(400)
    return { error: 'Invalid JSON format' }
  }
  
  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_POLICY',
    { workspaceId, policyJson },
    'admin',
    async () => {
      const policy = await prisma.workspacePolicy.create({
        data: {
          workspaceId,
          policyJson,
          version: 1
        }
      })
      return policy
    }
  )
  
  if (approvalResult.needsApproval) {
    reply.code(202)
    return { message: 'Approval required', approvalId: approvalResult.approvalId }
  }
  
  return approvalResult.result
})

fastify.patch('/api/policies/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const { policyJson } = request.body as { policyJson: string }
  
  try {
    JSON.parse(policyJson)
  } catch (e) {
    reply.code(400)
    return { error: 'Invalid JSON format' }
  }
  
  const existing = await prisma.workspacePolicy.findUnique({ where: { id } })
  if (!existing) {
    reply.code(404)
    return { error: 'Policy not found' }
  }
  
  const approvalResult = await ApprovalGuard.executeProtected(
    'CHANGE_POLICY',
    { policyId: id, policyJson },
    'admin',
    async () => {
      const policy = await prisma.workspacePolicy.update({
        where: { id },
        data: {
          policyJson,
          version: existing.version + 1
        }
      })
      return policy
    }
  )
  
  if (approvalResult.needsApproval) {
    reply.code(202)
    return { message: 'Approval required', approvalId: approvalResult.approvalId }
  }
  
  return approvalResult.result
})

fastify.post('/api/policies/:id/validate', async (request) => {
  const { policyJson } = request.body as { policyJson: string }
  
  try {
    const parsed = JSON.parse(policyJson)
    
    const requiredKeys = ['tools_policy', 'comms_policy', 'config_policy', 'approval_policy']
    const missingKeys = requiredKeys.filter(k => !(k in parsed))
    
    if (missingKeys.length > 0) {
      return {
        valid: false,
        errors: [`Missing required keys: ${missingKeys.join(', ')}`]
      }
    }
    
    return { valid: true }
  } catch (e: any) {
    return {
      valid: false,
      errors: [e.message]
    }
  }
})

// ==================== Workspace Settings / Snapshots / Drift / Change Requests ====================
type WorkspaceEnvType = 'DEV' | 'STAGING' | 'PROD'
type UnlockDurationMinutes = 15 | 30 | 60

interface UpdateWorkspaceEnvTypeBody {
  envType: WorkspaceEnvType
  /** 可选：当审批通过后，携带 approvalId 再次调用以执行变更 */
  approvalId?: string
}

interface UpdateWorkspaceReadOnlyBody {
  isReadOnlyDefault: boolean
}

interface UnlockWorkspaceBody {
  durationMinutes: UnlockDurationMinutes
  /** 可选：当审批通过后，携带 approvalId 再次调用以执行解锁 */
  approvalId?: string
}

interface SaveDesiredSnapshotBody {
  config: unknown
}

interface CreateChangeRequestBody {
  diffId?: string
  type?: string
  title: string
  description: string
  /** 可选：直接提供 diffJson（当不基于 drift 创建时使用） */
  diffJson?: string
}

function isWorkspaceTemporarilyUnlocked(workspace: { unlockUntil: Date | null }): boolean {
  if (!workspace.unlockUntil) return false
  return workspace.unlockUntil.getTime() > Date.now()
}

fastify.put('/api/workspaces/:id/env-type', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id: workspaceId } = request.params as { id: string }
  const body = request.body as UpdateWorkspaceEnvTypeBody

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    const envType = body.envType
    if (envType !== 'DEV' && envType !== 'STAGING' && envType !== 'PROD') {
      reply.code(400)
      return fail('envType 仅允许 DEV / STAGING / PROD')
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    if (body.approvalId) {
      const approvalStatus = await ApprovalGuard.checkApproval(body.approvalId)
      if (approvalStatus !== 'APPROVED') {
        reply.code(202)
        await prisma.auditLog.create({
          data: {
            workspaceId,
            traceId,
            actor,
            action: 'WORKSPACE_ENV_CHANGE_PENDING',
            tool: 'workspace',
            approvalId: body.approvalId,
            request: JSON.stringify({ workspaceId, envType }),
            response: JSON.stringify({ status: approvalStatus }),
            ts: new Date()
          }
        })
        return { status: 'pending_approval', approvalId: body.approvalId, message: '环境类型变更需要审批' }
      }

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { envType }
      })

      await prisma.auditLog.create({
        data: {
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_ENV_CHANGED',
          tool: 'workspace',
          approvalId: body.approvalId,
          request: JSON.stringify({ workspaceId, envType }),
          response: JSON.stringify({ envType: updated.envType }),
          ts: new Date()
        }
      })

      return ok(updated)
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_WORKSPACE_ENV',
      { workspaceId, envType },
      actor,
      async () => {
        // 注意：需要审批的动作不会在此处执行（ApprovalGuard 会返回 needsApproval）
        return { workspaceId, envType }
      }
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      await prisma.auditLog.create({
        data: {
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_ENV_CHANGE_REQUESTED',
          tool: 'workspace',
          approvalId: approvalResult.approvalId,
          request: JSON.stringify({ workspaceId, envType }),
          response: JSON.stringify({ status: 'pending_approval' }),
          ts: new Date()
        }
      })
      return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '环境类型变更需要审批' }
    }

    // 理论上不会走到这里（CHANGE_WORKSPACE_ENV 属于高危动作）
    const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { envType } })
    return ok(updated)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ENV_CHANGE',
        tool: 'workspace',
        request: JSON.stringify({ workspaceId, envType: body?.envType || null }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`更新 Workspace 环境类型失败：${errMsg}`)
  }
})

fastify.put('/api/workspaces/:id/read-only', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id: workspaceId } = request.params as { id: string }
  const body = request.body as UpdateWorkspaceReadOnlyBody

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (typeof body.isReadOnlyDefault !== 'boolean') {
      reply.code(400)
      return fail('isReadOnlyDefault 必须为 boolean')
    }

    const existing = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!existing) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { isReadOnlyDefault: body.isReadOnlyDefault }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_READONLY_UPDATED',
        tool: 'workspace',
        request: JSON.stringify({ workspaceId, isReadOnlyDefault: body.isReadOnlyDefault }),
        response: JSON.stringify({ isReadOnlyDefault: updated.isReadOnlyDefault }),
        ts: new Date()
      }
    })

    return ok(updated)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_READONLY_UPDATED',
        tool: 'workspace',
        request: JSON.stringify({ workspaceId, isReadOnlyDefault: body?.isReadOnlyDefault ?? null }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`更新 Workspace 只读模式失败：${errMsg}`)
  }
})

fastify.post('/api/workspaces/:id/unlock', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id: workspaceId } = request.params as { id: string }
  const body = request.body as UnlockWorkspaceBody

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (body.durationMinutes !== 15 && body.durationMinutes !== 30 && body.durationMinutes !== 60) {
      reply.code(400)
      return fail('durationMinutes 仅允许 15 / 30 / 60')
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    const unlockUntil = new Date(Date.now() + body.durationMinutes * 60_000)

    if (body.approvalId) {
      const approvalStatus = await ApprovalGuard.checkApproval(body.approvalId)
      if (approvalStatus !== 'APPROVED') {
        reply.code(202)
        await prisma.auditLog.create({
          data: {
            workspaceId,
            traceId,
            actor,
            action: 'WORKSPACE_UNLOCK_PENDING',
            tool: 'workspace',
            approvalId: body.approvalId,
            request: JSON.stringify({ workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() }),
            response: JSON.stringify({ status: approvalStatus }),
            ts: new Date()
          }
        })
        return { status: 'pending_approval', approvalId: body.approvalId, message: '临时解锁需要审批' }
      }

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { unlockUntil }
      })

      await prisma.auditLog.create({
        data: {
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_UNLOCKED',
          tool: 'workspace',
          approvalId: body.approvalId,
          request: JSON.stringify({ workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() }),
          response: JSON.stringify({ unlockUntil: updated.unlockUntil?.toISOString() || null }),
          ts: new Date()
        }
      })

      return ok({ unlockUntil: updated.unlockUntil })
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'UNLOCK_WORKSPACE',
      { workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() },
      actor,
      async () => {
        // 注意：需要审批的动作不会在此处执行（ApprovalGuard 会返回 needsApproval）
        return { workspaceId, unlockUntil }
      }
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      await prisma.auditLog.create({
        data: {
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_UNLOCK_REQUESTED',
          tool: 'workspace',
          approvalId: approvalResult.approvalId,
          request: JSON.stringify({ workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() }),
          response: JSON.stringify({ status: 'pending_approval' }),
          ts: new Date()
        }
      })
      return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '临时解锁需要审批' }
    }

    // 理论上不会走到这里（UNLOCK_WORKSPACE 属于高危动作）
    return ok({ unlockUntil })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_UNLOCK',
        tool: 'workspace',
        request: JSON.stringify({ workspaceId, durationMinutes: body?.durationMinutes ?? null }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`Workspace 临时解锁失败：${errMsg}`)
  }
})

fastify.post('/api/workspaces/:workspaceId/snapshots/desired', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }
  const body = request.body as SaveDesiredSnapshotBody

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    const snapshotId = await ConfigManager.saveDesiredSnapshot(workspaceId, body.config, actor)

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DESIRED_SNAPSHOT_SAVED',
        tool: 'workspace-snapshot',
        snapshotId,
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify({ snapshotId }),
        ts: new Date()
      }
    })

    return ok({ snapshotId })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DESIRED_SNAPSHOT_SAVED',
        tool: 'workspace-snapshot',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`保存期望状态快照失败：${errMsg}`)
  }
})

fastify.post('/api/workspaces/:workspaceId/snapshots/actual', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    const { profileId, client } = await resolveWorkspaceOpenClawClient(workspaceId)
    const snapshot = await client.getConfigSnapshot(traceId)
    const snapshotId = await ConfigManager.syncActualSnapshot(workspaceId, snapshot.config, actor)

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ACTUAL_SNAPSHOT_SYNCED',
        tool: 'workspace-snapshot',
        snapshotId,
        request: JSON.stringify({ workspaceId, profileId }),
        response: JSON.stringify({ snapshotId, hash: snapshot.hash }),
        ts: new Date()
      }
    })

    return ok({ snapshotId, hash: snapshot.hash })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ACTUAL_SNAPSHOT_SYNCED',
        tool: 'workspace-snapshot',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`同步实际状态快照失败：${errMsg}`)
  }
})

fastify.get('/api/workspaces/:workspaceId/snapshots', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const rows = await prisma.workspaceSnapshot.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_SNAPSHOT_LIST',
        tool: 'workspace-snapshot',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify({ count: rows.length }),
        ts: new Date()
      }
    })

    return ok(rows)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_SNAPSHOT_LIST',
        tool: 'workspace-snapshot',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`获取快照列表失败：${errMsg}`)
  }
})

fastify.post('/api/workspaces/:workspaceId/drift/compute', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const result = await ConfigManager.computeDrift(workspaceId)

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_COMPUTE',
        tool: 'drift',
        diffId: result.diffId,
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(result),
        ts: new Date()
      }
    })

    return ok(result)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_COMPUTE',
        tool: 'drift',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`计算漂移失败：${errMsg}`)
  }
})

fastify.get('/api/workspaces/:workspaceId/drift/latest', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const latest = await ConfigManager.getLatestDrift(workspaceId)

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_LATEST',
        tool: 'drift',
        diffId: latest?.id,
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify({ found: Boolean(latest) }),
        ts: new Date()
      }
    })

    return ok(latest)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_LATEST',
        tool: 'drift',
        request: JSON.stringify({ workspaceId }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`获取最新漂移失败：${errMsg}`)
  }
})

fastify.post('/api/workspaces/:workspaceId/change-requests', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }
  const body = request.body as CreateChangeRequestBody

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
    if (!body.title || !body.title.trim()) {
      reply.code(400)
      return fail('title 不能为空')
    }
    if (body.description === undefined) {
      reply.code(400)
      return fail('description 不能为空')
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return fail('Workspace 不存在')
    }

    let changeRequestId: string
    if (body.diffId) {
      changeRequestId = await ConfigManager.createChangeRequestFromDrift(
        workspaceId,
        body.diffId,
        body.title.trim(),
        body.description,
        actor,
        traceId
      )
    } else {
      if (!body.diffJson) {
        reply.code(400)
        return fail('diffId 或 diffJson 必须提供其一')
      }
      // 校验 diffJson 可解析
      try {
        JSON.parse(body.diffJson)
      } catch {
        reply.code(400)
        return fail('diffJson 不是合法 JSON')
      }
      changeRequestId = (
        await prisma.changeRequest.create({
          data: {
            workspaceId,
            type: body.type || 'CONFIG',
            title: body.title.trim(),
            description: body.description,
            diffJson: body.diffJson,
            status: 'DRAFT',
            traceId,
            createdBy: actor
          }
        })
      ).id
    }

    const created = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_CREATE',
        tool: 'change-request',
        changeRequestId,
        diffId: body.diffId,
        request: JSON.stringify({ workspaceId, title: body.title, type: body.type || null, diffId: body.diffId || null }),
        response: JSON.stringify({ changeRequestId }),
        ts: new Date()
      }
    })

    if (created) {
      await emitApiEvent({
        workspaceId,
        sourceType: 'CHANGE_REQUEST',
        sourceId: created.id,
        eventType: 'CHANGE_REQUEST_CREATED',
        severity: 'INFO',
        title: '变更单已创建',
        summary: created.title,
        payload: {
          changeRequestId: created.id,
          type: created.type,
          status: created.status
        },
        traceId
      })
    }

    return ok(created)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_CREATE',
        tool: 'change-request',
        request: JSON.stringify({ workspaceId, title: body?.title || null, diffId: body?.diffId || null }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`创建变更单失败：${errMsg}`)
  }
})

fastify.get('/api/workspaces/:workspaceId/change-requests', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { workspaceId } = request.params as { workspaceId: string }
  const { status, type } = request.query as { status?: string; type?: string }

  try {
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }

    const rows = await prisma.changeRequest.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        ...(type ? { type } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_LIST',
        tool: 'change-request',
        request: JSON.stringify({ workspaceId, status: status || null, type: type || null }),
        response: JSON.stringify({ count: rows.length }),
        ts: new Date()
      }
    })

    return ok(rows)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_LIST',
        tool: 'change-request',
        request: JSON.stringify({ workspaceId, status: status || null, type: type || null }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`获取变更单列表失败：${errMsg}`)
  }
})

fastify.get('/api/change-requests/:id', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return fail('变更单不存在')
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: changeRequest.workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_GET',
        tool: 'change-request',
        changeRequestId: changeRequest.id,
        request: JSON.stringify({ id }),
        response: JSON.stringify({ changeRequestId: changeRequest.id }),
        ts: new Date()
      }
    })

    return ok(changeRequest)
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        traceId,
        actor,
        action: 'CHANGE_REQUEST_GET',
        tool: 'change-request',
        request: JSON.stringify({ id }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`获取变更单详情失败：${errMsg}`)
  }
})

fastify.post('/api/change-requests/:id/execute', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return fail('变更单不存在')
    }

    const workspace = changeRequest.workspace
    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    if (workspace.isReadOnlyDefault && !unlocked) {
      reply.code(403)
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_BLOCKED',
          tool: 'change-request',
          changeRequestId: changeRequest.id,
          request: JSON.stringify({ changeRequestId: changeRequest.id }),
          response: JSON.stringify(fail('Workspace 当前为只读模式，且未处于临时解锁窗口')),
          ts: new Date()
        }
      })
      return fail('Workspace 当前为只读模式，且未处于临时解锁窗口')
    }

    // 审批：若还没有 approvalId，则创建审批并返回 pending
    if (!changeRequest.approvalId) {
      const approvalResult = await ApprovalGuard.executeProtected(
        'CHANGE_CONFIG',
        { workspaceId: workspace.id, changeRequestId: changeRequest.id, action: 'execute' },
        actor,
        async () => {
          return { requested: true }
        }
      )

      if (approvalResult.needsApproval && approvalResult.approvalId) {
        await prisma.changeRequest.update({
          where: { id: changeRequest.id },
          data: { approvalId: approvalResult.approvalId, status: 'PENDING_APPROVAL' }
        })

        reply.code(202)
        await prisma.auditLog.create({
          data: {
            workspaceId: workspace.id,
            traceId,
            actor,
            action: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
            tool: 'change-request',
            approvalId: approvalResult.approvalId,
            changeRequestId: changeRequest.id,
            request: JSON.stringify({ changeRequestId: changeRequest.id }),
            response: JSON.stringify({ status: 'pending_approval', approvalId: approvalResult.approvalId }),
            ts: new Date()
          }
        })

        await emitApiEvent({
          workspaceId: workspace.id,
          sourceType: 'CHANGE_REQUEST',
          sourceId: changeRequest.id,
          eventType: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
          severity: 'WARN',
          title: '变更单等待审批',
          summary: `变更单 ${changeRequest.title} 已提交审批`,
          payload: {
            changeRequestId: changeRequest.id,
            approvalId: approvalResult.approvalId
          },
          traceId
        })

        return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '执行变更单需要审批' }
      }
    }

    if (!changeRequest.approvalId) {
      reply.code(500)
      return fail('缺少 approvalId，无法执行变更单')
    }

    const approvalStatus = await ApprovalGuard.checkApproval(changeRequest.approvalId)
    if (approvalStatus !== 'APPROVED') {
      reply.code(202)
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_PENDING',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          request: JSON.stringify({ changeRequestId: changeRequest.id }),
          response: JSON.stringify({ status: approvalStatus }),
          ts: new Date()
        }
      })
      return { status: 'pending_approval', approvalId: changeRequest.approvalId, message: '审批未通过，暂不可执行' }
    }

    // 进入 APPLYING
    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'APPLYING', traceId }
    })

    const { client, profileId } = await resolveWorkspaceOpenClawClient(workspace.id)

    let applyResult: unknown
    let snapshotId: string | null = null
    let driftResult: Awaited<ReturnType<typeof ConfigManager.computeDrift>> | null = null

    try {
      applyResult = await client.applyChangeRequest({
        id: changeRequest.id,
        diffJson: changeRequest.diffJson,
        traceId
      })

      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'APPLIED' }
      })

      // 自动同步实际快照 + 计算漂移
      const actual = await client.getConfigSnapshot(traceId)
      snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
      driftResult = await ConfigManager.computeDrift(workspace.id)

      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTED',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          snapshotId,
          diffId: driftResult?.diffId,
          request: JSON.stringify({ changeRequestId: changeRequest.id, profileId }),
          response: JSON.stringify({ applyResult, snapshotId, drift: driftResult }),
          ts: new Date()
        }
      })

      await emitApiEvent({
        workspaceId: workspace.id,
        sourceType: 'CHANGE_REQUEST',
        sourceId: changeRequest.id,
        eventType: 'CHANGE_REQUEST_APPLIED',
        severity: 'INFO',
        title: '变更单已执行',
        summary: `${changeRequest.title} 已成功应用`,
        payload: {
          changeRequestId: changeRequest.id,
          snapshotId,
          drift: driftResult
        },
        traceId
      })

      return ok({ status: 'APPLIED', applyResult, snapshotId, drift: driftResult })
    } catch (applyError) {
      const applyErrMsg = toErrorMessage(applyError)
      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'FAILED' }
      })

      // 尝试同步实际快照与漂移（不中断主错误返回）
      try {
        const actual = await client.getConfigSnapshot(traceId)
        snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
        driftResult = await ConfigManager.computeDrift(workspace.id)
      } catch (syncError) {
        fastify.log.error({ traceId, err: toErrorMessage(syncError) }, '执行失败后同步快照/漂移也失败')
      }

      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_FAILED',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          snapshotId: snapshotId || undefined,
          diffId: driftResult?.diffId,
          request: JSON.stringify({ changeRequestId: changeRequest.id, profileId }),
          response: JSON.stringify({ error: applyErrMsg, snapshotId, drift: driftResult }),
          ts: new Date()
        }
      })

      await emitApiEvent({
        workspaceId: workspace.id,
        sourceType: 'CHANGE_REQUEST',
        sourceId: changeRequest.id,
        eventType: 'CHANGE_REQUEST_FAILED',
        severity: 'ERROR',
        title: '变更单执行失败',
        summary: `${changeRequest.title} 执行失败`,
        payload: {
          changeRequestId: changeRequest.id,
          error: applyErrMsg,
          snapshotId,
          drift: driftResult
        },
        traceId
      })

      reply.code(500)
      return fail(`执行变更单失败：${applyErrMsg}`)
    }
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        traceId,
        actor,
        action: 'CHANGE_REQUEST_EXECUTE',
        tool: 'change-request',
        request: JSON.stringify({ id }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`执行变更单失败：${errMsg}`)
  }
})

fastify.post('/api/change-requests/:id/rollback', async (request, reply) => {
  const traceId = uuidv4()
  const actor = 'admin'
  const { id } = request.params as { id: string }

  try {
    if (!id) {
      reply.code(400)
      return fail('id 不能为空')
    }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return fail('变更单不存在')
    }

    const workspace = changeRequest.workspace
    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    if (workspace.isReadOnlyDefault && !unlocked) {
      reply.code(403)
      return fail('Workspace 当前为只读模式，且未处于临时解锁窗口')
    }

    // 回滚策略：回滚到最新 DESIRED 快照（作为期望状态）
    const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
      where: { workspaceId: workspace.id, kind: 'DESIRED' },
      orderBy: { createdAt: 'desc' }
    })
    if (!desiredSnapshot) {
      reply.code(400)
      return fail('缺少 DESIRED 快照，无法回滚')
    }

    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'APPLYING', traceId }
    })

    const desiredConfig = JSON.parse(desiredSnapshot.contentJson) as unknown
    const { client, profileId } = await resolveWorkspaceOpenClawClient(workspace.id)

    const rollbackResult = await client.applyConfig(desiredConfig, traceId)
    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'ROLLED_BACK' }
    })

    const actual = await client.getConfigSnapshot(traceId)
    const snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
    const driftResult = await ConfigManager.computeDrift(workspace.id)

    await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_ROLLED_BACK',
        tool: 'change-request',
        changeRequestId: changeRequest.id,
        snapshotId,
        diffId: driftResult?.diffId,
        request: JSON.stringify({ changeRequestId: changeRequest.id, profileId, desiredSnapshotId: desiredSnapshot.id }),
        response: JSON.stringify({ rollbackResult, snapshotId, drift: driftResult }),
        ts: new Date()
      }
    })

    await emitApiEvent({
      workspaceId: workspace.id,
      sourceType: 'CHANGE_REQUEST',
      sourceId: changeRequest.id,
      eventType: 'CHANGE_REQUEST_ROLLED_BACK',
      severity: 'WARN',
      title: '变更单已回滚',
      summary: `${changeRequest.title} 已恢复到期望状态快照`,
      payload: {
        changeRequestId: changeRequest.id,
        desiredSnapshotId: desiredSnapshot.id,
        snapshotId,
        drift: driftResult
      },
      traceId
    })

    return ok({ status: 'ROLLED_BACK', rollbackResult, snapshotId, drift: driftResult })
  } catch (error) {
    const errMsg = toErrorMessage(error)
    await prisma.auditLog.create({
      data: {
        traceId,
        actor,
        action: 'CHANGE_REQUEST_ROLLBACK',
        tool: 'change-request',
        request: JSON.stringify({ id }),
        response: JSON.stringify(fail(errMsg)),
        ts: new Date()
      }
    })
    reply.code(500)
    return fail(`回滚变更单失败：${errMsg}`)
  }
})

// ==================== Deployment Management ====================

interface CreateDeploymentTargetBody {
  workspaceId: string
  name: string
  targetType: 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
  connectionMode: 'LOCAL' | 'SSH' | 'TAILSCALE' | 'DIRECT_WS' | 'REVERSE_PROXY'
  host?: string
  port?: number
  sshUser?: string
  sshPort?: number
  gatewayUrl?: string
  dockerEnabled?: boolean
  tailscaleEnabled?: boolean
  envType?: 'DEV' | 'STAGING' | 'PROD'
  metadata?: Record<string, unknown>
}

interface UpdateDeploymentTargetBody {
  name?: string
  host?: string
  port?: number
  sshUser?: string
  sshPort?: number
  gatewayUrl?: string
  dockerEnabled?: boolean
  tailscaleEnabled?: boolean
  envType?: 'DEV' | 'STAGING' | 'PROD'
  status?: string
  metadata?: Record<string, unknown>
}

interface CreateDeploymentJobBody {
  workspaceId: string
  targetId: string
  type: string
  requestJson: Record<string, unknown>
}

// 获取所有部署目标
fastify.get('/api/deployment-targets', async (request) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  const where = workspaceId ? { workspaceId } : {}
  return await prisma.deploymentTarget.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  })
})

// 创建部署目标
fastify.post('/api/deployment-targets', async (request) => {
  const body = request.body as CreateDeploymentTargetBody
  const traceId = uuidv4()
  const actor = 'admin'

  const target = await prisma.deploymentTarget.create({
    data: {
      workspaceId: body.workspaceId,
      name: body.name,
      targetType: body.targetType,
      connectionMode: body.connectionMode,
      host: body.host,
      port: body.port,
      sshUser: body.sshUser,
      sshPort: body.sshPort,
      gatewayUrl: body.gatewayUrl,
      dockerEnabled: body.dockerEnabled ?? false,
      tailscaleEnabled: body.tailscaleEnabled ?? false,
      envType: body.envType || 'DEV',
      metadata: JSON.stringify(body.metadata || {})
    }
  })

  await prisma.auditLog.create({
    data: {
      workspaceId: body.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_CREATE',
      tool: 'deployment',
      request: JSON.stringify(body),
      response: JSON.stringify(target),
      ts: new Date()
    }
  })

  await emitApiEvent({
    workspaceId: body.workspaceId,
    targetId: target.id,
    sourceType: 'DEPLOYMENT_JOB',
    sourceId: target.id,
    eventType: 'DEPLOYMENT_TARGET_CREATED',
    severity: 'INFO',
    title: '部署目标已创建',
    summary: `${target.name} 已加入运行态控制范围`,
    payload: target,
    traceId
  })

  return target
})

// 获取部署目标详情
fastify.get('/api/deployment-targets/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.deploymentTarget.findUnique({
    where: { id },
    include: {
      jobs: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  })
})

// 更新部署目标
fastify.put('/api/deployment-targets/:id', async (request) => {
  const { id } = request.params as { id: string }
  const body = request.body as UpdateDeploymentTargetBody
  const traceId = uuidv4()
  const actor = 'admin'

  const target = await prisma.deploymentTarget.update({
    where: { id },
    data: {
      ...body,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      updatedAt: new Date()
    }
  })

  await prisma.auditLog.create({
    data: {
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_UPDATE',
      tool: 'deployment',
      request: JSON.stringify({ id, ...body }),
      response: JSON.stringify(target),
      ts: new Date()
    }
  })

  return target
})

// 删除部署目标（需审批）
fastify.delete('/api/deployment-targets/:id', async (request) => {
  const { id } = request.params as { id: string }
  const traceId = uuidv4()
  const actor = 'admin'

  const target = await prisma.deploymentTarget.findUnique({ where: { id } })
  if (!target) {
    throw new Error('部署目标不存在')
  }

  // 检查是否需要审批
  const approvalResult = await ApprovalGuard.executeProtected(
    'DELETE_DEPLOYMENT',
    { targetId: id, targetName: target.name },
    actor,
    async () => {
      return await prisma.deploymentTarget.delete({ where: { id } })
    }
  )

  if (approvalResult.needsApproval) {
    return { status: 'pending_approval', approvalId: approvalResult.approvalId }
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_DELETE',
      tool: 'deployment',
      request: JSON.stringify({ id }),
      response: JSON.stringify(approvalResult.result),
      ts: new Date()
    }
  })

  return approvalResult.result
})

// 获取部署作业列表
fastify.get('/api/deployment-jobs', async (request) => {
  const { workspaceId, targetId } = request.query as { workspaceId?: string; targetId?: string }
  const where: any = {}
  if (workspaceId) where.workspaceId = workspaceId
  if (targetId) where.targetId = targetId

  return await prisma.deploymentJob.findMany({
    where,
    include: {
      target: true
    },
    orderBy: { createdAt: 'desc' }
  })
})

// 创建部署作业
fastify.post('/api/deployment-jobs', async (request) => {
  const body = request.body as CreateDeploymentJobBody
  const traceId = uuidv4()
  const actor = 'admin'

  const job = await prisma.deploymentJob.create({
    data: {
      workspaceId: body.workspaceId,
      targetId: body.targetId,
      type: body.type,
      traceId,
      requestJson: JSON.stringify(body.requestJson),
      status: 'PENDING'
    }
  })

  await prisma.auditLog.create({
    data: {
      workspaceId: body.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_JOB_CREATE',
      tool: 'deployment',
      request: JSON.stringify(body),
      response: JSON.stringify(job),
      ts: new Date()
    }
  })

  await emitApiEvent({
    workspaceId: body.workspaceId,
    targetId: body.targetId,
    sourceType: 'DEPLOYMENT_JOB',
    sourceId: job.id,
    eventType: 'DEPLOYMENT_STARTED',
    severity: 'INFO',
    title: '部署作业已创建',
    summary: `${body.type} 作业已进入队列`,
    payload: job,
    traceId
  })

  return job
})

// 获取部署作业详情
fastify.get('/api/deployment-jobs/:id', async (request) => {
  const { id } = request.params as { id: string }
  return await prisma.deploymentJob.findUnique({
    where: { id },
    include: {
      target: true
    }
  })
})

// 预检查
fastify.post('/api/deployment-targets/:id/precheck', async (request) => {
  const { id } = request.params as { id: string }
  const traceId = uuidv4()
  const actor = 'admin'

  const target = await prisma.deploymentTarget.findUnique({ where: { id } })
  if (!target) {
    throw new Error('部署目标不存在')
  }

  const { DeploymentTemplateFactory } = await import('./deployment-templates')
  const template = DeploymentTemplateFactory.getTemplate(target.targetType as any)

  const result = await template.precheck()

  await prisma.auditLog.create({
    data: {
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_PRECHECK',
      tool: 'deployment',
      request: JSON.stringify({ targetId: id }),
      response: JSON.stringify(result),
      ts: new Date()
    }
  })

  await emitApiEvent({
    workspaceId: target.workspaceId,
    targetId: target.id,
    sourceType: 'DEPLOYMENT_JOB',
    sourceId: target.id,
    eventType: 'DEPLOYMENT_PRECHECK_COMPLETED',
    severity: result.success ? 'INFO' : 'ERROR',
    title: '部署预检查完成',
    summary: result.success ? `${target.name} 预检查通过` : `${target.name} 预检查失败`,
    payload: result,
    traceId
  })

  return result
})

// 健康检查
fastify.get('/api/deployment-targets/:id/health', async (request) => {
  const { id } = request.params as { id: string }

  const target = await prisma.deploymentTarget.findUnique({ where: { id } })
  if (!target) {
    throw new Error('部署目标不存在')
  }

  const boundAgent = await prisma.hostAgent.findFirst({
    where: {
      workspaceId: target.workspaceId,
      targetId: target.id,
      status: 'ONLINE'
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (boundAgent) {
    const action = await HostAgentService.runActionAndWait({
      workspaceId: target.workspaceId,
      targetId: target.id,
      hostAgentId: boundAgent.id,
      actionType: 'VERIFY_HEALTH',
      request: { gatewayUrl: target.gatewayUrl || `http://127.0.0.1:${target.port || 18789}/health` },
      actor: 'admin',
      traceId: uuidv4(),
      timeoutSeconds: 30
    }, 30_000)

    if (action && action.status === 'SUCCEEDED') {
      const result = safeParseJson<Record<string, unknown>>(action.resultJson || '{}', {})
      const healthy = Boolean(result.healthy ?? false)
      await prisma.deploymentTarget.update({
        where: { id },
        data: {
          status: healthy ? 'HEALTHY' : 'DEGRADED',
          lastCheckAt: new Date()
        }
      })
      return result
    }
  }

  const { DeploymentTemplateFactory } = await import('./deployment-templates')
  const template = DeploymentTemplateFactory.getTemplate(target.targetType as any)

  // 准备 SSH 配置（如果需要）
  let sshConfig
  if (target.connectionMode === 'SSH' && target.host && target.sshUser) {
    sshConfig = {
      host: target.host,
      port: target.sshPort || 22,
      username: target.sshUser,
      authMode: 'password' as const,
      workspaceId: target.workspaceId,
      credentialKey: `deployment-target-${id}-ssh`
    }
  }

  const result = await template.healthCheck({
    port: target.port || undefined,
    sshConfig
  })

  // 更新目标状态
  await prisma.deploymentTarget.update({
    where: { id },
    data: {
      status: result.healthy ? 'HEALTHY' : 'UNHEALTHY',
      lastCheckAt: new Date()
    }
  })

  await emitApiEvent({
    workspaceId: target.workspaceId,
    targetId: target.id,
    sourceType: 'DEPLOYMENT_JOB',
    sourceId: target.id,
    eventType: result.healthy ? 'DEPLOYMENT_HEALTHY' : 'GATEWAY_UNREACHABLE',
    severity: result.healthy ? 'INFO' : 'ERROR',
    title: result.healthy ? '网关健康检查通过' : '网关不可达',
    summary: result.healthy ? `${target.name} 健康状态正常` : `${target.name} 健康检查失败`,
    payload: result
  })

  return result
})

// 获取日志
fastify.get('/api/deployment-targets/:id/logs', async (request) => {
  const { id } = request.params as { id: string }
  const { tail } = request.query as { tail?: string }

  const target = await prisma.deploymentTarget.findUnique({ where: { id } })
  if (!target) {
    throw new Error('部署目标不存在')
  }

  const boundAgent = await prisma.hostAgent.findFirst({
    where: {
      workspaceId: target.workspaceId,
      targetId: target.id,
      status: 'ONLINE'
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (boundAgent) {
    const action = await HostAgentService.runActionAndWait({
      workspaceId: target.workspaceId,
      targetId: target.id,
      hostAgentId: boundAgent.id,
      actionType: 'COLLECT_LOGS',
      request: {
        logPath: target.targetType.includes('DOCKER') ? '/var/log/openclaw/gateway.log' : '/var/log/openclaw/gateway.log',
        tail: tail ? Number.parseInt(tail, 10) : 100
      },
      actor: 'admin',
      traceId: uuidv4(),
      timeoutSeconds: 30
    }, 30_000)

    if (action && action.status === 'SUCCEEDED') {
      const result = safeParseJson<Record<string, unknown>>(action.resultJson || '{}', {})
      if (typeof result.logs === 'string') {
        return { logs: result.logs }
      }
    }
  }

  const { DeploymentTemplateFactory } = await import('./deployment-templates')
  const template = DeploymentTemplateFactory.getTemplate(target.targetType as any)

  let sshConfig
  if (target.connectionMode === 'SSH' && target.host && target.sshUser) {
    sshConfig = {
      host: target.host,
      port: target.sshPort || 22,
      username: target.sshUser,
      authMode: 'password' as const,
      workspaceId: target.workspaceId,
      credentialKey: `deployment-target-${id}-ssh`
    }
  }

  const logs = await template.getLogs({
    port: target.port || undefined,
    sshConfig,
    tail: tail ? parseInt(tail) : 100
  })

  return { logs }
})

// ==================== Host Agent / Remote Runner Center ====================
fastify.get('/api/host-agents', async (request, reply) => {
  const { workspaceId, targetId, status } = request.query as { workspaceId?: string; targetId?: string; status?: string }
  try {
    return ok(await HostAgentService.listHostAgents({ workspaceId, targetId, status }))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Host Agent 列表失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/host-agents/dashboard', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await HostAgentService.getDashboardStats(workspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Host Agent 仪表盘统计失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/host-agents/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    const agent = await HostAgentService.getHostAgent(id)
    if (!agent) {
      reply.code(404)
      return fail('Host Agent 不存在')
    }
    return ok(agent)
  } catch (error) {
    reply.code(500)
    return fail(`获取 Host Agent 详情失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/host-agents/:id/heartbeats', async (request, reply) => {
  const { id } = request.params as { id: string }
  const { limit } = request.query as { limit?: string }
  try {
    return ok(await HostAgentService.listAgentHeartbeats(id, limit ? Number.parseInt(limit, 10) : 50))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Host Agent 心跳失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/host-agents/:id/actions', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    return ok(await HostAgentService.listAgentActions({ hostAgentId: id }))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Host Agent 动作失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/agent-actions', async (request, reply) => {
  const { workspaceId, targetId, hostAgentId, actionType, status } = request.query as {
    workspaceId?: string
    targetId?: string
    hostAgentId?: string
    actionType?: string
    status?: string
  }

  try {
    return ok(await HostAgentService.listAgentActions({ workspaceId, targetId, hostAgentId, actionType, status }))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Agent Actions 失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/agent-actions/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const row = await prisma.agentAction.findUnique({
      where: { id },
      include: {
        hostAgent: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
        logs: { orderBy: { createdAt: 'asc' } }
      }
    })

    if (!row) {
      reply.code(404)
      return fail('Agent Action 不存在')
    }

    return ok(row)
  } catch (error) {
    reply.code(500)
    return fail(`获取 Agent Action 详情失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/agent-logs', async (request, reply) => {
  const { workspaceId, hostAgentId, actionId } = request.query as { workspaceId?: string; hostAgentId?: string; actionId?: string }
  try {
    return ok(await HostAgentService.listAgentLogs({ workspaceId, hostAgentId, actionId }))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Agent Logs 失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/bootstrap-tokens', async (request, reply) => {
  const body = request.body as CreateBootstrapTokenBody
  if (!body.workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    const result = await HostAgentService.createBootstrapRegistration(body)
    return ok({
      registrationId: result.registration.id,
      bootstrapToken: result.bootstrapToken,
      expiresAt: result.expiresAt,
      installCommand: [
        '$env:SOLOFORGE_SERVER_URL="http://<soloForge-host>:13789"',
        `$env:SOLOFORGE_BOOTSTRAP_TOKEN=\"${result.bootstrapToken}\"`,
        `$env:SOLOFORGE_AGENT_NAME=\"soloforge-host-agent\"`,
        'npx tsx src/host-agent/index.ts'
      ].join('; ')
    })
  } catch (error) {
    reply.code(500)
    return fail(`创建 bootstrap token 失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/register', async (request, reply) => {
  const body = request.body as RegisterHostAgentBody
  try {
    const result = await HostAgentService.registerAgent({
      ...body,
      lastSeenIp: request.ip
    })
    return ok(result)
  } catch (error) {
    reply.code(401)
    return fail(`Host Agent 注册失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/:id/heartbeat', async (request, reply) => {
  const { id } = request.params as { id: string }
  const token = getBearerToken(request.headers.authorization)
  if (!token) {
    reply.code(401)
    return fail('缺少 Bearer token')
  }

  const body = request.body as AgentHeartbeatInput
  try {
    return ok(await HostAgentService.recordHeartbeat(id, token, { ...body, lastSeenIp: request.ip }))
  } catch (error) {
    reply.code(401)
    return fail(`Host Agent 心跳失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/host-agents/:id/pull', async (request, reply) => {
  const { id } = request.params as { id: string }
  const token = getBearerToken(request.headers.authorization)
  if (!token) {
    reply.code(401)
    return fail('缺少 Bearer token')
  }

  try {
    return ok(await HostAgentService.pollNextAction(id, token))
  } catch (error) {
    reply.code(401)
    return fail(`拉取动作失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/:id/actions/:actionId/ack', async (request, reply) => {
  const { id, actionId } = request.params as { id: string; actionId: string }
  const token = getBearerToken(request.headers.authorization)
  if (!token) {
    reply.code(401)
    return fail('缺少 Bearer token')
  }

  try {
    return ok(await HostAgentService.acknowledgeAction(id, token, actionId))
  } catch (error) {
    reply.code(401)
    return fail(`动作 ACK 失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/:id/actions/:actionId/complete', async (request, reply) => {
  const { id, actionId } = request.params as { id: string; actionId: string }
  const token = getBearerToken(request.headers.authorization)
  if (!token) {
    reply.code(401)
    return fail('缺少 Bearer token')
  }

  const body = request.body as CompleteAgentActionInput
  try {
    return ok(await HostAgentService.completeAction(id, token, actionId, body))
  } catch (error) {
    reply.code(401)
    return fail(`动作完成回执失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/actions', async (request, reply) => {
  const body = request.body as CreateHostAgentActionBody
  if (!body.workspaceId || !body.targetId || !body.hostAgentId || !body.actionType) {
    reply.code(400)
    return fail('workspaceId/targetId/hostAgentId/actionType 不能为空')
  }

  try {
    return ok(await HostAgentService.createAction({
      workspaceId: body.workspaceId,
      targetId: body.targetId,
      hostAgentId: body.hostAgentId,
      actionType: body.actionType,
      request: body.request || {},
      actor: body.actor || 'admin',
      traceId: uuidv4(),
      timeoutSeconds: body.timeoutSeconds
    }))
  } catch (error) {
    reply.code(500)
    return fail(`创建 Agent Action 失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/:id/test-action', async (request, reply) => {
  const { id } = request.params as { id: string }
  const hostAgent = await prisma.hostAgent.findUnique({ where: { id } })
  if (!hostAgent || !hostAgent.targetId) {
    reply.code(404)
    return fail('Host Agent 未绑定 target，无法执行测试动作')
  }

  try {
    return ok(await HostAgentService.createAction({
      workspaceId: hostAgent.workspaceId,
      targetId: hostAgent.targetId,
      hostAgentId: hostAgent.id,
      actionType: 'VERIFY_HEALTH',
      request: { gatewayUrl: hostAgent.lastSeenIp ? undefined : null },
      actor: 'admin',
      traceId: uuidv4()
    }))
  } catch (error) {
    reply.code(500)
    return fail(`创建测试动作失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/host-agents/:id/revoke', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    return ok(await HostAgentService.revokeAgent(id, 'admin'))
  } catch (error) {
    reply.code(500)
    return fail(`吊销 Host Agent 失败：${toErrorMessage(error)}`)
  }
})

// ==================== Release & Upgrade Center ====================

fastify.get('/api/version-catalog', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listVersionCatalog(workspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取版本目录失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/version-catalog', async (request, reply) => {
  const body = request.body as CreateVersionCatalogBody
  try {
    if (!body.workspaceId || !body.component || !body.version || !body.releaseChannel || !body.source) {
      reply.code(400)
      return fail('workspaceId/component/version/releaseChannel/source 不能为空')
    }
    return ok(await ReleaseUpgradeService.createCatalogEntry(body))
  } catch (error) {
    reply.code(500)
    return fail(`创建版本目录失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/version-catalog/import', async (request, reply) => {
  const body = request.body as ImportVersionManifestBody
  try {
    if (!body.workspaceId || !Array.isArray(body.items) || body.items.length === 0) {
      reply.code(400)
      return fail('workspaceId 与 items 不能为空')
    }
    return ok(await ReleaseUpgradeService.importCatalogManifest(body.workspaceId, body.items.map(item => ({ ...item, workspaceId: body.workspaceId }))))
  } catch (error) {
    reply.code(500)
    return fail(`导入版本清单失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/installed-versions', async (request, reply) => {
  const { workspaceId, targetId } = request.query as { workspaceId?: string; targetId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listInstalledVersions(workspaceId, targetId))
  } catch (error) {
    reply.code(500)
    return fail(`获取已安装版本失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/installed-versions/detect', async (request, reply) => {
  const body = request.body as DetectInstalledVersionBody
  try {
    if (!body.workspaceId || !body.targetId) {
      reply.code(400)
      return fail('workspaceId 与 targetId 不能为空')
    }

    const target = await prisma.deploymentTarget.findFirst({
      where: { id: body.targetId, workspaceId: body.workspaceId }
    })
    if (target) {
      const boundAgent = await prisma.hostAgent.findFirst({
        where: {
          workspaceId: body.workspaceId,
          targetId: body.targetId,
          status: 'ONLINE'
        },
        orderBy: { updatedAt: 'desc' }
      })

      if (boundAgent) {
        const action = await HostAgentService.runActionAndWait({
          workspaceId: body.workspaceId,
          targetId: body.targetId,
          hostAgentId: boundAgent.id,
          actionType: 'DETECT_VERSION',
          request: {
            containerName: 'openclaw-gateway',
            gatewayUrl: target.gatewayUrl || `http://127.0.0.1:${target.port || 18789}/health`
          },
          actor: body.actor || 'admin',
          traceId: uuidv4(),
          timeoutSeconds: 30
        }, 30_000)

        if (action && action.status === 'SUCCEEDED') {
          const version = await prisma.installedVersion.findFirst({
            where: { workspaceId: body.workspaceId, targetId: body.targetId },
            orderBy: { detectedAt: 'desc' }
          })
          if (version) {
            return ok(version)
          }
        }
      }
    }

    return ok(await ReleaseUpgradeService.detectInstalledVersion(body.workspaceId, body.targetId, body.actor || 'admin'))
  } catch (error) {
    reply.code(500)
    return fail(`检测安装版本失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/upgrade-policies', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listPolicies(workspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取升级策略失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/upgrade-policies', async (request, reply) => {
  const body = request.body as UpsertUpgradePolicyBody
  try {
    if (!body.workspaceId || !body.name) {
      reply.code(400)
      return fail('workspaceId 与 name 不能为空')
    }
    return ok(await ReleaseUpgradeService.upsertPolicy(body))
  } catch (error) {
    reply.code(500)
    return fail(`保存升级策略失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/maintenance-windows', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listMaintenanceWindows(workspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取维护窗口失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/maintenance-windows', async (request, reply) => {
  const body = request.body as UpsertMaintenanceWindowBody
  try {
    if (!body.workspaceId || !body.name || !body.cronOrRule) {
      reply.code(400)
      return fail('workspaceId/name/cronOrRule 不能为空')
    }
    return ok(await ReleaseUpgradeService.upsertMaintenanceWindow(body))
  } catch (error) {
    reply.code(500)
    return fail(`保存维护窗口失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/upgrade-plans', async (request, reply) => {
  const { workspaceId, targetId, status, component } = request.query as { workspaceId?: string; targetId?: string; status?: string; component?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listUpgradePlans(workspaceId, targetId, status, component))
  } catch (error) {
    reply.code(500)
    return fail(`获取升级计划失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/upgrade-plans/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    const plan = await ReleaseUpgradeService.getUpgradePlan(id)
    if (!plan) {
      reply.code(404)
      return fail('升级计划不存在')
    }
    return ok(plan)
  } catch (error) {
    reply.code(500)
    return fail(`获取升级计划详情失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/upgrade-plans', async (request, reply) => {
  const body = request.body as CreateUpgradePlanBody
  try {
    if (!body.workspaceId || !body.targetId || !body.component || !body.targetVersion || !body.releaseChannel) {
      reply.code(400)
      return fail('workspaceId/targetId/component/targetVersion/releaseChannel 不能为空')
    }
    return ok(await ReleaseUpgradeService.createUpgradePlan(body, 'admin'))
  } catch (error) {
    reply.code(500)
    return fail(`创建升级计划失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/upgrade-plans/:id/dry-run', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = (request.body || {}) as ExecuteUpgradePlanBody
  try {
    return ok(await ReleaseUpgradeService.dryRunPlan(id, body.actor || 'admin'))
  } catch (error) {
    reply.code(500)
    return fail(`执行 Dry Run 失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/upgrade-plans/:id/execute', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = (request.body || {}) as ExecuteUpgradePlanBody
  try {
    const result = await ReleaseUpgradeService.executePlan({ planId: id, actor: body.actor || 'admin', approvalId: body.approvalId })
    if (result.status === 'pending_approval') {
      reply.code(202)
    }
    return ok(result)
  } catch (error) {
    reply.code(500)
    return fail(`执行升级失败：${toErrorMessage(error)}`)
  }
})

fastify.post('/api/upgrade-plans/:id/rollback', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = (request.body || {}) as ExecuteUpgradePlanBody
  try {
    const result = await ReleaseUpgradeService.rollbackPlan({ planId: id, actor: body.actor || 'admin', approvalId: body.approvalId })
    if (result.status === 'pending_approval') {
      reply.code(202)
    }
    return ok(result)
  } catch (error) {
    reply.code(500)
    return fail(`执行回滚失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/upgrade-runs', async (request, reply) => {
  const { workspaceId, targetId, status, component } = request.query as { workspaceId?: string; targetId?: string; status?: string; component?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.listUpgradeRuns(workspaceId, targetId, status, component))
  } catch (error) {
    reply.code(500)
    return fail(`获取升级运行记录失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/release-upgrade/dashboard', async (request, reply) => {
  const { workspaceId } = request.query as { workspaceId?: string }
  if (!workspaceId) {
    reply.code(400)
    return fail('workspaceId 不能为空')
  }

  try {
    return ok(await ReleaseUpgradeService.getDashboardStats(workspaceId))
  } catch (error) {
    reply.code(500)
    return fail(`获取升级中心仪表盘统计失败：${toErrorMessage(error)}`)
  }
})

fastify.get('/api/dashboard', async (request, reply) => {
  const { workspaceId, activityLimit, activitySeverity, activitySourceType, issueLimit } = request.query as {
    workspaceId?: string
    activityLimit?: string
    activitySeverity?: string
    activitySourceType?: string
    issueLimit?: string
  }

  try {
    if (isE2ETestMode()) {
      return ok(getTestDashboardResponse(workspaceId))
    }

    return ok(await DashboardService.getDashboard({
      workspaceId: workspaceId || undefined,
      activityLimit: activityLimit ? Number(activityLimit) : undefined,
      activitySeverity,
      activitySourceType,
      issueLimit: issueLimit ? Number(issueLimit) : undefined
    }))
  } catch (error) {
    reply.code(500)
    return fail(`获取 Dashboard 聚合数据失败：${toErrorMessage(error)}`)
  }
})


export async function startServer(): Promise<number> {
  try {
    // 开发模式使用固定端口，生产模式使用随机端口
    const DEV_PORT = 13789
    const isDev = !app.isPackaged
    if (isDev && !isE2ETestMode()) {
      await fastify.listen({ port: DEV_PORT, host: '127.0.0.1' })
      const actualPort = (fastify.server.address() as { port: number }).port
      console.log(`Local API server listening on port ${actualPort}`)
      return actualPort
    }

    const SAFE_PORT_CANDIDATES = [23119, 23120, 23121, 23122, 23123, 23124, 23125, 23126]
    for (const candidate of SAFE_PORT_CANDIDATES) {
      try {
        await fastify.listen({ port: candidate, host: '127.0.0.1' })
        console.log(`Local API server listening on port ${candidate}`)
        return candidate
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code !== 'EADDRINUSE') {
          throw error
        }
      }
    }

    throw new Error('无法为本地 API 服务器分配安全端口')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

export { fastify, prisma }
