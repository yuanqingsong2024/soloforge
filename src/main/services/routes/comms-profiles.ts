/**
 * Comms Profiles 路由模块 - 通讯配置管理
 */

import { type FastifyInstance } from 'fastify'
import { prisma } from '../api-shared'

// ==================== 类型定义 ====================

interface CreateCommsProfileBody {
  name: string
  provider: 'claude-code' | 'webhook'
  claudeCodeProfileId?: string
  enabled?: boolean
}

interface UpdateCommsProfileBody {
  name?: string
  provider?: 'claude-code' | 'webhook'
  claudeCodeProfileId?: string | null
  enabled?: boolean
}

// ==================== 路由注册 ====================

export function registerCommsProfilesRoutes(fastify: FastifyInstance): void {
  // 获取通讯配置列表
  fastify.get('/api/comms/profiles', async () => {
    return await prisma.commsProfile.findMany({
      include: {
        claudeCodeProfile: true,
        targets: true
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  // 创建通讯配置
  fastify.post('/api/comms/profiles', async (request) => {
    const body = request.body as CreateCommsProfileBody
    return await prisma.commsProfile.create({
      data: {
        name: body.name,
        provider: body.provider,
        claudeCodeProfileId: body.claudeCodeProfileId || null,
        enabled: body.enabled ?? true
      }
    })
  })

  // 更新通讯配置
  fastify.put('/api/comms/profiles/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as UpdateCommsProfileBody
    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.provider !== undefined) updateData.provider = body.provider
    if (body.claudeCodeProfileId !== undefined) updateData.claudeCodeProfileId = body.claudeCodeProfileId
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    return await prisma.commsProfile.update({
      where: { id },
      data: updateData
    })
  })

  // 删除通讯配置
  fastify.delete('/api/comms/profiles/:id', async (request) => {
    const { id } = request.params as { id: string }
    return await prisma.commsProfile.delete({ where: { id } })
  })
}
