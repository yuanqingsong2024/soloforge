import { v4 as uuidv4 } from 'uuid'
import { PrismaClient } from '@prisma/client'
import { OpenClawClient } from './openclaw-client'
// crypto 已导入但在当前实现中未使用（保留以备将来扩展）

const prisma = new PrismaClient()

export class JobExecutor {
  /**
   * 执行 Job（幂等）
   * @param jobId Job ID
   * @returns 执行结果
   */
  static async execute(jobId: string): Promise<{ success: boolean; result?: any; error?: string }> {
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
      // 5. 根据 type 执行不同逻辑
      let result: any
      const request = JSON.parse(job.request)
      
      switch (job.type) {
        case 'APPLY_CONFIG':
          result = await this.executeApplyConfig(job.workspaceId, request, job.traceId)
          break
        case 'RUN_TOOL':
          result = await this.executeRunTool(job.workspaceId, request, job.traceId)
          break
        case 'SYNC_STATE':
          result = await this.executeSyncState(job.workspaceId, request, job.traceId)
          break
        case 'ROTATE_TOKEN':
          result = await this.executeRotateToken(job.workspaceId, request, job.traceId)
          break
        case 'CUSTOM':
          result = await this.executeCustom(job.workspaceId, request, job.traceId)
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
      await prisma.auditLog.create({
        data: {
          workspaceId: job.workspaceId,
          ticketId: job.ticketId,
          traceId: job.traceId,
          actor: 'system',
          action: 'JOB_EXECUTED',
          request: JSON.stringify({ jobId, type: job.type }),
          response: JSON.stringify({ success: true })
        }
      })
      
      return { success: true, result: sanitizedResult }
    } catch (error: any) {
      // 8. 失败处理
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          logs: error.message || 'Unknown error',
          updatedAt: new Date()
        }
      })
      
      // 9. 写入审计日志
      await prisma.auditLog.create({
        data: {
          workspaceId: job.workspaceId,
          ticketId: job.ticketId,
          traceId: job.traceId,
          actor: 'system',
          action: 'JOB_FAILED',
          request: JSON.stringify({ jobId, type: job.type }),
          response: JSON.stringify({ error: error.message })
        }
      })
      
      return { success: false, error: error.message }
    }
  }
  
  /**
   * 创建 Job（幂等）
   */
  static async createJob(data: {
    workspaceId: string
    ticketId?: string
    type: string
    request: any
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
  private static async executeApplyConfig(workspaceId: string, request: any, traceId: string) {
    // 获取 workspace 的默认 profile
    const profile = await prisma.workspaceProfile.findFirst({
      where: { workspaceId, isDefault: true },
      include: { profile: true }
    })
    
    if (!profile) throw new Error('No default profile found for workspace')
    
    const client = new OpenClawClient(profile.profile as any)
    return await client.applyConfig(request.config, traceId)
  }
  
  private static async executeRunTool(_workspaceId: string, _request: any, _traceId: string) {
    // 实现工具执行逻辑
    throw new Error('RUN_TOOL not implemented yet')
  }
  
  private static async executeSyncState(_workspaceId: string, _request: any, _traceId: string) {
    // 实现状态同步逻辑
    throw new Error('SYNC_STATE not implemented yet')
  }
  
  private static async executeRotateToken(_workspaceId: string, _request: any, _traceId: string) {
    // 实现 token 轮换逻辑
    throw new Error('ROTATE_TOKEN not implemented yet')
  }
  
  private static async executeCustom(_workspaceId: string, _request: any, _traceId: string) {
    // 实现自定义逻辑
    throw new Error('CUSTOM not implemented yet')
  }
  
  // 脱敏结果（移除敏感字段）
  private static sanitizeResult(result: any): any {
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
