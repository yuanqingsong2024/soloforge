import { PrismaClient } from '@prisma/client'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ApprovalGuard } from './approval-guard'
import { EventBusService } from './event-bus'
import { KeychainService } from './keychain'

const prisma = new PrismaClient()

export type HostAgentStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN' | 'UNREGISTERED'
export type HostAgentAuthMode = 'TOKEN' | 'MTLS' | 'BOOTSTRAP_SECRET'
export type AgentRegistrationStatus = 'PENDING' | 'ACTIVATED' | 'REVOKED' | 'EXPIRED'
export type AgentActionStatus = 'PENDING' | 'DISPATCHED' | 'ACKED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'CANCELED' | 'BLOCKED'
export type AgentActionType =
  | 'COLLECT_STATE'
  | 'COLLECT_LOGS'
  | 'RESTART_GATEWAY'
  | 'RESTART_CONTAINER'
  | 'DOCKER_COMPOSE_UP'
  | 'DOCKER_COMPOSE_RESTART'
  | 'BACKUP_OPENCLAW'
  | 'RESTORE_OPENCLAW'
  | 'APPLY_CONFIG_PATCH'
  | 'VERIFY_HEALTH'
  | 'DETECT_VERSION'
  | 'RUN_DOCTOR_CHECK'
  | 'CUSTOM_SAFE_ACTION'

export interface AgentCapabilities {
  collect_state: boolean
  collect_logs: boolean
  docker_control: boolean
  openclaw_backup: boolean
  openclaw_restore: boolean
  config_patch: boolean
  restart_gateway: boolean
  verify_health: boolean
  detect_version: boolean
  doctor_checks: boolean
  allowedComposeDirectories?: string[]
  allowedContainers?: string[]
  allowedLogPaths?: string[]
}

export interface ActionPolicy {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiresApproval: boolean
  requiresUnlock: boolean
  timeoutSeconds: number
  rollbackSupported: boolean
  allowedEnvs: Array<'DEV' | 'STAGING' | 'PROD'>
  capabilityKey:
    | 'collect_state'
    | 'collect_logs'
    | 'docker_control'
    | 'openclaw_backup'
    | 'openclaw_restore'
    | 'config_patch'
    | 'restart_gateway'
    | 'verify_health'
    | 'detect_version'
    | 'doctor_checks'
}

export interface CreateBootstrapRegistrationInput {
  workspaceId: string
  targetId?: string | null
  expiresInMinutes?: number
}

export interface RegisterHostAgentInput {
  bootstrapToken: string
  name: string
  hostname: string
  osType: string
  arch: string
  agentVersion: string
  capabilities: AgentCapabilities
  labels?: Record<string, string>
  lastSeenIp?: string | null
}

export interface AgentHeartbeatInput {
  status?: HostAgentStatus
  heartbeat: Record<string, unknown>
  capabilities?: Partial<AgentCapabilities>
  lastSeenIp?: string | null
}

export interface CreateAgentActionInput {
  workspaceId: string
  targetId: string
  hostAgentId: string
  actionType: AgentActionType
  request: Record<string, unknown>
  actor: string
  traceId: string
  timeoutSeconds?: number
}

export interface CompleteAgentActionInput {
  status: Extract<AgentActionStatus, 'SUCCEEDED' | 'FAILED' | 'CANCELED'>
  result?: Record<string, unknown>
  errorSummary?: string | null
  logs?: Array<{ level: string; message: string; data?: Record<string, unknown> }>
}

export interface AgentDispatchPayload {
  id: string
  workspaceId: string
  targetId: string
  actionType: AgentActionType
  request: Record<string, unknown>
  traceId: string
  timeoutSeconds: number
  policy: ActionPolicy
}

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_BOOTSTRAP_EXPIRES_MINUTES = 15
const HEARTBEAT_DEGRADED_SECONDS = 90
const HEARTBEAT_OFFLINE_SECONDS = 180

