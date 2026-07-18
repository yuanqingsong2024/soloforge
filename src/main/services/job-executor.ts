import { v4 as uuidv4 } from 'uuid'
import { prisma } from './db'
import { resolveWorkspaceOpenClawClient } from './workspace-openclaw'
import { ConfigManager } from './config-manager'
import { DoctorService } from './doctor-service'
import { EventBusService } from './event-bus'
import { writeAuditLog } from './audit-log-writer'

type JobExecutionResult = Record<string, unknown> & { logs?: string }

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJobRequest(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Job.request 必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

function readOptionalString(request: Record<string, unknown>, key: string): string | undefined {
  const value = request[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function emitJobEvent(input: {
  workspaceId: string
  jobId: string
  traceId: string
  eventType: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  title: string
  summary: string
  payload: unknown
}): Promise<void> {
  await EventBusService.emit({
    workspaceId: input.workspaceId,
    sourceType: 'SYSTEM',
    sourceId: input.jobId,
    eventType: input.eventType,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    payload: input.payload,
    traceId: input.traceId
  })
}

export class JobExecutor {
  /**
   * 执行 Job（幂等）
   * @param jobId Job ID
   * @returns 执行结果
   */
  static async execute(jobId: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // 1. 查询 Job
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { workspace: true } })
    if (!job) return { success: false, error: 'Job not found' }
    
    // 2. 幂等性检查：如果已经 SUCCEEDED，直接返回结果
    if (job.status === 'SUCCEEDED') {
      return { success: true, result: job.result ? JSON.parse(job.result) : null }
    }
    
    // 3. 状态检查：如果正在运行，拒绝重复执行
    if (job.status === 'RUNNING') {
      return { success: false, error: 'Job is already running' }
    }
    
    // 4. 更新状态为 RUNNING
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', updatedAt: new Date() }
    })
    
    try {
      await emitJobEvent({
        workspaceId: job.workspaceId,
        jobId: job.id,
        traceId: job.traceId,
        eventType: 'JOB_STARTED',
        severity: 'INFO',
        title: `Job 开始执行：${job.type}`,
        summary: `Job ${job.id} 已进入 RUNNING`,
        payload: { jobId: job.id, type: job.type }
      })

      // 5. 根据 type 执行不同逻辑
      let result: JobExecutionResult
      const request = parseJobRequest(job.request)
      
      switch (job.type) {
        case 'APPLY_CONFIG':
          result = await this.executeApplyConfig(job.workspaceId, request, job.traceId)
          break
        case 'SYNC_STATE':
          result = await this.executeSyncState(job.workspaceId, request, job.traceId)
          break
        case 'DOCTOR_CHECK':
          result = await this.executeDoctorCheck(job.workspaceId, request, job.traceId)
          break
        default:
          throw new Error(`Unknown job type: ${job.type}`)
      }
      
      // 6. 回写结果（脱敏）
      const sanitizedResult = this.sanitizeResult(result)
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          result: JSON.stringify(sanitizedResult),
          logs: result.logs || '',
          updatedAt: new Date()
        }
      })
      
      // 7. 写入审计日志
      await writeAuditLog({
        workspaceId: job.workspaceId,
        ticketId: job.ticketId ?? undefined,
        traceId: job.traceId,
        actor: 'system',
        action: 'JOB_EXECUTED',
        request: { jobId, type: job.type },
        response: { success: true }
      })

      await emitJobEvent({
        workspaceId: job.workspaceId,
        jobId: job.id,
        traceId: job.traceId,
        eventType: 'JOB_SUCCEEDED',
        severity: 'INFO',
        title: `Job 执行成功：${job.type}`,
        summary: `Job ${job.id} 已完成`,
        payload: { jobId: job.id, type: job.type, result: sanitizedResult }
      })
       
      return { success: true, result: sanitizedResult }
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error)
      // 8. 失败处理
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          logs: errorMessage,
          updatedAt: new Date()
        }
      })
      
      // 9. 写入审计日志
      await writeAuditLog({
        workspaceId: job.workspaceId,
        ticketId: job.ticketId ?? undefined,
        traceId: job.traceId,
        actor: 'system',
        action: 'JOB_FAILED',
        request: { jobId, type: job.type },
        response: { error: errorMessage }
      })

      await emitJobEvent({
        workspaceId: job.workspaceId,
        jobId: job.id,
        traceId: job.traceId,
        eventType: 'JOB_FAILED',
        severity: 'ERROR',
        title: `Job 执行失败：${job.type}`,
        summary: errorMessage,
        payload: { jobId: job.id, type: job.type, error: errorMessage }
      })
       
      return { success: false, error: errorMessage }
    }
  }
  
  /**
   * 创建 Job（幂等）
   */
  static async createJob(data: {
    workspaceId: string
    ticketId?: string
    type: string
    request: unknown
  }): Promise<string> {
    const traceId = uuidv4()
    const requestStr = JSON.stringify(data.request)
    
    // 幂等性：基于 workspaceId + type + request 检查是否已存在
    const existing = await prisma.job.findFirst({
      where: {
        workspaceId: data.workspaceId,
        type: data.type,
        request: requestStr,
        status: { in: ['PENDING', 'RUNNING', 'SUCCEEDED'] }
      }
    })
    
    if (existing) return existing.id
    
    const job = await prisma.job.create({
      data: {
        workspaceId: data.workspaceId,
        ticketId: data.ticketId,
        type: data.type,
        status: 'PENDING',
        traceId,
        request: requestStr
      }
    })
    
    return job.id
  }
  
  // 私有方法：执行具体类型的 Job
  private static async executeApplyConfig(workspaceId: string, request: Record<string, unknown>, traceId: string): Promise<JobExecutionResult> {
    if (!('config' in request) || request.config === null || request.config === undefined) {
      throw new Error('APPLY_CONFIG Job 缺少 config')
    }
    const { profileId, client } = await resolveWorkspaceOpenClawClient(workspaceId)
    const response = await client.applyConfig(request.config, traceId)
    return { profileId, response, logs: '配置已应用到 OpenClaw' }
  }
  
  private static async executeSyncState(workspaceId: string, request: Record<string, unknown>, traceId: string): Promise<JobExecutionResult> {
    const createdBy = readOptionalString(request, 'createdBy') || 'job-executor'
    const { profileId, client } = await resolveWorkspaceOpenClawClient(workspaceId)
    const snapshot = await client.getConfigSnapshot(traceId)
    const snapshotId = await ConfigManager.syncActualSnapshot(workspaceId, snapshot.config, createdBy)
    return {
      profileId,
      snapshotId,
      hash: snapshot.hash,
      logs: '实际状态快照已同步'
    }
  }

  private static async executeDoctorCheck(workspaceId: string, request: Record<string, unknown>, traceId: string): Promise<JobExecutionResult> {
    const createdBy = readOptionalString(request, 'createdBy') || 'job-executor'
    const report = await DoctorService.runFullDiagnostic(workspaceId, createdBy)
    await EventBusService.emit({
      workspaceId,
      sourceType: 'DOCTOR',
      sourceId: report.id,
      eventType: 'DOCTOR_REPORT_COMPLETED',
      severity: report.severity === 'CRITICAL' ? 'CRITICAL' : report.severity === 'ERROR' ? 'ERROR' : report.severity === 'WARNING' ? 'WARN' : 'INFO',
      title: 'Doctor 巡检 Job 已完成',
      summary: report.summary,
      payload: {
        reportId: report.id,
        severity: report.severity,
        findingCount: report.findings.length
      },
      traceId
    })
    return {
      reportId: report.id,
      severity: report.severity,
      findingCount: report.findings.length,
      summary: report.summary,
      logs: 'Doctor 巡检已完成'
    }
  }
  
  // 脱敏结果（移除敏感字段）
  private static sanitizeResult(result: JobExecutionResult): JobExecutionResult {
    if (!result) return result
    const sanitized = { ...result }
    
    // 移除或掩码敏感字段
    const sensitiveKeys = ['token', 'password', 'apiKey', 'secret', 'credential']
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '***REDACTED***'
      }
    }
    
    return sanitized
  }
}
