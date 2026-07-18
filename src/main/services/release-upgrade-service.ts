import { v4 as uuidv4 } from 'uuid'
import { promisify } from 'node:util'
import { exec as execCallback } from 'node:child_process'
import { KeychainService } from './keychain'
import { OpenClawClient } from './openclaw-client'
import { ConfigManager } from './config-manager'
import { BackupManager } from './backup-manager'
import { ApprovalGuard } from './approval-guard'
import { EventBusService } from './event-bus'
import { DoctorService } from './doctor-service'
import { DeploymentTemplateFactory, type ServiceOptions, type UpgradeOptions } from './deployment-templates'
import { SSHExecutor, type SSHConfig } from './ssh-executor'
import { prisma } from './db'
import { writeAuditLog } from './audit-log-writer'
const execAsync = promisify(execCallback)

type TargetType = 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
type ComponentType = 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
type ReleaseChannel = 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type UpgradePlanStatus = 'DRAFT' | 'READY' | 'PENDING_APPROVAL' | 'APPROVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ROLLED_BACK' | 'CANCELED'

interface DeploymentTargetRecord {
  id: string
  workspaceId: string
  name: string
  targetType: string
  connectionMode: string
  host: string | null
  port: number | null
  sshUser: string | null
  sshPort: number | null
  gatewayUrl: string | null
  dockerEnabled: boolean
  tailscaleEnabled: boolean
  envType: string
  status: string
  metadata: string
}

interface TargetMetadata {
  workDir?: string
  projectName?: string
  dockerContainerName?: string
  dockerComposeProject?: string
  imageName?: string
  imageTag?: string
  versionCommand?: string
  upgradeCommand?: string
  rollbackCommand?: string
  stopCommand?: string
  startCommand?: string
  restartCommand?: string
  healthUrl?: string
  installMode?: 'docker' | 'native'
  compatibleComponents?: ComponentType[]
}

interface DryRunCheck {
  key: string
  passed: boolean
  blocking: boolean
  message: string
  details?: string
}

interface DryRunSummary {
  blocked: boolean
  requiresApproval: boolean
  requiresRestart: boolean
  rollbackSupported: boolean
  checks: DryRunCheck[]
}

interface PlanStep {
  name: string
  stepType: 'PRECHECK' | 'BACKUP' | 'WRITE_CONFIG' | 'START' | 'STOP' | 'RESTART' | 'VERIFY' | 'CLEANUP' | 'CUSTOM'
  requestJson: Record<string, unknown>
}

interface PlanPhase {
  name: string
  steps: PlanStep[]
}

interface PlanJson {
  precheck: Record<string, unknown>
  backup: Record<string, unknown>
  stopOrRollingAction: Record<string, unknown>
  installOrPull: Record<string, unknown>
  applyConfigIfNeeded: Record<string, unknown>
  restart: Record<string, unknown>
  verify: Record<string, unknown>
  rollbackPlan: Record<string, unknown>
  phases: PlanPhase[]
}

interface CreateUpgradePlanInput {
  workspaceId: string
  targetId: string
  policyId?: string | null
  component: ComponentType
  targetVersion: string
  releaseChannel: ReleaseChannel
}

interface ExecuteUpgradeInput {
  planId: string
  actor: string
  approvalId?: string
}

interface UpsertPolicyInput {
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

interface UpsertMaintenanceWindowInput {
  id?: string
  workspaceId: string
  name: string
  enabled?: boolean
  timezone?: string
  cronOrRule: string
  notes?: string
}

interface VersionCatalogInput {
  workspaceId: string
  component: ComponentType
  version: string
  releaseChannel: ReleaseChannel
  source: string
  metadataJson?: string
  releaseNotesSummary?: string
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function compareMaybeSemanticVersions(currentVersion: string, targetVersion: string): RiskLevel {
  const currentMatch = currentVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  const targetMatch = targetVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!currentMatch || !targetMatch) {
    return currentVersion === targetVersion ? 'LOW' : 'MEDIUM'
  }

  const [, currentMajor, currentMinor, currentPatch] = currentMatch
  const [, targetMajor, targetMinor, targetPatch] = targetMatch

  if (currentMajor !== targetMajor) return 'HIGH'
  if (currentMinor !== targetMinor) return 'MEDIUM'
  if (currentPatch !== targetPatch) return 'LOW'
  return 'LOW'
}

function isWorkspaceTemporarilyUnlocked(workspace: { unlockUntil: Date | null }): boolean {
  if (!workspace.unlockUntil) return false
  return workspace.unlockUntil.getTime() > Date.now()
}

function formatTargetImage(metadata: TargetMetadata, version: string): string {
  if (version.includes(':')) return version
  const imageName = metadata.imageName || 'openclaw/gateway'
  return `${imageName}:${version}`
}

function inferComponentForTarget(target: DeploymentTargetRecord): ComponentType {
  return target.targetType.includes('DOCKER') ? 'DOCKER_IMAGE' : 'GATEWAY'
}

function parseWeeklyRule(rule: string): { day: string; startMinutes: number; endMinutes: number } | null {
  const match = rule.match(/^weekly:([a-z]{3}):(\d{2}):(\d{2})-(\d{2}):(\d{2})$/i)
  if (!match) return null
  const [, day, startHour, startMinute, endHour, endMinute] = match
  return {
    day: day.toLowerCase(),
    startMinutes: Number(startHour) * 60 + Number(startMinute),
    endMinutes: Number(endHour) * 60 + Number(endMinute)
  }
}

function dayName(date: Date): string {
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return names[date.getDay()]
}

export class ReleaseUpgradeService {
  static async listVersionCatalog(workspaceId: string) {
    return prisma.versionCatalog.findMany({
      where: { workspaceId },
      orderBy: [{ component: 'asc' }, { createdAt: 'desc' }]
    })
  }

  static async createCatalogEntry(input: VersionCatalogInput) {
    return prisma.versionCatalog.create({
      data: {
        workspaceId: input.workspaceId,
        component: input.component,
        version: input.version,
        releaseChannel: input.releaseChannel,
        source: input.source,
        metadataJson: input.metadataJson || '{}',
        releaseNotesSummary: input.releaseNotesSummary || ''
      }
    })
  }

  static async importCatalogManifest(workspaceId: string, manifest: VersionCatalogInput[]) {
    const createdIds: string[] = []
    for (const item of manifest) {
      const row = await prisma.versionCatalog.upsert({
        where: {
          workspaceId_component_version_releaseChannel: {
            workspaceId,
            component: item.component,
            version: item.version,
            releaseChannel: item.releaseChannel
          }
        },
        update: {
          source: item.source,
          metadataJson: item.metadataJson || '{}',
          releaseNotesSummary: item.releaseNotesSummary || ''
        },
        create: {
          workspaceId,
          component: item.component,
          version: item.version,
          releaseChannel: item.releaseChannel,
          source: item.source,
          metadataJson: item.metadataJson || '{}',
          releaseNotesSummary: item.releaseNotesSummary || ''
        }
      })
      createdIds.push(row.id)
    }
    return { count: createdIds.length, ids: createdIds }
  }