const ACTION_POLICIES: Record<AgentActionType, ActionPolicy> = {
  COLLECT_STATE: {
    riskLevel: 'LOW',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 45,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'collect_state'
  },
  COLLECT_LOGS: {
    riskLevel: 'LOW',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 45,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'collect_logs'
  },
  RESTART_GATEWAY: {
    riskLevel: 'HIGH',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 120,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'restart_gateway'
  },
  RESTART_CONTAINER: {
    riskLevel: 'HIGH',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 120,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'docker_control'
  },
  DOCKER_COMPOSE_UP: {
    riskLevel: 'HIGH',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 180,
    rollbackSupported: true,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'docker_control'
  },
  DOCKER_COMPOSE_RESTART: {
    riskLevel: 'HIGH',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 120,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'docker_control'
  },
  BACKUP_OPENCLAW: {
    riskLevel: 'MEDIUM',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 180,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'openclaw_backup'
  },
  RESTORE_OPENCLAW: {
    riskLevel: 'CRITICAL',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 300,
    rollbackSupported: true,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'openclaw_restore'
  },
  APPLY_CONFIG_PATCH: {
    riskLevel: 'CRITICAL',
    requiresApproval: true,
    requiresUnlock: true,
    timeoutSeconds: 180,
    rollbackSupported: true,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'config_patch'
  },
  VERIFY_HEALTH: {
    riskLevel: 'LOW',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 45,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'verify_health'
  },
  DETECT_VERSION: {
    riskLevel: 'LOW',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 45,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'detect_version'
  },
  RUN_DOCTOR_CHECK: {
    riskLevel: 'LOW',
    requiresApproval: false,
    requiresUnlock: false,
    timeoutSeconds: 60,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'doctor_checks'
  },
  CUSTOM_SAFE_ACTION: {
    riskLevel: 'MEDIUM',
    requiresApproval: true,
    requiresUnlock: false,
    timeoutSeconds: 90,
    rollbackSupported: false,
    allowedEnvs: ['DEV', 'STAGING', 'PROD'],
    capabilityKey: 'collect_state'
  }
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function generateToken(prefix: 'boot' | 'agent'): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function maskSensitiveObject(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(item => maskSensitiveObject(item))
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const masked: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) {
      const lower = key.toLowerCase()
      if (lower.includes('token') || lower.includes('password') || lower.includes('secret') || lower.includes('key')) {
        masked[key] = '***'
      } else {
        masked[key] = maskSensitiveObject(child)
      }
    }
    return masked
  }
  return value
}

