// ============================================
// SoloForge Plugin System - Routes
// 插件管理 API 路由
// ============================================

import type { FastifyInstance } from 'fastify'
import { prisma } from '../services/api-shared'

export function registerPluginRoutes(fastify: FastifyInstance): void {
  // 获取所有插件
  fastify.get('/api/plugins', async (_request, reply) => {
    try {
      const plugins = await prisma.plugin.findMany({
        include: {
          instances: {
            where: { enabled: true },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      })
      return reply.send({ success: true, data: plugins })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 获取插件
  fastify.get('/api/plugins/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string }
      const plugin = await prisma.plugin.findUnique({
        where: { id },
        include: {
          instances: {
            orderBy: { order: 'asc' }
          }
        }
      })
      if (!plugin) {
        return reply.code(404).send({ success: false, error: 'Plugin not found' })
      }
      return reply.send({ success: true, data: plugin })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 创建插件
  fastify.post('/api/plugins', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>
      const { name, displayName, version, description, author, homepage, entryPoint, manifestJson, builtIn } = body

      if (!name || !displayName) {
        return reply.code(400).send({ success: false, error: 'name and displayName are required' })
      }

      // 检查名称唯一性
      const existing = await prisma.plugin.findUnique({ where: { name: String(name) } })
      if (existing) {
        return reply.code(409).send({ success: false, error: 'Plugin name already exists' })
      }

      const plugin = await prisma.plugin.create({
        data: {
          name: String(name),
          displayName: String(displayName),
          version: String(version || '1.0.0'),
          description: description ? String(description) : null,
          author: author ? String(author) : null,
          homepage: homepage ? String(homepage) : null,
          entryPoint: entryPoint ? String(entryPoint) : null,
          manifestJson: typeof manifestJson === 'string' ? manifestJson : JSON.stringify(manifestJson || {}),
          builtIn: Boolean(builtIn),
          enabled: true
        }
      })

      return reply.send({ success: true, data: plugin })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 更新插件
  fastify.put('/api/plugins/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = request.body as Record<string, unknown>

      const existing = await prisma.plugin.findUnique({ where: { id } })
      if (!existing) {
        return reply.code(404).send({ success: false, error: 'Plugin not found' })
      }

      // 内置插件不可删除
      if (existing.builtIn && body.enabled === false) {
        return reply.code(400).send({ success: false, error: 'Cannot disable built-in plugins' })
      }

      const plugin = await prisma.plugin.update({
        where: { id },
        data: {
          displayName: body.displayName ? String(body.displayName) : undefined,
          version: body.version ? String(body.version) : undefined,
          description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
          author: body.author !== undefined ? (body.author ? String(body.author) : null) : undefined,
          homepage: body.homepage !== undefined ? (body.homepage ? String(body.homepage) : null) : undefined,
          enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
          configJson: body.configJson ? (typeof body.configJson === 'string' ? body.configJson : JSON.stringify(body.configJson)) : undefined,
          manifestJson: body.manifestJson ? (typeof body.manifestJson === 'string' ? body.manifestJson : JSON.stringify(body.manifestJson)) : undefined,
          entryPoint: body.entryPoint !== undefined ? (body.entryPoint ? String(body.entryPoint) : null) : undefined
        }
      })

      return reply.send({ success: true, data: plugin })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 删除插件
  fastify.delete('/api/plugins/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      const existing = await prisma.plugin.findUnique({ where: { id } })
      if (!existing) {
        return reply.code(404).send({ success: false, error: 'Plugin not found' })
      }

      if (existing.builtIn) {
        return reply.code(400).send({ success: false, error: 'Cannot delete built-in plugins' })
      }

      await prisma.plugin.delete({ where: { id } })
      return reply.send({ success: true, data: { deleted: true } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 获取插件实例列表
  fastify.get('/api/plugins/:id/instances', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const instances = await prisma.pluginInstance.findMany({
        where: { pluginId: id },
        orderBy: { order: 'asc' }
      })
      return reply.send({ success: true, data: instances })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 创建插件实例
  fastify.post('/api/plugins/:id/instances', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = request.body as Record<string, unknown>
      const { name, configJson, order } = body

      if (!name) {
        return reply.code(400).send({ success: false, error: 'Instance name is required' })
      }

      const plugin = await prisma.plugin.findUnique({ where: { id } })
      if (!plugin) {
        return reply.code(404).send({ success: false, error: 'Plugin not found' })
      }

      const instance = await prisma.pluginInstance.create({
        data: {
          pluginId: id,
          name: String(name),
          configJson: configJson ? (typeof configJson === 'string' ? configJson : JSON.stringify(configJson)) : '{}',
          order: typeof order === 'number' ? order : 0,
          enabled: true
        }
      })

      return reply.send({ success: true, data: instance })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 更新插件实例
  fastify.put('/api/plugins/:pluginId/instances/:instanceId', async (request, reply) => {
    try {
      const { pluginId, instanceId } = request.params as { pluginId: string; instanceId: string }
      const body = request.body as Record<string, unknown>

      const existing = await prisma.pluginInstance.findUnique({ where: { id: instanceId } })
      if (!existing || existing.pluginId !== pluginId) {
        return reply.code(404).send({ success: false, error: 'Instance not found' })
      }

      const instance = await prisma.pluginInstance.update({
        where: { id: instanceId },
        data: {
          name: body.name ? String(body.name) : undefined,
          enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
          configJson: body.configJson ? (typeof body.configJson === 'string' ? body.configJson : JSON.stringify(body.configJson)) : undefined,
          order: typeof body.order === 'number' ? body.order : undefined
        }
      })

      return reply.send({ success: true, data: instance })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 删除插件实例
  fastify.delete('/api/plugins/:pluginId/instances/:instanceId', async (request, reply) => {
    try {
      const { pluginId, instanceId } = request.params as { pluginId: string; instanceId: string }

      const existing = await prisma.pluginInstance.findUnique({ where: { id: instanceId } })
      if (!existing || existing.pluginId !== pluginId) {
        return reply.code(404).send({ success: false, error: 'Instance not found' })
      }

      await prisma.pluginInstance.delete({ where: { id: instanceId } })
      return reply.send({ success: true, data: { deleted: true } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })

  // 获取启用的插件路由
  fastify.get('/api/plugins/routes', async (_request, reply) => {
    try {
      const plugins = await prisma.plugin.findMany({
        where: { enabled: true },
        include: {
          instances: {
            where: { enabled: true },
            orderBy: { order: 'asc' }
          }
        }
      })

      const routes = plugins.flatMap((plugin) => {
        const manifest = safeParseJson(plugin.manifestJson, {}) as Record<string, unknown>
        const pages: Array<{ path: string; component: string; title?: string }> = (manifest.pages as Array<{ path: string; component: string; title?: string }>) || []

        return pages.map(page => ({
          pluginId: plugin.id,
          pluginName: plugin.name,
          path: page.path,
          component: page.component,
          title: page.title,
          instanceId: plugin.instances[0]?.id || null
        }))
      })

      return reply.send({ success: true, data: routes })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ success: false, error: message })
    }
  })
}

// 安全解析 JSON
function safeParseJson(json: string, fallback: unknown): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}
