/**
 * Deployment Targets 路由模块
 *
 * 管理部署目标（DeploymentTarget）和部署作业（DeploymentJob）
 */

import { type Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import type { FastifyInstance } from 'fastify'
import { prisma, safeParseJson, emitApiEvent } from '../api-shared'
import { ApprovalGuard } from '../approval-guard'
import { HostAgentService } from '../host-agent-service'
import { DeploymentTemplateFactory } from '../deployment-templates'
import { writeAuditLog } from '../audit-log-writer'

interface CreateDeploymentTargetBody {
  workspaceId: string
  name: string
  targetType: 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
  connectionMode?: 'LOCAL' | 'SSH' | 'TAILSCALE' | 'DIRECT_WS' | 'REVERSE_PROXY'
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

export function registerDeploymentRoutes(fastify: FastifyInstance): void {
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
        connectionMode: body.connectionMode || 'LOCAL',
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

    await writeAuditLog({
      workspaceId: body.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_CREATE',
      tool: 'deployment',
      request: body,
      response: target
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

    await writeAuditLog({
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_UPDATE',
      tool: 'deployment',
      request: { id, ...body },
      response: target
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

    await writeAuditLog({
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_TARGET_DELETE',
      tool: 'deployment',
      request: { id },
      response: approvalResult.result
    })

    return approvalResult.result
  })

  // 获取部署作业列表
  fastify.get('/api/deployment-jobs', async (request) => {
    const { workspaceId, targetId } = request.query as { workspaceId?: string; targetId?: string }
    const where: Prisma.DeploymentJobWhereInput = {}
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

  // 创建部署作业（需审批）
  fastify.post('/api/deployment-jobs', async (request, reply) => {
    const body = request.body as CreateDeploymentJobBody
    const traceId = uuidv4()
    const actor = 'admin'

    const target = await prisma.deploymentTarget.findUnique({ where: { id: body.targetId } })
    if (!target) {
      reply.code(404)
      return { success: false, error: '部署目标不存在' }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'DEPLOY_PROD',
      { targetId: body.targetId, targetName: target.name, workspaceId: body.workspaceId },
      actor,
      async () => {
        return await prisma.deploymentJob.create({
          data: {
            workspaceId: body.workspaceId,
            targetId: body.targetId,
            type: body.type,
            traceId,
            requestJson: JSON.stringify(body.requestJson),
            status: 'PENDING'
          }
        })
      }
    )

    if (approvalResult.needsApproval) {
      return { status: 'pending_approval', approvalId: approvalResult.approvalId }
    }

    const job = approvalResult.result
    if (!job) {
      reply.code(500)
      return { success: false, error: '创建部署作业失败：审批流程异常' }
    }

    await writeAuditLog({
      workspaceId: body.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_JOB_CREATE',
      tool: 'deployment',
      request: body,
      response: job
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

    const template = DeploymentTemplateFactory.getTemplate(target.targetType as 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER')

    const result = await template.precheck()

    await writeAuditLog({
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_PRECHECK',
      tool: 'deployment',
      request: { targetId: id },
      response: result
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

    const template = DeploymentTemplateFactory.getTemplate(target.targetType as 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER')

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

  // 服务控制操作：start / stop / restart / upgrade
  for (const action of ['start', 'stop', 'restart', 'upgrade'] as const) {
    fastify.post(`/api/deployment-targets/:id/${action}`, async (request, reply) => {
      const { id } = request.params as { id: string }
      const traceId = uuidv4()
      const actor = 'admin'

      const target = await prisma.deploymentTarget.findUnique({ where: { id } })
      if (!target) {
        reply.code(404)
        return { success: false, error: '部署目标不存在' }
      }

      const approvalResult = await ApprovalGuard.executeProtected(
        'DEPLOY_PROD',
        { targetId: id, targetName: target.name, action },
        actor,
        async () => {
          const boundAgent = await prisma.hostAgent.findFirst({
            where: { workspaceId: target.workspaceId, targetId: id, status: 'ONLINE' },
            orderBy: { updatedAt: 'desc' }
          })

          if (boundAgent) {
            // HostAgent 仅支持 RESTART_GATEWAY；start/stop 由 DeploymentTemplate 处理
            if (action !== 'restart') {
              return { success: false, message: `${action} 操作需要通过部署模板路径执行` }
            }
            const actionResult = await HostAgentService.runActionAndWait({
              workspaceId: target.workspaceId,
              targetId: id,
              hostAgentId: boundAgent.id,
              actionType: 'RESTART_GATEWAY',
              request: {},
              actor,
              traceId,
              timeoutSeconds: 120
            }, 120_000)

            return { success: actionResult?.status === 'SUCCEEDED', result: actionResult }
          }

          const template = DeploymentTemplateFactory.getTemplate(
            target.targetType as 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
          )

          switch (action) {
            case 'start': return await template.start({})
            case 'stop': return await template.stop({})
            case 'restart': return template.restart ? await template.restart({}) : { success: false, message: '此目标类型不支持 restart' }
            case 'upgrade': return template.upgrade ? await template.upgrade({ version: 'latest' }) : { success: false, message: '此目标类型不支持 upgrade' }
          }
        }
      )

      if (approvalResult.needsApproval) {
        return { status: 'pending_approval', approvalId: approvalResult.approvalId }
      }

      await writeAuditLog({
        workspaceId: target.workspaceId,
        traceId,
        actor,
        action: `DEPLOYMENT_TARGET_${action.toUpperCase()}`,
        tool: 'deployment',
        request: { targetId: id, action },
        response: approvalResult.result
      })

      return { status: 'ok', ...approvalResult.result }
    })
  }

  // 安装部署
  fastify.post('/api/deployment-targets/:id/install', async (request, reply) => {
    const { id } = request.params as { id: string }
    const traceId = uuidv4()
    const actor = 'admin'

    const target = await prisma.deploymentTarget.findUnique({ where: { id } })
    if (!target) {
      reply.code(404)
      return { success: false, error: '部署目标不存在' }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'DEPLOY_PROD',
      { targetId: id, targetName: target.name, action: 'install' },
      actor,
      async () => {
        const job = await prisma.deploymentJob.create({
          data: {
            workspaceId: target.workspaceId,
            targetId: id,
            type: 'INSTALL',
            traceId,
            requestJson: JSON.stringify({}),
            status: 'PENDING'
          }
        })

        await emitApiEvent({
          workspaceId: target.workspaceId,
          targetId: id,
          sourceType: 'DEPLOYMENT_JOB',
          sourceId: job.id,
          eventType: 'DEPLOYMENT_STARTED',
          severity: 'INFO',
          title: '部署作业已创建',
          summary: `目标 ${target.name} 安装作业已进入队列`,
          payload: job,
          traceId
        })

        return { jobId: job.id, status: job.status }
      }
    )

    if (approvalResult.needsApproval) {
      return { status: 'pending_approval', approvalId: approvalResult.approvalId }
    }

    await writeAuditLog({
      workspaceId: target.workspaceId,
      traceId,
      actor,
      action: 'DEPLOYMENT_INSTALL',
      tool: 'deployment',
      request: { targetId: id },
      response: approvalResult.result
    })

    return { status: 'ok', ...approvalResult.result }
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
          logPath: target.targetType.includes('DOCKER') ? '/var/log/claude-code/gateway.log' : '/var/log/claude-code/gateway.log',
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

    const template = DeploymentTemplateFactory.getTemplate(target.targetType as 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER')

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
}
