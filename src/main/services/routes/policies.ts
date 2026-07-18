/**
 * Policies 路由模块
 *
 * 管理 Workspace Policy（Policy-as-Code）
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { ApprovalGuard } from '../approval-guard'
import { writeAuditLog } from '../audit-log-writer'
import { extractActor } from '../auth-context'

export function registerPoliciesRoutes(fastify: FastifyInstance): void {
  // GET /api/policies - 获取所有策略列表
  fastify.get('/api/policies', async (request) => {
    const actor = extractActor(request)
    const { workspaceId } = request.query as { workspaceId?: string }
    
    const policies = await prisma.workspacePolicy.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: { workspace: true },
      orderBy: { createdAt: 'desc' }
    })
    
    await writeAuditLog({
      workspaceId: actor.workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'POLICY_LIST',
      tool: 'policies',
      request: { workspaceId },
      response: { count: policies.length }
    })
    
    return policies
  })

  // GET /api/policies/:id - 获取单个策略
  fastify.get('/api/policies/:id', async (request, reply) => {
    const actor = extractActor(request)
    const { id } = request.params as { id: string }
    
    const policy = await prisma.workspacePolicy.findUnique({
      where: { id },
      include: { workspace: true }
    })
    
    if (!policy) {
      await writeAuditLog({
        workspaceId: actor.workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'POLICY_GET',
        tool: 'policies',
        request: { id },
        response: { success: false, error: 'not_found' }
      })
      reply.code(404)
      return { error: 'Policy not found' }
    }
    
    return policy
  })

  // POST /api/policies - 创建策略
  fastify.post('/api/policies', async (request, reply) => {
    const actor = extractActor(request)
    const { workspaceId, policyJson } = request.body as { workspaceId: string; policyJson: string }
    
    // 校验 JSON 格式
    try {
      JSON.parse(policyJson)
    } catch {
      reply.code(400)
      return { success: false, error: 'Invalid JSON format' }
    }
    
    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_POLICY',
      { workspaceId, policyJson },
      actor.userId,
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
      await writeAuditLog({
        workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'POLICY_CREATE_PENDING',
        tool: 'policies',
        request: { workspaceId },
        response: { approvalId: approvalResult.approvalId }
      })
      return { message: 'Approval required', approvalId: approvalResult.approvalId }
    }
    
    return approvalResult.result
  })

  // PATCH /api/policies/:id - 更新策略
  fastify.patch('/api/policies/:id', async (request, reply) => {
    const actor = extractActor(request)
    const { id } = request.params as { id: string }
    const { policyJson } = request.body as { policyJson: string }
    
    // 校验 JSON 格式
    try {
      JSON.parse(policyJson)
    } catch {
      reply.code(400)
      return { success: false, error: 'Invalid JSON format' }
    }
    
    const existing = await prisma.workspacePolicy.findUnique({ where: { id } })
    if (!existing) {
      reply.code(404)
      return { success: false, error: 'Policy not found' }
    }
    
    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_POLICY',
      { policyId: id, policyJson },
      actor.userId,
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

  // POST /api/policies/:id/validate - 验证策略 JSON
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
    } catch (e: unknown) {
      return {
        valid: false,
        errors: [e instanceof Error ? e.message : String(e)]
      }
    }
  })
}
