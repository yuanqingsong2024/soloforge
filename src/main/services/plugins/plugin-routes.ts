/**
 * 插件管理 API 路由
 * 
 * 提供插件的 CRUD 操作接口
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { 
  getAllPlugins, 
  getPlugin, 
  enablePlugin, 
  disablePlugin,
  getPluginConfig,
  updatePluginConfig,
  getPluginUI,
  getEnabledDashboardWidgets,
  invokePluginMethod,
  scanPluginDirectory
} from './plugin-core'
import { writeAuditLog } from '../audit-log-writer'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// Schema 验证
// ============================================

const pluginSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, '仅允许小写字母、数字和连字符'),
  displayName: z.string().min(1).max(128),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  configJson: z.record(z.string(), z.unknown()),
  manifestJson: z.record(z.string(), z.unknown()),
  entryPoint: z.string().optional()
})

const pluginConfigSchema = z.object({
  configJson: z.record(z.string(), z.unknown())
})

// ============================================
// 注册路由
// ============================================

export async function registerPluginRoutes(fastify: FastifyInstance): Promise<void> {
  
  // 获取所有插件
  fastify.get('/api/plugins', async () => {
    const dbPlugins = await prisma.plugin.findMany({
      orderBy: { createdAt: 'desc' }
    })
    
    // 合并注册表信息
    const plugins = dbPlugins.map(p => {
      const registered = getPlugin(p.name)
      return {
        ...p,
        isRegistered: Boolean(registered),
        config: registered ? getPluginConfig(p.id) : null
      }
    })
    
    return { success: true, data: plugins }
  })

  // 扫描插件目录
  fastify.post('/api/plugins/scan', async () => {
    const found = await scanPluginDirectory()

    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'PLUGIN_DIRECTORY_SCANNED',
      tool: 'plugin-routes',
      request: { pluginCount: found.length },
      response: { found }
    })

    return { success: true, data: { found } }
  })

  // 获取单个插件
  fastify.get('/api/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    
    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }
    
    const registered = getPlugin(plugin.name)
    const config = registered ? getPluginConfig(plugin.id) : null
    const ui = registered ? getPluginUI(plugin.name) : null
    
    return {
      success: true,
      data: { ...plugin, isRegistered: Boolean(registered), config, ui }
    }
  })

  // 创建插件
  fastify.post('/api/plugins', async (request, reply) => {
    const body = pluginSchema.safeParse(request.body)
    if (!body.success) {
      reply.code(400)
      return { success: false, error: body.error.message }
    }

    const { name, displayName, version, description, author, homepage, configJson, manifestJson, entryPoint } = body.data

    // 检查名称是否已存在
    const existing = await prisma.plugin.findUnique({ where: { name } })
    if (existing) {
      reply.code(409)
      return { success: false, error: '插件名称已存在' }
    }

    const traceId = uuidv4()
    const plugin = await prisma.plugin.create({
      data: {
        name,
        displayName,
        version: version || '1.0.0',
        description,
        author,
        homepage,
        configJson: JSON.stringify(configJson || {}),
        manifestJson: JSON.stringify(manifestJson || {}),
        entryPoint,
        builtIn: false
      }
    })

    await writeAuditLog({
      traceId,
      actor: 'user',
      action: 'PLUGIN_CREATED',
      tool: 'plugin-manager',
      request: { name, displayName, version },
      response: { pluginId: plugin.id }
    })

    return { success: true, data: plugin }
  })

  // 更新插件
  fastify.put('/api/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = pluginSchema.partial().safeParse(request.body)
    if (!body.success) {
      reply.code(400)
      return { success: false, error: body.error.message }
    }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    if (plugin.builtIn) {
      reply.code(403)
      return { success: false, error: '内置插件不可修改' }
    }

    const traceId = uuidv4()
    const updateData = body.data
    const updated = await prisma.plugin.update({
      where: { id },
      data: {
        displayName: updateData.displayName,
        version: updateData.version,
        description: updateData.description,
        author: updateData.author,
        homepage: updateData.homepage,
        configJson: updateData.configJson ? JSON.stringify(updateData.configJson) : undefined,
        manifestJson: updateData.manifestJson ? JSON.stringify(updateData.manifestJson) : undefined,
        entryPoint: updateData.entryPoint
      }
    })

    await writeAuditLog({
      traceId,
      actor: 'user',
      action: 'PLUGIN_UPDATED',
      tool: 'plugin-manager',
      request: { id, ...body.data },
      response: { pluginId: updated.id }
    })

    return { success: true, data: updated }
  })

  // 删除插件
  fastify.delete('/api/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    if (plugin.builtIn) {
      reply.code(403)
      return { success: false, error: '内置插件不可删除' }
    }

    const traceId = uuidv4()
    await prisma.plugin.delete({ where: { id } })

    await writeAuditLog({
      traceId,
      actor: 'user',
      action: 'PLUGIN_DELETED',
      tool: 'plugin-manager',
      request: { id, name: plugin.name },
      response: { deleted: true }
    })

    return { success: true, data: { deleted: true } }
  })

  // 启用插件
  fastify.post('/api/plugins/:id/enable', async (request, reply) => {
    const { id } = request.params as { id: string }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    try {
      await enablePlugin(id)
      
      const traceId = uuidv4()
      await writeAuditLog({
        traceId,
        actor: 'user',
        action: 'PLUGIN_ENABLED',
        tool: 'plugin-manager',
        request: { id },
        response: { success: true }
      })

      return { success: true, data: { enabled: true } }
    } catch (error) {
      reply.code(500)
      return { success: false, error: (error as Error).message }
    }
  })

  // 禁用插件
  fastify.post('/api/plugins/:id/disable', async (request, reply) => {
    const { id } = request.params as { id: string }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    try {
      await disablePlugin(id)
      
      const traceId = uuidv4()
      await writeAuditLog({
        traceId,
        actor: 'user',
        action: 'PLUGIN_DISABLED',
        tool: 'plugin-manager',
        request: { id },
        response: { success: true }
      })

      return { success: true, data: { enabled: false } }
    } catch (error) {
      reply.code(500)
      return { success: false, error: (error as Error).message }
    }
  })

  // 更新插件配置
  fastify.put('/api/plugins/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = pluginConfigSchema.safeParse(request.body)
    if (!body.success) {
      reply.code(400)
      return { success: false, error: body.error.message }
    }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    try {
      await updatePluginConfig(id, body.data.configJson)
      
      const traceId = uuidv4()
      await writeAuditLog({
        traceId,
        actor: 'user',
        action: 'PLUGIN_CONFIG_UPDATED',
        tool: 'plugin-manager',
        request: { id },
        response: { success: true }
      })

      return { success: true, data: { configJson: JSON.stringify(body.data.configJson) } }
    } catch (error) {
      reply.code(500)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取 Dashboard 挂件
  fastify.get('/api/plugins/widgets', async () => {
    const widgets = getEnabledDashboardWidgets()
    return { success: true, data: widgets }
  })

  // 获取已注册的插件列表（来自注册表）
  fastify.get('/api/plugins/registered', async () => {
    const plugins = getAllPlugins()
    return { success: true, data: plugins }
  })

  // 获取所有插件的动态路由（供前端注册到 React Router）
  fastify.get('/api/plugins/routes', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return { success: false, error: '缺少 workspaceId 参数' }
    }

    const routes: Array<{ path: string; component: string; pluginId: string; label: string }> = []

    // 从 DB 查询启用状态，避免修改 PluginInterface
    const dbPlugins = await prisma.plugin.findMany({
      where: { enabled: true },
      select: { id: true, name: true }
    })
    const enabledIds = new Set(dbPlugins.map(p => p.id))

    for (const plugin of getAllPlugins()) {
      if (!enabledIds.has(plugin.id)) continue

      const pluginInstance = getPlugin(plugin.id)
      if (!pluginInstance) continue

      if (pluginInstance.routes && typeof pluginInstance.routes === 'function') {
        const pluginRoutes = pluginInstance.routes()
        for (const route of pluginRoutes) {
          routes.push({
            path: `/plugins/${plugin.id}${route.path.startsWith('/') ? route.path : `/${route.path}`}`,
            component: route.component,
            pluginId: plugin.id,
            label: route.label || plugin.name
          })
        }
      }
    }

    return { success: true, data: routes }
  })

  // 调用插件方法
  fastify.post('/api/plugins/:id/invoke', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { method, args } = request.body as { method: string; args?: unknown[] }

    if (!method) {
      reply.code(400)
      return { success: false, error: '缺少 method 参数' }
    }

    try {
      const result = await invokePluginMethod(id, method, ...(args || []))
      return { success: true, data: result }
    } catch (error) {
      reply.code(500)
      return { success: false, error: (error as Error).message }
    }
  })

  // Plugin Instance CRUD
  fastify.get('/api/plugins/:id/instances', async (request) => {
    const { id } = request.params as { id: string }
    
    const instances = await prisma.pluginInstance.findMany({
      where: { pluginId: id },
      orderBy: { order: 'asc' }
    })
    
    return { success: true, data: instances }
  })

  fastify.post('/api/plugins/:id/instances', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, configJson, order } = request.body as { name: string; configJson?: Record<string, unknown>; order?: number }

    const plugin = await prisma.plugin.findUnique({ where: { id } })
    if (!plugin) {
      reply.code(404)
      return { success: false, error: '插件不存在' }
    }

    // 检查实例名称是否已存在
    const existing = await prisma.pluginInstance.findUnique({
      where: { pluginId_name: { pluginId: id, name } }
    })
    if (existing) {
      reply.code(409)
      return { success: false, error: '实例名称已存在' }
    }

    const instance = await prisma.pluginInstance.create({
      data: {
        pluginId: id,
        name,
        configJson: JSON.stringify(configJson || {}),
        order: order || 0
      }
    })

    return { success: true, data: instance }
  })

  fastify.delete('/api/plugins/:pluginId/instances/:instanceId', async (request, reply) => {
    const { instanceId } = request.params as { pluginId: string; instanceId: string }

    const instance = await prisma.pluginInstance.findUnique({ where: { id: instanceId } })
    if (!instance) {
      reply.code(404)
      return { success: false, error: '实例不存在' }
    }

    await prisma.pluginInstance.delete({ where: { id: instanceId } })
    return { success: true, data: { deleted: true } }
  })
}