  static async listInstalledVersions(workspaceId: string, targetId?: string) {
    return prisma.installedVersion.findMany({
      where: {
        workspaceId,
        ...(targetId ? { targetId } : {})
      },
      include: { target: true },
      orderBy: [{ detectedAt: 'desc' }]
    })
  }

  static async listUpgradePlans(workspaceId: string, targetId?: string, status?: string, component?: string) {
    return prisma.upgradePlan.findMany({
      where: {
        workspaceId,
        ...(targetId ? { targetId } : {}),
        ...(status ? { status } : {}),
        ...(component ? { component } : {})
      },
      include: {
        target: true,
        policy: true,
        runs: { orderBy: { startedAt: 'desc' }, take: 5 }
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  static async getUpgradePlan(planId: string) {
    return prisma.upgradePlan.findUnique({
      where: { id: planId },
      include: {
        workspace: true,
        target: true,
        policy: true,
        runs: { orderBy: { startedAt: 'desc' } }
      }
    })
  }

  static async listUpgradeRuns(workspaceId: string, targetId?: string, status?: string, component?: string) {
    const wherePlan = component ? { component } : undefined
    return prisma.upgradeRun.findMany({
      where: {
        workspaceId,
        ...(targetId ? { targetId } : {}),
        ...(status ? { status } : {}),
        ...(wherePlan ? { plan: wherePlan } : {})
      },
      include: {
        plan: true,
        target: true
      },
      orderBy: { startedAt: 'desc' }
    })
  }

  static async listPolicies(workspaceId: string) {
    return prisma.upgradePolicy.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } })
  }

  static async upsertPolicy(input: UpsertPolicyInput) {
    if (input.id) {
      return prisma.upgradePolicy.update({
        where: { id: input.id },
        data: {
          name: input.name,
          enabled: input.enabled ?? true,
          targetScopeJson: input.targetScopeJson || '{}',
          releaseChannelScopeJson: input.releaseChannelScopeJson || '{}',
          autoDetectUpdates: input.autoDetectUpdates ?? true,
          requireBackup: input.requireBackup ?? true,
          requireApproval: input.requireApproval ?? true,
          requireMaintenanceWindow: input.requireMaintenanceWindow ?? false,
          allowAutoRollback: input.allowAutoRollback ?? true
        }
      })
    }

    return prisma.upgradePolicy.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        enabled: input.enabled ?? true,
        targetScopeJson: input.targetScopeJson || '{}',
        releaseChannelScopeJson: input.releaseChannelScopeJson || '{}',
        autoDetectUpdates: input.autoDetectUpdates ?? true,
        requireBackup: input.requireBackup ?? true,
        requireApproval: input.requireApproval ?? true,
        requireMaintenanceWindow: input.requireMaintenanceWindow ?? false,
        allowAutoRollback: input.allowAutoRollback ?? true
      }
    })
  }

  static async listMaintenanceWindows(workspaceId: string) {
    return prisma.maintenanceWindow.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } })
  }

  static async upsertMaintenanceWindow(input: UpsertMaintenanceWindowInput) {
    if (input.id) {
      return prisma.maintenanceWindow.update({
        where: { id: input.id },
        data: {
          name: input.name,
          enabled: input.enabled ?? true,
          timezone: input.timezone || 'Asia/Shanghai',
          cronOrRule: input.cronOrRule,
          notes: input.notes || ''
        }
      })
    }

    return prisma.maintenanceWindow.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        enabled: input.enabled ?? true,
        timezone: input.timezone || 'Asia/Shanghai',
        cronOrRule: input.cronOrRule,
        notes: input.notes || ''
      }
    })
  }

  static async detectInstalledVersion(workspaceId: string, targetId: string, actor: string) {
    const target = await this.getTarget(workspaceId, targetId)
    const metadata = this.parseTargetMetadata(target.metadata)
    const component = inferComponentForTarget(target)
    const detection = await this.detectVersionByTarget(target, metadata)

    const installed = await prisma.installedVersion.upsert({
      where: {
        targetId_component: {
          targetId,
          component
        }
      },
      update: {
        workspaceId,
        installedVersion: detection.version,
        detectedAt: new Date(),
        source: detection.source,
        detailsJson: JSON.stringify(detection.details)
      },
      create: {
        workspaceId,
        targetId,
        component,
        installedVersion: detection.version,
        source: detection.source,
        detailsJson: JSON.stringify(detection.details)
      }
    })

    const traceId = uuidv4()
    await this.writeAuditLog(workspaceId, traceId, actor, 'UPGRADE_DETECT_VERSION', 'release-upgrade', { targetId }, { installedVersionId: installed.id, version: installed.installedVersion })
    await this.emitEvent(workspaceId, targetId, 'SYSTEM', installed.id, 'UPDATE_DETECTED', 'INFO', '检测到当前安装版本', `${target.name} 当前版本为 ${installed.installedVersion}`, { installedVersionId: installed.id, component, details: detection.details }, traceId)

    return installed
  }

  static async createUpgradePlan(input: CreateUpgradePlanInput, actor: string) {
    const traceId = uuidv4()
    const target = await this.getTarget(input.workspaceId, input.targetId)
    const policy = await this.resolvePolicy(input.workspaceId, target, input.policyId || null)
    const existingVersion = await prisma.installedVersion.findFirst({
      where: {
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        component: input.component
      },
      orderBy: { detectedAt: 'desc' }
    })

    const currentVersion = existingVersion?.installedVersion || 'unknown'
    const riskLevel = compareMaybeSemanticVersions(currentVersion, input.targetVersion)
    const planJson = this.buildPlanJson(target, this.parseTargetMetadata(target.metadata), input.component, currentVersion, input.targetVersion, policy)

    const created = await prisma.upgradePlan.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        policyId: policy?.id || null,
        component: input.component,
        currentVersion,
        targetVersion: input.targetVersion,
        releaseChannel: input.releaseChannel,
        planJson: JSON.stringify(planJson),
        riskLevel,
        status: 'DRAFT',
        traceId
      }
    })

    await this.writeAuditLog(input.workspaceId, traceId, actor, 'UPGRADE_PLAN_CREATED', 'release-upgrade', input, { upgradePlanId: created.id })
    await this.emitEvent(input.workspaceId, input.targetId, 'SYSTEM', created.id, 'UPGRADE_PLAN_CREATED', 'INFO', '升级计划已创建', `${target.name} 已创建 ${currentVersion} → ${input.targetVersion} 的升级计划`, { upgradePlanId: created.id, riskLevel }, traceId)

    return created
  }

  static async dryRunPlan(planId: string, actor: string) {
    const plan = await this.requirePlan(planId)
    const target = plan.target
    const workspace = plan.workspace
    const policy = plan.policy
    const metadata = this.parseTargetMetadata(target.metadata)
    const checks: DryRunCheck[] = []

    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    const maintenance = await this.checkMaintenanceWindow(workspace.id)

    if (workspace.envType === 'PROD' && workspace.isReadOnlyDefault && !unlocked) {
      checks.push({ key: 'workspace_unlock', passed: false, blocking: true, message: 'PROD Workspace 未临时解锁，禁止直接执行升级' })
    } else {
      checks.push({ key: 'workspace_unlock', passed: true, blocking: false, message: unlocked ? 'Workspace 已处于临时解锁窗口' : 'Workspace 当前可执行升级' })
    }

    if (policy?.requireMaintenanceWindow || workspace.envType === 'PROD') {
      checks.push({
        key: 'maintenance_window',
        passed: maintenance.allowed,
        blocking: true,
        message: maintenance.allowed ? '当前处于维护窗口内' : '当前不在允许的维护窗口内',
        details: maintenance.matchedRule || maintenance.reason
      })
    } else {
      checks.push({ key: 'maintenance_window', passed: true, blocking: false, message: '当前策略未强制要求维护窗口' })
    }

    if (policy?.requireBackup ?? true) {
      try {
        const backup = await BackupManager.exportBackup(workspace.id, actor, { includeChangeRequests: true, includeSnapshots: true })
        checks.push({ key: 'backup', passed: true, blocking: false, message: '备份能力校验通过', details: `备份项数量 ${backup.metadata.itemCount}` })
      } catch (error) {
        checks.push({ key: 'backup', passed: false, blocking: true, message: '备份能力校验失败', details: error instanceof Error ? error.message : String(error) })
      }
    } else {
      checks.push({ key: 'backup', passed: true, blocking: false, message: '策略未强制要求备份' })
    }

    const connectivityChecks = await this.collectConnectivityChecks(target, metadata)
    checks.push(...connectivityChecks)

    const compatibilityPassed = this.isComponentCompatible(target, plan.component, metadata)
    checks.push({
      key: 'compatibility',
      passed: compatibilityPassed,
      blocking: !compatibilityPassed,
      message: compatibilityPassed ? '目标版本与当前部署方式兼容' : '组件与目标部署方式不兼容',
      details: compatibilityPassed ? undefined : `${plan.component} 不适用于 ${target.targetType}`
    })

    const openClawApiCheck = await this.tryResolveWorkspaceClient(workspace.id)
    checks.push({
      key: 'openclaw_api',
      passed: openClawApiCheck.passed,
      blocking: false,
      message: openClawApiCheck.passed ? 'OpenClaw API 可用' : 'OpenClaw API 当前不可用，升级后无法自动同步 Actual/Drift',
      details: openClawApiCheck.details
    })

    const blocked = checks.some(check => !check.passed && check.blocking)
    const summary: DryRunSummary = {
      blocked,
      requiresApproval: Boolean(policy?.requireApproval) || workspace.envType === 'PROD',
      requiresRestart: true,
      rollbackSupported: (policy?.allowAutoRollback ?? true) && this.supportsRollback(target, metadata),
      checks
    }

    const nextStatus: UpgradePlanStatus = blocked
      ? 'DRAFT'
      : summary.requiresApproval
        ? 'PENDING_APPROVAL'
        : 'READY'

    const updated = await prisma.upgradePlan.update({
      where: { id: planId },
      data: {
        dryRunResultJson: JSON.stringify(summary),
        status: nextStatus
      }
    })

    await this.writeAuditLog(workspace.id, plan.traceId, actor, 'UPGRADE_PLAN_DRY_RUN', 'release-upgrade', { planId }, summary)
    return { plan: updated, dryRun: summary }
  }

  static async executePlan(input: ExecuteUpgradeInput) {
    const plan = await this.requirePlan(input.planId)
    const dryRun = await this.dryRunPlan(input.planId, input.actor)

    if (dryRun.dryRun.blocked) {
      throw new Error('Dry Run 未通过，当前升级计划仍被阻塞')
    }

    if (plan.status === 'RUNNING') {
      throw new Error('升级计划正在执行中，不能重复触发')
    }

    const workspace = plan.workspace
    const target = plan.target
    const policy = plan.policy
    const metadata = this.parseTargetMetadata(target.metadata)
    const needsApproval = Boolean(policy?.requireApproval) || workspace.envType === 'PROD'

    let approvalId = plan.approvalId
    if (needsApproval && !approvalId) {
      approvalId = await ApprovalGuard.createApproval('UPGRADE_SERVICE', {
        planId: plan.id,
        targetId: target.id,
        component: plan.component,
        targetVersion: plan.targetVersion,
        riskLevel: plan.riskLevel
      }, input.actor)

      await prisma.upgradePlan.update({ where: { id: plan.id }, data: { approvalId, status: 'PENDING_APPROVAL' } })
      await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'UPGRADE_APPROVAL_REQUIRED', 'WARN', '升级需要审批', `${target.name} 的升级计划已进入审批等待`, { upgradePlanId: plan.id, approvalId }, plan.traceId)
      return { status: 'pending_approval', approvalId }
    }

    if (needsApproval && approvalId) {
      const approvalStatus = await ApprovalGuard.checkApproval(approvalId)
      if (approvalStatus !== 'APPROVED') {
        return { status: 'pending_approval', approvalId }
      }
    }

    const planJson = safeJsonParse<PlanJson>(plan.planJson, this.buildPlanJson(target, metadata, plan.component as ComponentType, plan.currentVersion, plan.targetVersion, policy))
    const operation = await this.ensureOperation(plan, planJson)
    const run = await prisma.upgradeRun.create({
      data: {
        workspaceId: workspace.id,
        targetId: target.id,
        upgradePlanId: plan.id,
        status: 'RUNNING',
        resultJson: JSON.stringify({ startedBy: input.actor })
      }
    })

    await prisma.upgradePlan.update({ where: { id: plan.id }, data: { status: 'RUNNING', operationId: operation.id } })
    await prisma.operation.update({ where: { id: operation.id }, data: { status: 'RUNNING' } })
    await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'UPGRADE_STARTED', 'WARN', '升级已开始', `${target.name} 正在升级到 ${plan.targetVersion}`, { upgradePlanId: plan.id, operationId: operation.id, upgradeRunId: run.id }, plan.traceId)

    const stepsByName = await this.loadOperationSteps(operation.id)
    const executionResult: Record<string, unknown> = {}

    try {
      await this.markStepRunning(stepsByName, '执行升级预检查')
      executionResult.precheck = dryRun.dryRun
      await this.markStepSucceeded(stepsByName, '执行升级预检查', executionResult.precheck)

      const backupResult = await this.performBackup(plan, target, input.actor)
      executionResult.backup = backupResult
      await this.markStepSucceeded(stepsByName, '执行升级备份', backupResult)

      await this.executeStopAction(target, metadata, stepsByName)
      const installResult = await this.executeInstallAction(plan, target, metadata, stepsByName)
      executionResult.install = installResult
      await this.executeRestartAction(target, metadata, stepsByName)

      const verifyResult = await this.verifyAfterUpgrade(plan, target, metadata, stepsByName, input.actor)
      executionResult.verify = verifyResult

      if (!verifyResult.healthy) {
        throw new Error(verifyResult.message)
      }

      const postSync = await this.runPostUpgradeSync(plan, input.actor)
      executionResult.postSync = postSync

      await prisma.installedVersion.upsert({
        where: {
          targetId_component: {
            targetId: target.id,
            component: plan.component
          }
        },
        update: {
          workspaceId: workspace.id,
          installedVersion: plan.targetVersion,
          detectedAt: new Date(),
          source: target.targetType.includes('REMOTE') ? 'SSH' : target.targetType.includes('DOCKER') ? 'DOCKER' : 'LOCAL',
          detailsJson: JSON.stringify({ upgradedFrom: plan.currentVersion, traceId: plan.traceId })
        },
        create: {
          workspaceId: workspace.id,
          targetId: target.id,
          component: plan.component,
          installedVersion: plan.targetVersion,
          source: target.targetType.includes('REMOTE') ? 'SSH' : target.targetType.includes('DOCKER') ? 'DOCKER' : 'LOCAL',
          detailsJson: JSON.stringify({ upgradedFrom: plan.currentVersion, traceId: plan.traceId })
        }
      })

      await prisma.upgradeRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          endedAt: new Date(),
          resultJson: JSON.stringify(executionResult)
        }
      })
      await prisma.upgradePlan.update({ where: { id: plan.id }, data: { status: 'SUCCEEDED' } })
      await prisma.operation.update({ where: { id: operation.id }, data: { status: 'SUCCEEDED' } })
      await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'UPGRADE_SUCCEEDED', 'INFO', '升级成功', `${target.name} 已完成升级并通过验证`, { upgradePlanId: plan.id, upgradeRunId: run.id }, plan.traceId)
      await this.writeAuditLog(workspace.id, plan.traceId, input.actor, 'UPGRADE_EXECUTED', 'release-upgrade', { planId: plan.id }, executionResult)
      return { status: 'SUCCEEDED', runId: run.id, result: executionResult }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const rollbackResult = (policy?.allowAutoRollback ?? true) && this.supportsRollback(target, metadata)
        ? await this.rollbackPlan({ planId: plan.id, actor: input.actor, approvalId: approvalId || undefined })
        : null

      const finalStatus = rollbackResult && rollbackResult.status === 'ROLLED_BACK' ? 'ROLLED_BACK' : 'FAILED'

      await prisma.upgradeRun.update({
        where: { id: run.id },
        data: {
          status: finalStatus === 'ROLLED_BACK' ? 'ROLLED_BACK' : 'FAILED',
          endedAt: new Date(),
          resultJson: JSON.stringify({ ...executionResult, error: message }),
          rollbackResultJson: rollbackResult ? JSON.stringify(rollbackResult) : null
        }
      })
      await prisma.upgradePlan.update({ where: { id: plan.id }, data: { status: finalStatus } })
      await prisma.operation.update({ where: { id: operation.id }, data: { status: 'FAILED' } })
      const alertId = await this.createAlert(workspace.id, target.id, 'ERROR', '升级失败', `${target.name} 升级失败：${message}`, `upgrade:${plan.id}:failed`, plan.traceId)
      await this.markStepFailed(stepsByName, '升级验证', { error: message, alertId })
      await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'UPGRADE_FAILED', 'ERROR', '升级失败', `${target.name} 升级失败`, { upgradePlanId: plan.id, error: message, alertId }, plan.traceId)
      await this.writeAuditLog(workspace.id, plan.traceId, input.actor, 'UPGRADE_EXECUTE_FAILED', 'release-upgrade', { planId: plan.id }, { error: message, rollbackResult })
      return { status: finalStatus, runId: run.id, error: message, rollbackResult }
    }
  }

  static async rollbackPlan(input: ExecuteUpgradeInput) {
    const plan = await this.requirePlan(input.planId)
    const target = plan.target
    const workspace = plan.workspace
    const metadata = this.parseTargetMetadata(target.metadata)

    const needsApproval = workspace.envType === 'PROD'
    let approvalId = input.approvalId || plan.approvalId
    if (needsApproval && !approvalId) {
      approvalId = await ApprovalGuard.createApproval('RESTORE_DEPLOYMENT', { planId: plan.id, targetId: target.id, action: 'rollback' }, input.actor)
      await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'ROLLBACK_STARTED', 'WARN', '回滚等待审批', `${target.name} 的回滚操作已提交审批`, { upgradePlanId: plan.id, approvalId }, plan.traceId)
      return { status: 'pending_approval', approvalId }
    }

    if (needsApproval && approvalId) {
      const status = await ApprovalGuard.checkApproval(approvalId)
      if (status !== 'APPROVED') {
        return { status: 'pending_approval', approvalId }
      }
    }

    const operation = plan.operationId ? await prisma.operation.findUnique({ where: { id: plan.operationId } }) : null
    const metadataImage = formatTargetImage(metadata, plan.currentVersion)
    let result: unknown

    if (target.targetType.includes('DOCKER')) {
      result = await this.executeDockerRollback(target, metadata, metadataImage)
    } else {
      result = await this.executeNativeRollback(target, metadata, plan.currentVersion)
    }

    await prisma.installedVersion.upsert({
      where: { targetId_component: { targetId: target.id, component: plan.component } },
      update: {
        workspaceId: workspace.id,
        installedVersion: plan.currentVersion,
        detectedAt: new Date(),
        source: target.targetType.includes('REMOTE') ? 'SSH' : target.targetType.includes('DOCKER') ? 'DOCKER' : 'LOCAL',
        detailsJson: JSON.stringify({ rolledBackFrom: plan.targetVersion, traceId: plan.traceId })
      },
      create: {
        workspaceId: workspace.id,
        targetId: target.id,
        component: plan.component,
        installedVersion: plan.currentVersion,
        source: target.targetType.includes('REMOTE') ? 'SSH' : target.targetType.includes('DOCKER') ? 'DOCKER' : 'LOCAL',
        detailsJson: JSON.stringify({ rolledBackFrom: plan.targetVersion, traceId: plan.traceId })
      }
    })

    await this.runPostUpgradeSync(plan, input.actor)
    await prisma.upgradePlan.update({ where: { id: plan.id }, data: { status: 'ROLLED_BACK' } })
    if (operation) {
      await prisma.operation.update({ where: { id: operation.id }, data: { status: 'FAILED' } })
    }
    await this.emitEvent(workspace.id, target.id, 'SYSTEM', plan.id, 'ROLLBACK_SUCCEEDED', 'WARN', '回滚完成', `${target.name} 已回滚到 ${plan.currentVersion}`, { upgradePlanId: plan.id, result }, plan.traceId)
    await this.writeAuditLog(workspace.id, plan.traceId, input.actor, 'UPGRADE_ROLLBACK_EXECUTED', 'release-upgrade', { planId: plan.id }, result)
    return { status: 'ROLLED_BACK', result }
  }

  static async getDashboardStats(workspaceId: string) {
    const [availableUpdatesCount, pendingUpgradePlans, failedUpgrades, lastRuns] = await Promise.all([
      prisma.upgradePlan.count({ where: { workspaceId, status: { in: ['DRAFT', 'READY', 'PENDING_APPROVAL', 'APPROVED'] } } }),
      prisma.upgradePlan.count({ where: { workspaceId, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'READY'] } } }),
      prisma.upgradeRun.count({ where: { workspaceId, status: { in: ['FAILED', 'ROLLED_BACK'] } } }),
      prisma.upgradeRun.findMany({
        where: { workspaceId },
        include: { target: true, plan: true },
        orderBy: { startedAt: 'desc' },
        take: 20
      })
    ])

    const lastUpgradeResultPerTarget = lastRuns.reduce<Record<string, { targetName: string; status: string; startedAt: Date; planId: string }>>((acc, run) => {
      if (!acc[run.targetId]) {
        acc[run.targetId] = {
          targetName: run.target.name,
          status: run.status,
          startedAt: run.startedAt,
          planId: run.upgradePlanId
        }
      }
      return acc
    }, {})

    return {
      availableUpdatesCount,
      pendingUpgradePlans,
      failedUpgrades,
      lastUpgradeResultPerTarget: Object.entries(lastUpgradeResultPerTarget).map(([targetId, value]) => ({ targetId, ...value }))
    }
  }

  private static async getTarget(workspaceId: string, targetId: string): Promise<DeploymentTargetRecord> {
    const target = await prisma.deploymentTarget.findFirst({ where: { id: targetId, workspaceId } })
    if (!target) {
      throw new Error('部署目标不存在')
    }
    return target
  }

  private static parseTargetMetadata(raw: string): TargetMetadata {
    return safeJsonParse<TargetMetadata>(raw, {})
  }

  private static async requirePlan(planId: string) {
    const plan = await prisma.upgradePlan.findUnique({
      where: { id: planId },
      include: {
        workspace: true,
        target: true,
        policy: true,
        runs: true
      }
    })
    if (!plan) {
      throw new Error('升级计划不存在')
    }
    return plan
  }

  private static async resolvePolicy(workspaceId: string, target: DeploymentTargetRecord, policyId: string | null) {
    if (policyId) {
      return prisma.upgradePolicy.findFirst({ where: { id: policyId, workspaceId } })
    }

    const policies = await prisma.upgradePolicy.findMany({ where: { workspaceId, enabled: true }, orderBy: { createdAt: 'asc' } })
    for (const policy of policies) {
      const scope = safeJsonParse<{ envTypes?: string[]; targetIds?: string[] }>(policy.targetScopeJson, {})
      const envMatch = !scope.envTypes || scope.envTypes.length === 0 || scope.envTypes.includes(target.envType)
      const targetMatch = !scope.targetIds || scope.targetIds.length === 0 || scope.targetIds.includes(target.id)
      if (envMatch && targetMatch) return policy
    }

    return null
  }

  private static buildPlanJson(target: DeploymentTargetRecord, metadata: TargetMetadata, component: ComponentType, currentVersion: string, targetVersion: string, policy: { id: string } | null): PlanJson {
    const phases: PlanPhase[] = [
      {
        name: 'Precheck',
        steps: [
          {
            name: '执行升级预检查',
            stepType: 'PRECHECK',
            requestJson: { component, currentVersion, targetVersion }
          }
        ]
      },
      {
        name: 'Backup',
        steps: [
          {
            name: '执行升级备份',
            stepType: 'BACKUP',
            requestJson: { targetId: target.id, workspaceId: target.workspaceId }
          }
        ]
      },
      {
        name: 'Stop / Drain',
        steps: [
          {
            name: '停止现有服务',
            stepType: 'STOP',
            requestJson: { targetType: target.targetType, projectName: metadata.projectName || metadata.dockerComposeProject || 'openclaw-gateway' }
          }
        ]
      },
      {
        name: 'Install / Pull',
        steps: [
          {
            name: '安装目标版本',
            stepType: 'CUSTOM',
            requestJson: { component, targetVersion }
          }
        ]
      },
      {
        name: 'Restart',
        steps: [
          {
            name: '重启升级后服务',
            stepType: 'RESTART',
            requestJson: { targetType: target.targetType }
          }
        ]
      },
      {
        name: 'Verify',
        steps: [
          {
            name: '升级验证',
            stepType: 'VERIFY',
            requestJson: { healthUrl: metadata.healthUrl || target.gatewayUrl || null }
          }
        ]
      },
      {
        name: 'Rollback',
        steps: [
          {
            name: '执行回滚',
            stepType: 'CUSTOM',
            requestJson: { currentVersion, rollbackSupported: this.supportsRollback(target, metadata) }
          }
        ]
      }
    ]

    return {
      precheck: { component, currentVersion, targetVersion, policyId: policy?.id || null },
      backup: { required: true },
      stopOrRollingAction: { action: 'stop' },
      installOrPull: {
        method: target.targetType.includes('DOCKER') ? 'pull-image' : 'native-command',
        targetVersion,
        image: target.targetType.includes('DOCKER') ? formatTargetImage(metadata, targetVersion) : null
      },
      applyConfigIfNeeded: { enabled: false },
      restart: { action: 'restart' },
      verify: { healthCheck: true, doctorCheck: true, driftSync: true },
      rollbackPlan: { previousVersion: currentVersion, enabled: this.supportsRollback(target, metadata) },
      phases
    }
  }

  private static isComponentCompatible(target: DeploymentTargetRecord, component: string, metadata: TargetMetadata) {
    if (metadata.compatibleComponents && metadata.compatibleComponents.length > 0) {
      return metadata.compatibleComponents.includes(component as ComponentType)
    }
    if (target.targetType.includes('DOCKER')) {
      return component === 'DOCKER_IMAGE' || component === 'GATEWAY' || component === 'OPENCLAW'
    }
    return component !== 'DOCKER_IMAGE'
  }

  private static supportsRollback(target: DeploymentTargetRecord, metadata: TargetMetadata) {
    return target.targetType.includes('DOCKER') || Boolean(metadata.rollbackCommand)
  }

  private static async checkMaintenanceWindow(workspaceId: string) {
    const rows = await prisma.maintenanceWindow.findMany({ where: { workspaceId, enabled: true } })
    if (rows.length === 0) {
      return { allowed: false, reason: '未配置任何维护窗口', matchedRule: null as string | null }
    }
    const now = new Date()
    const currentDay = dayName(now)
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    for (const row of rows) {
      const parsed = parseWeeklyRule(row.cronOrRule)
      if (!parsed) continue
      if (parsed.day === currentDay && currentMinutes >= parsed.startMinutes && currentMinutes <= parsed.endMinutes) {
        return { allowed: true, reason: '', matchedRule: row.cronOrRule }
      }
    }
    return { allowed: false, reason: '当前时间不在任何维护窗口内', matchedRule: null as string | null }
  }

  private static async collectConnectivityChecks(target: DeploymentTargetRecord, metadata: TargetMetadata): Promise<DryRunCheck[]> {
    const checks: DryRunCheck[] = []
    if (target.targetType === 'LOCAL_DOCKER') {
      try {
        const { stdout } = await execAsync('docker --version')
        checks.push({ key: 'docker', passed: true, blocking: false, message: '本地 Docker 可用', details: stdout.trim() })
      } catch (error) {
        checks.push({ key: 'docker', passed: false, blocking: true, message: '本地 Docker 不可用', details: error instanceof Error ? error.message : String(error) })
      }
    } else if (target.targetType === 'REMOTE_DOCKER' || target.targetType === 'REMOTE_HOST') {
      const sshConfig = await this.buildSshConfig(target)
      const ssh = new SSHExecutor(sshConfig)
      try {
        await ssh.connect()
        checks.push({ key: 'ssh', passed: true, blocking: false, message: 'SSH 连接可用' })
        if (target.targetType === 'REMOTE_DOCKER') {
          const dockerCheck = await ssh.checkDocker()
          checks.push({ key: 'remote_docker', passed: dockerCheck.available, blocking: true, message: dockerCheck.available ? '远程 Docker 可用' : '远程 Docker 不可用', details: dockerCheck.version || dockerCheck.error })
        }
      } catch (error) {
        checks.push({ key: 'ssh', passed: false, blocking: true, message: 'SSH 连接失败', details: error instanceof Error ? error.message : String(error) })
      } finally {
        ssh.disconnect()
      }
    } else {
      const command = metadata.versionCommand || 'openclaw-gateway --version'
      try {
        const { stdout } = await execAsync(command)
        checks.push({ key: 'native_command', passed: true, blocking: false, message: '本地原生命令可用', details: stdout.trim() })
      } catch (error) {
        checks.push({ key: 'native_command', passed: false, blocking: false, message: '本地版本命令不可用，将退回 health 检查', details: error instanceof Error ? error.message : String(error) })
      }
    }
    return checks
  }

  private static async tryResolveWorkspaceClient(workspaceId: string) {
    try {
      const client = await this.createWorkspaceOpenClawClient(workspaceId)
      const ping = await client.ping()
      return { passed: ping.success, details: ping.success ? `延迟 ${ping.latency}ms` : ping.error || 'Ping 失败' }
    } catch (error) {
      return { passed: false, details: error instanceof Error ? error.message : String(error) }
    }
  }

  private static async detectVersionByTarget(target: DeploymentTargetRecord, metadata: TargetMetadata) {
    switch (target.targetType as TargetType) {
      case 'LOCAL_DOCKER':
        return this.detectLocalDockerVersion(target, metadata)
      case 'REMOTE_DOCKER':
        return this.detectRemoteDockerVersion(target, metadata)
      case 'REMOTE_HOST':
        return this.detectRemoteNativeVersion(target, metadata)
      case 'LOCAL_HOST':
      default:
        return this.detectLocalNativeVersion(target, metadata)
    }
  }

  private static async detectLocalDockerVersion(_target: DeploymentTargetRecord, metadata: TargetMetadata) {
    const containerName = metadata.dockerContainerName || 'openclaw-gateway'
    const image = formatTargetImage(metadata, metadata.imageTag || 'latest')
    try {
      const { stdout } = await execAsync(`docker inspect --format="{{.Config.Image}}" ${containerName}`)
      const detected = stdout.trim() || image
      return { version: detected, source: 'DOCKER' as const, details: { containerName, image: detected } }
    } catch {
      return { version: image, source: 'DOCKER' as const, details: { containerName, image, fallback: true } }
    }
  }

  private static async detectRemoteDockerVersion(target: DeploymentTargetRecord, metadata: TargetMetadata) {
    const sshConfig = await this.buildSshConfig(target)
    const ssh = new SSHExecutor(sshConfig)
    const containerName = metadata.dockerContainerName || 'openclaw-gateway'
    try {
      await ssh.connect()
      const result = await ssh.executeCommand(`docker inspect --format='{{.Config.Image}}' ${containerName}`, 10000)
      if (result.success) {
        return { version: result.stdout.trim(), source: 'SSH' as const, details: { containerName, image: result.stdout.trim() } }
      }
      return { version: formatTargetImage(metadata, metadata.imageTag || 'latest'), source: 'SSH' as const, details: { containerName, error: result.stderr, fallback: true } }
    } finally {
      ssh.disconnect()
    }
  }

  private static async detectLocalNativeVersion(target: DeploymentTargetRecord, metadata: TargetMetadata) {
    const command = metadata.versionCommand || 'openclaw-gateway --version'
    try {
      const { stdout } = await execAsync(command)
      return { version: stdout.trim() || 'unknown', source: 'LOCAL' as const, details: { command } }
    } catch (error) {
      const healthUrl = metadata.healthUrl || target.gatewayUrl || `http://127.0.0.1:${target.port || 18789}/health`
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
        return { version: response.headers.get('x-openclaw-version') || 'unknown', source: 'OPENCLAW_API' as const, details: { healthUrl, fallback: true } }
      } catch {
        return { version: 'unknown', source: 'LOCAL' as const, details: { command, error: error instanceof Error ? error.message : String(error) } }
      }
    }
  }

  private static async detectRemoteNativeVersion(target: DeploymentTargetRecord, metadata: TargetMetadata) {
    const sshConfig = await this.buildSshConfig(target)
    const ssh = new SSHExecutor(sshConfig)
    const command = metadata.versionCommand || 'openclaw-gateway --version'
    try {
      await ssh.connect()
      const result = await ssh.executeCommand(command, 10000)
      return { version: result.success ? result.stdout.trim() || 'unknown' : 'unknown', source: 'SSH' as const, details: { command, stderr: result.stderr || null } }
    } finally {
      ssh.disconnect()
    }
  }

  private static async buildSshConfig(target: DeploymentTargetRecord): Promise<SSHConfig> {
    if (!target.host || !target.sshUser) {
      throw new Error('目标缺少 SSH 配置')
    }
    return {
      host: target.host,
      port: target.sshPort || 22,
      username: target.sshUser,
      authMode: 'password',
      workspaceId: target.workspaceId,
      credentialKey: `deployment-target-${target.id}-ssh`
    }
  }

  private static async createWorkspaceOpenClawClient(workspaceId: string) {
    const defaultProfile = await prisma.workspaceProfile.findFirst({ where: { workspaceId, isDefault: true } })
    const fallbackProfile = defaultProfile ? null : await prisma.workspaceProfile.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'asc' } })
    const profileId = (defaultProfile || fallbackProfile)?.profileId
    if (!profileId) {
      throw new Error('Workspace 未绑定 ConnectionProfile')
    }
    const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
    if (!profile) {
      throw new Error('ConnectionProfile 不存在')
    }
    const token = await KeychainService.getPassword(workspaceId, `${profile.name}-token`)
    const password = await KeychainService.getPassword(workspaceId, `${profile.name}-password`)
    const edgeToken = await KeychainService.getPassword(workspaceId, `${profile.name}-edge-token`)
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

  private static async ensureOperation(plan: Awaited<ReturnType<typeof ReleaseUpgradeService.requirePlan>>, planJson: PlanJson) {
    if (plan.operationId) {
      const existing = await prisma.operation.findUnique({ where: { id: plan.operationId } })
      if (existing) return existing
    }

    const operation = await prisma.operation.create({
      data: {
        workspaceId: plan.workspaceId,
        targetId: plan.targetId,
        type: 'UPGRADE',
        status: 'PENDING',
        traceId: plan.traceId,
        title: `升级 ${plan.component} 到 ${plan.targetVersion}`,
        summary: `${plan.currentVersion} → ${plan.targetVersion}`,
        phases: {
          create: planJson.phases.map((phase, phaseIndex) => ({
            name: phase.name,
            orderNo: phaseIndex + 1,
            status: 'PENDING',
            steps: {
              create: phase.steps.map(step => ({
                name: step.name,
                stepType: step.stepType,
                status: 'PENDING',
                requestJson: JSON.stringify(step.requestJson)
              }))
            }
          }))
        }
      }
    })

    await prisma.upgradePlan.update({ where: { id: plan.id }, data: { operationId: operation.id } })
    return operation
  }

  private static async loadOperationSteps(operationId: string) {
    const phases = await prisma.operationPhase.findMany({
      where: { operationId },
      include: { steps: true },
      orderBy: { orderNo: 'asc' }
    })
    const map = new Map<string, { phaseId: string; stepId: string }>()
    for (const phase of phases) {
      for (const step of phase.steps) {
        map.set(step.name, { phaseId: phase.id, stepId: step.id })
      }
    }
    return map
  }

  private static async markStepRunning(stepMap: Map<string, { phaseId: string; stepId: string }>, stepName: string) {
    const target = stepMap.get(stepName)
    if (!target) return
    await prisma.operationPhase.update({ where: { id: target.phaseId }, data: { status: 'RUNNING', startedAt: new Date() } })
    await prisma.operationStep.update({ where: { id: target.stepId }, data: { status: 'RUNNING', startedAt: new Date() } })
  }

  private static async markStepSucceeded(stepMap: Map<string, { phaseId: string; stepId: string }>, stepName: string, result: unknown) {
    const target = stepMap.get(stepName)
    if (!target) return
    await prisma.operationStep.update({ where: { id: target.stepId }, data: { status: 'SUCCEEDED', endedAt: new Date(), resultJson: JSON.stringify(result) } })
    await prisma.operationPhase.update({ where: { id: target.phaseId }, data: { status: 'SUCCEEDED', endedAt: new Date() } })
  }

  private static async markStepFailed(stepMap: Map<string, { phaseId: string; stepId: string }>, stepName: string, result: unknown) {
    const target = stepMap.get(stepName)
    if (!target) return
    await prisma.operationStep.update({ where: { id: target.stepId }, data: { status: 'FAILED', endedAt: new Date(), resultJson: JSON.stringify(result) } })
    await prisma.operationPhase.update({ where: { id: target.phaseId }, data: { status: 'FAILED', endedAt: new Date() } })
  }

  private static async performBackup(plan: Awaited<ReturnType<typeof ReleaseUpgradeService.requirePlan>>, target: DeploymentTargetRecord, actor: string) {
    const backupPack = await BackupManager.exportBackup(plan.workspaceId, actor, { includeChangeRequests: true, includeSnapshots: true })
    return {
      backupHash: backupPack.metadata.hash,
      itemCount: backupPack.metadata.itemCount,
      previousVersion: plan.currentVersion,
      targetType: target.targetType
    }
  }

  private static async executeStopAction(target: DeploymentTargetRecord, metadata: TargetMetadata, stepMap: Map<string, { phaseId: string; stepId: string }>) {
    await this.markStepRunning(stepMap, '停止现有服务')
    const options = await this.buildServiceOptions(target, metadata)
    const template = DeploymentTemplateFactory.getTemplate(target.targetType as TargetType)
    const result = await template.stop(options)
    if (!result.success) {
      throw new Error(result.message)
    }
    await this.markStepSucceeded(stepMap, '停止现有服务', result)
  }

  private static async executeInstallAction(plan: Awaited<ReturnType<typeof ReleaseUpgradeService.requirePlan>>, target: DeploymentTargetRecord, metadata: TargetMetadata, stepMap: Map<string, { phaseId: string; stepId: string }>) {
    await this.markStepRunning(stepMap, '安装目标版本')
    const result = target.targetType.includes('DOCKER')
      ? await this.executeDockerUpgrade(target, metadata, plan.targetVersion)
      : await this.executeNativeUpgrade(target, metadata, plan.targetVersion)

    if (!result.success) {
      throw new Error(result.message)
    }
    await this.markStepSucceeded(stepMap, '安装目标版本', result)
    return result
  }

  private static async executeRestartAction(target: DeploymentTargetRecord, metadata: TargetMetadata, stepMap: Map<string, { phaseId: string; stepId: string }>) {
    await this.markStepRunning(stepMap, '重启升级后服务')
    const options = await this.buildServiceOptions(target, metadata)
    const template = DeploymentTemplateFactory.getTemplate(target.targetType as TargetType)
    const result = await template.restart(options)
    if (!result.success) {
      throw new Error(result.message)
    }
    await this.markStepSucceeded(stepMap, '重启升级后服务', result)
  }

  private static async verifyAfterUpgrade(plan: Awaited<ReturnType<typeof ReleaseUpgradeService.requirePlan>>, target: DeploymentTargetRecord, metadata: TargetMetadata, stepMap: Map<string, { phaseId: string; stepId: string }>, actor: string) {
    await this.markStepRunning(stepMap, '升级验证')
    const options = await this.buildServiceOptions(target, metadata)
    const template = DeploymentTemplateFactory.getTemplate(target.targetType as TargetType)
    const health = await template.healthCheck(options)
    const doctorCheck = await prisma.doctorCheck.create({
      data: {
        workspaceId: plan.workspaceId,
        targetId: plan.targetId,
        checkType: 'UPGRADE_VERIFY',
        status: health.healthy ? 'OK' : 'ERROR',
        resultJson: JSON.stringify(health),
        score: health.healthy ? 100 : 30,
        traceId: plan.traceId
      }
    })

    if (health.healthy) {
      await prisma.operationStep.update({
        where: { id: stepMap.get('升级验证')?.stepId },
        data: { alertId: null }
      })
    }

    await DoctorService.runFullDiagnostic(plan.workspaceId, actor)

    const result = {
      healthy: health.healthy,
      status: health.status,
      message: health.healthy ? '健康检查与 Doctor Check 通过' : health.details || '健康检查失败',
      doctorCheckId: doctorCheck.id
    }

    if (!health.healthy) {
      const alertId = await this.createAlert(plan.workspaceId, plan.targetId, 'ERROR', '升级后验证失败', result.message, `upgrade:${plan.id}:verify`, plan.traceId)
      await prisma.operationStep.update({ where: { id: stepMap.get('升级验证')?.stepId }, data: { alertId } })
      await this.markStepFailed(stepMap, '升级验证', { ...result, alertId })
      return result
    }

    await this.markStepSucceeded(stepMap, '升级验证', result)
    return result
  }

  private static async runPostUpgradeSync(plan: Awaited<ReturnType<typeof ReleaseUpgradeService.requirePlan>>, actor: string) {
    try {
      const client = await this.createWorkspaceOpenClawClient(plan.workspaceId)
      const snapshot = await client.getConfigSnapshot(plan.traceId)
      const snapshotId = await ConfigManager.syncActualSnapshot(plan.workspaceId, snapshot.config, actor)
      const drift = await ConfigManager.computeDrift(plan.workspaceId)
      return { snapshotId, drift }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const alertId = await this.createAlert(plan.workspaceId, plan.targetId, 'WARN', '升级后同步失败', message, `upgrade:${plan.id}:post-sync`, plan.traceId)
      return { warning: message, alertId }
    }
  }

  private static async buildServiceOptions(target: DeploymentTargetRecord, metadata: TargetMetadata): Promise<ServiceOptions> {
    const base: ServiceOptions = {
      port: target.port || 18789,
      workDir: metadata.workDir || '/opt/openclaw',
      projectName: metadata.projectName || metadata.dockerComposeProject || 'openclaw-gateway'
    }
    if (target.targetType.includes('REMOTE')) {
      return {
        ...base,
        sshConfig: await this.buildSshConfig(target)
      }
    }
    return base
  }

  private static async executeDockerUpgrade(target: DeploymentTargetRecord, metadata: TargetMetadata, targetVersion: string) {
    const options: UpgradeOptions = {
      ...(await this.buildServiceOptions(target, metadata)),
      version: targetVersion
    }
    const template = DeploymentTemplateFactory.getTemplate(target.targetType as TargetType)
    return template.upgrade(options)
  }

  private static async executeNativeUpgrade(target: DeploymentTargetRecord, metadata: TargetMetadata, targetVersion: string) {
    const command = metadata.upgradeCommand?.replace(/\{\{version\}\}/g, targetVersion)
    if (!command) {
      throw new Error('当前原生目标未配置 upgradeCommand，无法自动执行升级')
    }
    if (target.targetType === 'REMOTE_HOST') {
      const sshConfig = await this.buildSshConfig(target)
      const ssh = new SSHExecutor(sshConfig)
      try {
        await ssh.connect()
        const result = await ssh.executeCommand(command, 300000)
        return { success: result.success, message: result.success ? `已升级到版本 ${targetVersion}` : result.stderr, stdout: result.stdout }
      } finally {
        ssh.disconnect()
      }
    }
    const { stdout, stderr } = await execAsync(command)
    return { success: true, message: `已升级到版本 ${targetVersion}`, stdout, stderr }
  }

  private static async executeDockerRollback(target: DeploymentTargetRecord, metadata: TargetMetadata, image: string) {
    const version = image.includes(':') ? image.split(':').slice(1).join(':') : image
    return this.executeDockerUpgrade(target, metadata, version)
  }

  private static async executeNativeRollback(target: DeploymentTargetRecord, metadata: TargetMetadata, currentVersion: string) {
    const command = metadata.rollbackCommand?.replace(/\{\{version\}\}/g, currentVersion)
    if (!command) {
      throw new Error('当前原生目标未配置 rollbackCommand，无法自动回滚')
    }
    if (target.targetType === 'REMOTE_HOST') {
      const sshConfig = await this.buildSshConfig(target)
      const ssh = new SSHExecutor(sshConfig)
      try {
        await ssh.connect()
        const result = await ssh.executeCommand(command, 300000)
        if (!result.success) {
          throw new Error(result.stderr)
        }
        return { message: `已回滚到 ${currentVersion}`, stdout: result.stdout }
      } finally {
        ssh.disconnect()
      }
    }
    const { stdout, stderr } = await execAsync(command)
    return { message: `已回滚到 ${currentVersion}`, stdout, stderr }
  }

  private static async createAlert(workspaceId: string, targetId: string, severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', title: string, summary: string, dedupeKey: string, traceId: string) {
    const existing = await prisma.alert.findFirst({
      where: {
        workspaceId,
        dedupeKey,
        status: { in: ['OPEN', 'ACKED'] }
      },
      orderBy: { updatedAt: 'desc' }
    })

    if (existing) {
      const updated = await prisma.alert.update({
        where: { id: existing.id },
        data: {
          severity,
          title,
          summary,
          traceId,
          targetId
        }
      })
      return updated.id
    }

    const created = await prisma.alert.create({
      data: {
        workspaceId,
        targetId,
        severity,
        status: 'OPEN',
        title,
        summary,
        dedupeKey,
        traceId
      }
    })
    return created.id
  }

  private static async writeAuditLog(workspaceId: string, traceId: string, actor: string, action: string, tool: string, request: unknown, response: unknown) {
    await writeAuditLog({
      workspaceId,
      traceId,
      actor,
      action,
      tool,
      request: request,
      response: response
    })
  }

  private static async emitEvent(workspaceId: string, targetId: string | undefined, sourceType: 'SYSTEM' | 'DOCTOR', sourceId: string, eventType: string, severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', title: string, summary: string, payload: unknown, traceId: string) {
    await EventBusService.emit({
      workspaceId,
      targetId: targetId || null,
      sourceType,
      sourceId,
      eventType,
      severity,
      title,
      summary,
      payload,
      traceId
    })
  }
}