function compareSecrets(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function isWorkspaceUnlocked(workspace: { envType: string; isReadOnlyDefault: boolean; unlockUntil: Date | null }): boolean {
  if (workspace.envType !== 'PROD') return true
  if (!workspace.isReadOnlyDefault) return true
  return Boolean(workspace.unlockUntil && workspace.unlockUntil.getTime() > Date.now())
}

function normalizeCapabilities(input: Partial<AgentCapabilities>): AgentCapabilities {
  return {
    collect_state: input.collect_state ?? false,
    collect_logs: input.collect_logs ?? false,
    docker_control: input.docker_control ?? false,
    openclaw_backup: input.openclaw_backup ?? false,
    openclaw_restore: input.openclaw_restore ?? false,
    config_patch: input.config_patch ?? false,
    restart_gateway: input.restart_gateway ?? false,
    verify_health: input.verify_health ?? false,
    detect_version: input.detect_version ?? false,
    doctor_checks: input.doctor_checks ?? false,
    allowedComposeDirectories: input.allowedComposeDirectories ?? [],
    allowedContainers: input.allowedContainers ?? [],
    allowedLogPaths: input.allowedLogPaths ?? []
  }
}

export class HostAgentService {
  private static monitorStarted = false

  static getActionPolicies(): Record<AgentActionType, ActionPolicy> {
    return ACTION_POLICIES
  }

  static async startHeartbeatMonitor(): Promise<void> {
    if (this.monitorStarted) return
    this.monitorStarted = true
    setInterval(() => {
      void this.refreshAgentStatuses()
    }, 30_000)
  }

  static async refreshAgentStatuses(): Promise<void> {
    const agents = await prisma.hostAgent.findMany({
      where: { status: { in: ['ONLINE', 'DEGRADED', 'UNKNOWN'] } }
    })

    const now = Date.now()
    for (const agent of agents) {
      const lastHeartbeatAt = agent.lastHeartbeatAt?.getTime() ?? 0
      const ageSeconds = lastHeartbeatAt > 0 ? Math.floor((now - lastHeartbeatAt) / 1000) : Number.MAX_SAFE_INTEGER
      const nextStatus: HostAgentStatus = ageSeconds >= HEARTBEAT_OFFLINE_SECONDS
        ? 'OFFLINE'
        : ageSeconds >= HEARTBEAT_DEGRADED_SECONDS
          ? 'DEGRADED'
          : 'ONLINE'

      if (nextStatus === agent.status) continue

      await prisma.hostAgent.update({
        where: { id: agent.id },
        data: { status: nextStatus }
      })

      await EventBusService.emit({
        workspaceId: agent.workspaceId,
        targetId: agent.targetId,
        sourceType: 'HOST_AGENT',
        sourceId: agent.id,
        eventType: nextStatus === 'OFFLINE' ? 'HOST_AGENT_OFFLINE' : 'HOST_AGENT_DEGRADED',
        severity: nextStatus === 'OFFLINE' ? 'ERROR' : 'WARN',
        title: nextStatus === 'OFFLINE' ? 'Host Agent 离线' : 'Host Agent 心跳降级',
        summary: `${agent.name} 心跳已超过阈值，状态变为 ${nextStatus}`,
        payload: {
          hostAgentId: agent.id,
          status: nextStatus,
          lastHeartbeatAt: agent.lastHeartbeatAt?.toISOString() ?? null,
          ageSeconds
        }
      })
    }
  }

  static async listHostAgents(filters: { workspaceId?: string; targetId?: string; status?: string } = {}) {
    return prisma.hostAgent.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.targetId ? { targetId: filters.targetId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      include: {
        target: true
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
    })
  }

  static async getHostAgent(id: string) {
    return prisma.hostAgent.findUnique({
      where: { id },
      include: {
        target: true,
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        heartbeats: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    })
  }

  static async getDashboardStats(workspaceId: string) {
    const [onlineAgents, degradedAgents, offlineAgents, failedActions, recentlyRegisteredAgents] = await Promise.all([
      prisma.hostAgent.count({ where: { workspaceId, status: 'ONLINE' } }),
      prisma.hostAgent.count({ where: { workspaceId, status: 'DEGRADED' } }),
      prisma.hostAgent.count({ where: { workspaceId, status: 'OFFLINE' } }),
      prisma.agentAction.count({ where: { workspaceId, status: { in: ['FAILED', 'TIMEOUT', 'BLOCKED'] } } }),
      prisma.hostAgent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 5 })
    ])

    return {
      onlineAgents,
      degradedAgents,
      offlineAgents,
      failedActions,
      heartbeatHealth: onlineAgents + degradedAgents + offlineAgents === 0
        ? 100
        : Math.round((onlineAgents / (onlineAgents + degradedAgents + offlineAgents)) * 100),
      recentlyRegisteredAgents
    }
  }

  static async listAgentHeartbeats(hostAgentId: string, limit = 50) {
    return prisma.agentHeartbeat.findMany({
      where: { hostAgentId },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  static async listAgentActions(filters: {
    workspaceId?: string
    targetId?: string
    hostAgentId?: string
    actionType?: string
    status?: string
  }) {
    return prisma.agentAction.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.targetId ? { targetId: filters.targetId } : {}),
        ...(filters.hostAgentId ? { hostAgentId: filters.hostAgentId } : {}),
        ...(filters.actionType ? { actionType: filters.actionType } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      include: {
        hostAgent: true,
        target: true,
        logs: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  static async listAgentLogs(filters: { hostAgentId?: string; actionId?: string; workspaceId?: string }) {
    return prisma.agentLog.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.hostAgentId ? { hostAgentId: filters.hostAgentId } : {}),
        ...(filters.actionId ? { actionId: filters.actionId } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    })
  }

  static async createBootstrapRegistration(input: CreateBootstrapRegistrationInput) {
    const workspaceId = input.workspaceId || DEFAULT_WORKSPACE_ID
    const bootstrapToken = generateToken('boot')
    const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? DEFAULT_BOOTSTRAP_EXPIRES_MINUTES) * 60 * 1000)
    const registration = await prisma.agentRegistration.create({
      data: {
        workspaceId,
        targetId: input.targetId || null,
        bootstrapTokenHash: hashSecret(bootstrapToken),
        status: 'PENDING',
        expiresAt
      }
    })

    await EventBusService.emit({
      workspaceId,
      targetId: input.targetId || null,
      sourceType: 'HOST_AGENT',
      sourceId: registration.id,
      eventType: 'HOST_AGENT_BOOTSTRAP_CREATED',
      severity: 'INFO',
      title: 'Host Agent 引导令牌已创建',
      summary: '已生成新的 Host Agent bootstrap token',
      payload: {
        registrationId: registration.id,
        expiresAt: expiresAt.toISOString(),
        targetId: input.targetId || null
      }
    })

    return {
      registration,
      bootstrapToken,
      expiresAt
    }
  }

  static async registerAgent(input: RegisterHostAgentInput) {
    const registration = await prisma.agentRegistration.findFirst({
      where: {
        bootstrapTokenHash: hashSecret(input.bootstrapToken),
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      }
    })

    if (!registration) {
      throw new Error('bootstrap token 无效、已过期或已被使用')
    }

    const existingAgent = registration.targetId
      ? await prisma.hostAgent.findFirst({ where: { workspaceId: registration.workspaceId, targetId: registration.targetId } })
      : await prisma.hostAgent.findFirst({ where: { workspaceId: registration.workspaceId, hostname: input.hostname } })

    const capabilities = normalizeCapabilities(input.capabilities)
    const labels = input.labels ?? {}

    const hostAgent = existingAgent
      ? await prisma.hostAgent.update({
          where: { id: existingAgent.id },
          data: {
            targetId: registration.targetId || existingAgent.targetId,
            name: input.name,
            hostname: input.hostname,
            osType: input.osType,
            arch: input.arch,
            agentVersion: input.agentVersion,
            status: 'ONLINE',
            lastHeartbeatAt: new Date(),
            lastSeenIp: input.lastSeenIp || null,
            authMode: 'TOKEN',
            capabilitiesJson: JSON.stringify(capabilities),
            labelsJson: JSON.stringify(labels)
          }
        })
      : await prisma.hostAgent.create({
          data: {
            workspaceId: registration.workspaceId,
            targetId: registration.targetId || null,
            name: input.name,
            hostname: input.hostname,
            osType: input.osType,
            arch: input.arch,
            agentVersion: input.agentVersion,
            status: 'ONLINE',
            lastHeartbeatAt: new Date(),
            lastSeenIp: input.lastSeenIp || null,
            authMode: 'TOKEN',
            capabilitiesJson: JSON.stringify(capabilities),
            labelsJson: JSON.stringify(labels)
          }
        })

    const authToken = generateToken('agent')
    await KeychainService.setPassword(registration.workspaceId, `host-agent-${hostAgent.id}-token`, authToken)

    await prisma.agentRegistration.update({
      where: { id: registration.id },
      data: {
        status: 'ACTIVATED',
        activatedAt: new Date()
      }
    })

    await prisma.agentHeartbeat.create({
      data: {
        workspaceId: registration.workspaceId,
        hostAgentId: hostAgent.id,
        targetId: registration.targetId || null,
        heartbeatJson: JSON.stringify({
          registeredAt: new Date().toISOString(),
          capabilities,
          labels
        })
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: registration.workspaceId,
        traceId: `host-agent-register-${hostAgent.id}`,
        actor: input.name,
        action: 'HOST_AGENT_REGISTER',
        tool: 'host-agent',
        request: JSON.stringify(maskSensitiveObject({
          registrationId: registration.id,
          hostname: input.hostname,
          osType: input.osType,
          arch: input.arch,
          agentVersion: input.agentVersion
        })),
        response: JSON.stringify({ hostAgentId: hostAgent.id, authMode: 'TOKEN' }),
        ts: new Date()
      }
    })

    await EventBusService.emit({
      workspaceId: registration.workspaceId,
      targetId: registration.targetId || null,
      sourceType: 'HOST_AGENT',
      sourceId: hostAgent.id,
      eventType: 'HOST_AGENT_REGISTERED',
      severity: 'INFO',
      title: 'Host Agent 注册成功',
      summary: `${hostAgent.name} 已完成注册并进入在线状态`,
      payload: {
        hostAgentId: hostAgent.id,
        registrationId: registration.id,
        capabilities,
        labels
      }
    })

    return {
      hostAgentId: hostAgent.id,
      workspaceId: registration.workspaceId,
      authToken,
      pollIntervalSeconds: 3,
      heartbeatIntervalSeconds: 30,
      capabilities
    }
  }

  static async authenticateAgent(hostAgentId: string, authToken: string) {
    const hostAgent = await prisma.hostAgent.findUnique({ where: { id: hostAgentId } })
    if (!hostAgent) {
      throw new Error('Host Agent 不存在')
    }

    const expectedToken = await KeychainService.getPassword(hostAgent.workspaceId, `host-agent-${hostAgentId}-token`)
    if (!expectedToken || !compareSecrets(expectedToken, authToken)) {
      throw new Error('Host Agent 鉴权失败')
    }

    return hostAgent
  }

  static async recordHeartbeat(hostAgentId: string, authToken: string, input: AgentHeartbeatInput) {
    const hostAgent = await this.authenticateAgent(hostAgentId, authToken)
    const mergedCapabilities = input.capabilities
      ? normalizeCapabilities({
          ...safeJsonParse<AgentCapabilities>(hostAgent.capabilitiesJson, normalizeCapabilities({})),
          ...input.capabilities
        })
      : safeJsonParse<AgentCapabilities>(hostAgent.capabilitiesJson, normalizeCapabilities({}))

    const nextStatus = input.status ?? 'ONLINE'

    await prisma.hostAgent.update({
      where: { id: hostAgentId },
      data: {
        status: nextStatus,
        lastHeartbeatAt: new Date(),
        lastSeenIp: input.lastSeenIp || null,
        capabilitiesJson: JSON.stringify(mergedCapabilities)
      }
    })

    const heartbeat = await prisma.agentHeartbeat.create({
      data: {
        workspaceId: hostAgent.workspaceId,
        hostAgentId,
        targetId: hostAgent.targetId,
        heartbeatJson: JSON.stringify(maskSensitiveObject(input.heartbeat))
      }
    })

    await EventBusService.emit({
      workspaceId: hostAgent.workspaceId,
      targetId: hostAgent.targetId,
      sourceType: 'HOST_AGENT',
      sourceId: hostAgentId,
      eventType: 'HOST_AGENT_HEARTBEAT',
      severity: nextStatus === 'ONLINE' ? 'INFO' : nextStatus === 'DEGRADED' ? 'WARN' : 'ERROR',
      title: 'Host Agent 心跳',
      summary: `${hostAgent.name} 上报心跳，当前状态 ${nextStatus}`,
      payload: {
        hostAgentId,
        status: nextStatus,
        heartbeatId: heartbeat.id
      }
    })

    return heartbeat
  }

  static async createAction(input: CreateAgentActionInput) {
    const hostAgent = await prisma.hostAgent.findUnique({
      where: { id: input.hostAgentId },
      include: { target: true }
    })

    if (!hostAgent) {
      throw new Error('Host Agent 不存在')
    }
    if (hostAgent.workspaceId !== input.workspaceId || hostAgent.targetId !== input.targetId) {
      throw new Error('Host Agent 与 workspace/target 作用域不匹配')
    }

    const policy = ACTION_POLICIES[input.actionType]
    const target = await prisma.deploymentTarget.findUnique({ where: { id: input.targetId } })
    if (!target || target.workspaceId !== input.workspaceId) {
      throw new Error('目标不存在')
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId } })
    if (!workspace) {
      throw new Error('Workspace 不存在')
    }

    const capabilities = normalizeCapabilities(safeJsonParse<AgentCapabilities>(hostAgent.capabilitiesJson, normalizeCapabilities({})))
    const capabilityEnabled = capabilities[policy.capabilityKey]
    if (!capabilityEnabled) {
      return this.createBlockedAction(input, policy, 'Agent 能力不匹配，禁止派发该动作')
    }

    if (!policy.allowedEnvs.includes(target.envType as 'DEV' | 'STAGING' | 'PROD')) {
      return this.createBlockedAction(input, policy, `当前环境 ${target.envType} 不允许执行该动作`)
    }

    if (workspace.envType === 'PROD' && policy.requiresUnlock && !isWorkspaceUnlocked(workspace)) {
      return this.createBlockedAction(input, policy, 'PROD workspace 未解锁，动作被阻止')
    }

    if (workspace.envType === 'PROD' && policy.requiresApproval) {
      const approvalAction = this.mapApprovalAction(input.actionType)
      const approvalResult = await ApprovalGuard.executeProtected(
        approvalAction,
        {
          hostAgentId: input.hostAgentId,
          targetId: input.targetId,
          actionType: input.actionType,
          traceId: input.traceId,
          request: maskSensitiveObject(input.request)
        },
        input.actor,
        async () => true
      )

      if (approvalResult.needsApproval) {
        return this.createBlockedAction(
          input,
          policy,
          `动作需要审批（approvalId: ${approvalResult.approvalId || 'unknown'}）`,
          approvalResult.approvalId || null
        )
      }
    }

    const action = await prisma.agentAction.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        hostAgentId: input.hostAgentId,
        actionType: input.actionType,
        requestJson: JSON.stringify(maskSensitiveObject(input.request)),
        status: 'PENDING',
        traceId: input.traceId,
        timeoutSeconds: input.timeoutSeconds ?? policy.timeoutSeconds
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        traceId: input.traceId,
        actor: input.actor,
        action: 'HOST_AGENT_ACTION_CREATED',
        tool: 'host-agent',
        request: JSON.stringify(maskSensitiveObject({
          targetId: input.targetId,
          hostAgentId: input.hostAgentId,
          actionType: input.actionType,
          request: input.request
        })),
        response: JSON.stringify({ agentActionId: action.id, status: action.status }),
        ts: new Date()
      }
    })

    await EventBusService.emit({
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      sourceType: 'HOST_AGENT',
      sourceId: action.id,
      eventType: 'HOST_AGENT_ACTION_CREATED',
      severity: policy.riskLevel === 'LOW' ? 'INFO' : 'WARN',
      title: 'Host Agent 动作已创建',
      summary: `${input.actionType} 已进入派发队列`,
      payload: {
        agentActionId: action.id,
        hostAgentId: input.hostAgentId,
        actionType: input.actionType
      },
      traceId: input.traceId
    })

    return action
  }

  static async pollNextAction(hostAgentId: string, authToken: string): Promise<AgentDispatchPayload | null> {
    await this.authenticateAgent(hostAgentId, authToken)
    await this.sweepTimedOutActions(hostAgentId)

    const action = await prisma.agentAction.findFirst({
      where: {
        hostAgentId,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'asc' }
    })

    if (!action) return null

    const updated = await prisma.agentAction.update({
      where: { id: action.id },
      data: { status: 'DISPATCHED' }
    })

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      targetId: updated.targetId,
      actionType: updated.actionType as AgentActionType,
      request: safeJsonParse<Record<string, unknown>>(updated.requestJson, {}),
      traceId: updated.traceId,
      timeoutSeconds: updated.timeoutSeconds,
      policy: ACTION_POLICIES[updated.actionType as AgentActionType]
    }
  }

  static async acknowledgeAction(hostAgentId: string, authToken: string, actionId: string) {
    await this.authenticateAgent(hostAgentId, authToken)
    const action = await prisma.agentAction.findFirst({
      where: { id: actionId, hostAgentId }
    })
    if (!action) {
      throw new Error('动作不存在')
    }
    return prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: 'ACKED',
        startedAt: action.startedAt || new Date()
      }
    })
  }

  static async completeAction(hostAgentId: string, authToken: string, actionId: string, input: CompleteAgentActionInput) {
    await this.authenticateAgent(hostAgentId, authToken)
    const action = await prisma.agentAction.findFirst({
      where: { id: actionId, hostAgentId },
      include: { hostAgent: true, target: true }
    })

    if (!action) {
      throw new Error('动作不存在')
    }

    const updated = await prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: input.status,
        startedAt: action.startedAt || new Date(),
        finishedAt: new Date(),
        resultJson: input.result ? JSON.stringify(maskSensitiveObject(input.result)) : null,
        errorSummary: input.errorSummary || null
      }
    })

    if (input.logs && input.logs.length > 0) {
      await prisma.agentLog.createMany({
        data: input.logs.map(log => ({
          workspaceId: action.workspaceId,
          hostAgentId,
          actionId,
          level: log.level,
          message: log.message,
          dataJson: JSON.stringify(maskSensitiveObject(log.data || {}))
        }))
      })
    }

    if (input.status === 'SUCCEEDED') {
      await this.applyActionSideEffects(updated)
    }

    const request = safeJsonParse<Record<string, unknown>>(action.requestJson, {})
    const deploymentJobId = typeof request.deploymentJobId === 'string' ? request.deploymentJobId : null
    if (deploymentJobId) {
      await prisma.deploymentJob.update({
        where: { id: deploymentJobId },
        data: {
          status: input.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
          resultJson: JSON.stringify(maskSensitiveObject({
            actionId: action.id,
            actionType: action.actionType,
            status: input.status,
            result: input.result || null,
            errorSummary: input.errorSummary || null
          })),
          lastError: input.status === 'SUCCEEDED' ? null : (input.errorSummary || 'Host Agent 安装动作失败')
        }
      })
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: action.workspaceId,
        traceId: action.traceId,
        actor: action.hostAgent.name,
        action: 'HOST_AGENT_ACTION_COMPLETED',
        tool: 'host-agent',
        request: JSON.stringify({ agentActionId: action.id, actionType: action.actionType }),
        response: JSON.stringify(maskSensitiveObject({
          status: input.status,
          errorSummary: input.errorSummary || null,
          result: input.result || null
        })),
        ts: new Date()
      }
    })

    await EventBusService.emit({
      workspaceId: action.workspaceId,
      targetId: action.targetId,
      sourceType: 'HOST_AGENT',
      sourceId: action.id,
      eventType: input.status === 'SUCCEEDED' ? 'HOST_AGENT_ACTION_SUCCEEDED' : 'HOST_AGENT_ACTION_FAILED',
      severity: input.status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
      title: input.status === 'SUCCEEDED' ? 'Host Agent 动作成功' : 'Host Agent 动作失败',
      summary: `${action.actionType} 执行${input.status === 'SUCCEEDED' ? '成功' : '失败'}`,
      payload: {
        agentActionId: action.id,
        status: input.status,
        errorSummary: input.errorSummary || null
      },
      traceId: action.traceId
    })

    return updated
  }

  static async runActionAndWait(input: CreateAgentActionInput, waitTimeoutMs?: number) {
    const action = await this.createAction(input)
    if ('status' in action && action.status === 'BLOCKED') {
      return action
    }

    const timeoutMs = waitTimeoutMs ?? (action.timeoutSeconds * 1000)
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const current = await prisma.agentAction.findUnique({ where: { id: action.id }, include: { logs: true } })
      if (!current) {
        throw new Error('动作不存在')
      }
      if (['SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELED', 'BLOCKED'].includes(current.status)) {
        return current
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    await prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'TIMEOUT',
        finishedAt: new Date(),
        errorSummary: '等待 Agent 回执超时'
      }
    })

    return prisma.agentAction.findUnique({ where: { id: action.id }, include: { logs: true } })
  }

  static async revokeAgent(hostAgentId: string, actor: string) {
    const hostAgent = await prisma.hostAgent.findUnique({ where: { id: hostAgentId } })
    if (!hostAgent) {
      throw new Error('Host Agent 不存在')
    }

    await KeychainService.deletePassword(hostAgent.workspaceId, `host-agent-${hostAgentId}-token`)
    await prisma.agentRegistration.updateMany({
      where: {
        workspaceId: hostAgent.workspaceId,
        targetId: hostAgent.targetId || undefined,
        status: { in: ['PENDING', 'ACTIVATED'] }
      },
      data: { status: 'REVOKED' }
    })

    const revoked = await prisma.hostAgent.update({
      where: { id: hostAgentId },
      data: {
        status: 'UNREGISTERED',
        authMode: 'BOOTSTRAP_SECRET'
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: hostAgent.workspaceId,
        traceId: `host-agent-revoke-${hostAgentId}`,
        actor,
        action: 'HOST_AGENT_REVOKE',
        tool: 'host-agent',
        request: JSON.stringify({ hostAgentId }),
        response: JSON.stringify({ status: revoked.status }),
        ts: new Date()
      }
    })

    await EventBusService.emit({
      workspaceId: hostAgent.workspaceId,
      targetId: hostAgent.targetId,
      sourceType: 'HOST_AGENT',
      sourceId: hostAgent.id,
      eventType: 'HOST_AGENT_REVOKED',
      severity: 'WARN',
      title: 'Host Agent 已吊销',
      summary: `${hostAgent.name} 的长期认证已失效`,
      payload: { hostAgentId: hostAgent.id }
    })

    return revoked
  }

  private static async createBlockedAction(
    input: CreateAgentActionInput,
    policy: ActionPolicy,
    reason: string,
    approvalId?: string | null
  ) {
    const action = await prisma.agentAction.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        hostAgentId: input.hostAgentId,
        actionType: input.actionType,
        requestJson: JSON.stringify(maskSensitiveObject({
          ...input.request,
          approvalId: approvalId || null,
          blockedReason: reason
        })),
        status: 'BLOCKED',
        traceId: input.traceId,
        timeoutSeconds: input.timeoutSeconds ?? policy.timeoutSeconds,
        finishedAt: new Date(),
        errorSummary: reason
      }
    })

    await EventBusService.emit({
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      sourceType: 'HOST_AGENT',
      sourceId: action.id,
      eventType: 'HOST_AGENT_ACTION_BLOCKED',
      severity: 'WARN',
      title: 'Host Agent 动作被阻止',
      summary: reason,
      payload: {
        agentActionId: action.id,
        approvalId: approvalId || null,
        actionType: input.actionType
      },
      traceId: input.traceId
    })

    return action
  }

  private static mapApprovalAction(actionType: AgentActionType) {
    switch (actionType) {
      case 'RESTORE_OPENCLAW':
        return 'RESTORE_DEPLOYMENT'
      case 'APPLY_CONFIG_PATCH':
        return 'CHANGE_CONFIG'
      case 'BACKUP_OPENCLAW':
        return 'BACKUP_DEPLOYMENT'
      default:
        return 'RESTART_SERVICE'
    }
  }

  private static async sweepTimedOutActions(hostAgentId: string) {
    const actions = await prisma.agentAction.findMany({
      where: {
        hostAgentId,
        status: { in: ['DISPATCHED', 'ACKED', 'RUNNING'] }
      }
    })

    for (const action of actions) {
      const startBase = action.startedAt ?? action.createdAt
      const expired = Date.now() - startBase.getTime() > action.timeoutSeconds * 1000
      if (!expired) continue

      await prisma.agentAction.update({
        where: { id: action.id },
        data: {
          status: 'TIMEOUT',
          finishedAt: new Date(),
          errorSummary: 'Agent 执行动作超时'
        }
      })
    }
  }

  private static async applyActionSideEffects(action: {
    id: string
    workspaceId: string
    targetId: string
    hostAgentId: string
    actionType: string
    traceId: string
    resultJson: string | null
  }) {
    const result = safeJsonParse<Record<string, unknown>>(action.resultJson, {})

    switch (action.actionType as AgentActionType) {
      case 'COLLECT_STATE': {
        await prisma.workspaceSnapshot.create({
          data: {
            workspaceId: action.workspaceId,
            kind: 'ACTUAL',
            source: 'REMOTE_SYNC',
            contentJson: JSON.stringify(maskSensitiveObject(result)),
            contentHash: hashSecret(JSON.stringify(maskSensitiveObject(result))),
            createdBy: `host-agent:${action.hostAgentId}`
          }
        })
        break
      }
      case 'VERIFY_HEALTH':
      case 'RUN_DOCTOR_CHECK': {
        const healthy = Boolean(result.healthy ?? result.ok ?? false)
        await prisma.doctorCheck.create({
          data: {
            workspaceId: action.workspaceId,
            targetId: action.targetId,
            checkType: action.actionType,
            status: healthy ? 'OK' : 'ERROR',
            resultJson: JSON.stringify(maskSensitiveObject(result)),
            score: healthy ? 100 : 30,
            traceId: action.traceId
          }
        })
        break
      }
      case 'DETECT_VERSION': {
        const target = await prisma.deploymentTarget.findUnique({ where: { id: action.targetId } })
        if (!target) break
        const component = typeof result.component === 'string'
          ? result.component
          : target.targetType.includes('DOCKER')
            ? 'DOCKER_IMAGE'
            : 'GATEWAY'
        const version = typeof result.version === 'string' ? result.version : 'unknown'
        await prisma.installedVersion.upsert({
          where: { targetId_component: { targetId: action.targetId, component } },
          update: {
            workspaceId: action.workspaceId,
            installedVersion: version,
            detectedAt: new Date(),
            source: 'HOST_AGENT',
            detailsJson: JSON.stringify(maskSensitiveObject(result))
          },
          create: {
            workspaceId: action.workspaceId,
            targetId: action.targetId,
            component,
            installedVersion: version,
            source: 'HOST_AGENT',
            detailsJson: JSON.stringify(maskSensitiveObject(result))
          }
        })
        break
      }
      default:
        break
    }
  }
}

export { prisma }
