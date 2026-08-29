/**
 * 插件系统核心模块
 * 
 * 职责：
 * 1. 定义插件接口和类型
 * 2. 管理插件生命周期（加载、启用、禁用、卸载）
 * 3. 提供插件注册表
 * 4. 处理插件配置和实例化
 * 
 * 设计约束：
 * - 插件必须通过 registerPlugin() 注册
 * - 插件必须实现 PluginInterface
 * - 插件实例与数据库 PluginInstance 表同步
 */

import { prisma } from '../db'
import { logger } from '../logger'
import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'

const PLUGIN_DIR = path.join(process.cwd(), 'plugins')

// ============================================
// 类型定义
// ============================================

/** 插件生命周期钩子 */
export interface PluginLifecycle {
  onLoad?: () => Promise<void> | void
  onEnable?: () => Promise<void> | void
  onDisable?: () => Promise<void> | void
  onUninstall?: () => Promise<void> | void
}

/** 插件提供的 UI 组件 */
export interface PluginUI {
  /** 侧边栏菜单项 */
  sidebarItem?: {
    path: string
    label: string
    icon?: React.ReactNode
  }
  /** Dashboard 挂件 */
  dashboardWidget?: {
    id: string
    title: string
    component: React.ComponentType<WidgetProps>
    size?: 'small' | 'medium' | 'large'
  }
  /** 设置面板 */
  settingsPanel?: {
    id: string
    title: string
    component: React.ComponentType
  }
}

/** 插件提供的动态路由 */
export interface PluginRoute {
  /** 路由路径（相对于 /plugins/:pluginId/） */
  path: string
  /** React 组件名称（在插件 build 输出中） */
  component: string
  /** 路由显示名称 */
  label?: string
}

/** 插件接口 */
export interface PluginInterface {
  /** 插件唯一标识 */
  id: string
  /** 插件显示名称 */
  name: string
  /** 插件版本 */
  version: string
  /** 插件描述 */
  description?: string
  /** 作者 */
  author?: string
  /** 插件依赖 */
  dependencies?: string[]
  /** 生命周期钩子 */
  lifecycle?: PluginLifecycle
  /** UI 组件 */
  ui?: PluginUI
  /** 插件方法 */
  methods?: Record<string, (...args: unknown[]) => unknown>
  /** 动态路由（供前端注册到 React Router） */
  routes?: () => PluginRoute[]
}

/** 挂件属性 */
export interface WidgetProps {
  workspaceId: string
  onRefresh?: () => void
}

/** 插件注册表项 */
interface RegisteredPlugin {
  manifest: PluginInterface
  instance?: {
    id: string
    pluginId: string
    name: string
    enabled: boolean
    configJson: string
    order: number
    createdAt: Date
    updatedAt: Date
  }
}

// ============================================
// 插件注册表
// ============================================

const pluginRegistry = new Map<string, RegisteredPlugin>()

// ============================================
// 核心 API
// ============================================

/**
 * 注册插件到系统
 */
export function registerPlugin(plugin: PluginInterface): void {
  if (pluginRegistry.has(plugin.id)) {
    logger.warn(`[Plugin] 插件 ${plugin.id} 已存在，将被覆盖`)
  }
  pluginRegistry.set(plugin.id, { manifest: plugin })
  logger.info(`[Plugin] 注册插件: ${plugin.id} v${plugin.version}`)
}

/**
 * 获取已注册的插件
 */
export function getPlugin(id: string): PluginInterface | undefined {
  return pluginRegistry.get(id)?.manifest
}

/**
 * 获取所有已注册的插件
 */
export function getAllPlugins(): PluginInterface[] {
  return Array.from(pluginRegistry.values()).map(p => p.manifest)
}

/**
 * 启用插件
 */
export async function enablePlugin(id: string): Promise<void> {
  const plugin = pluginRegistry.get(id)
  if (!plugin) {
    throw new Error(`插件 ${id} 不存在`)
  }

  // 调用插件的 onEnable 钩子
  if (plugin.manifest.lifecycle?.onEnable) {
    await plugin.manifest.lifecycle.onEnable()
  }

  // 更新数据库
  await prisma.plugin.update({
    where: { id },
    data: { enabled: true }
  })

  logger.info(`[Plugin] 启用插件: ${id}`)
}

/**
 * 禁用插件
 */
export async function disablePlugin(id: string): Promise<void> {
  const plugin = pluginRegistry.get(id)
  if (!plugin) {
    throw new Error(`插件 ${id} 不存在`)
  }

  // 调用插件的 onDisable 钩子
  if (plugin.manifest.lifecycle?.onDisable) {
    await plugin.manifest.lifecycle.onDisable()
  }

  // 更新数据库
  await prisma.plugin.update({
    where: { id },
    data: { enabled: false }
  })

  logger.info(`[Plugin] 禁用插件: ${id}`)
}

/**
 * 加载所有已启用的插件
 */
export async function loadPlugins(): Promise<void> {
  logger.info('[Plugin] 开始加载插件...')

  // 从数据库获取所有已启用的插件
  const dbPlugins = await prisma.plugin.findMany({
    where: { enabled: true },
    include: { instances: true }
  })

  for (const dbPlugin of dbPlugins) {
    const plugin = pluginRegistry.get(dbPlugin.name)
    if (plugin) {
      // 取第一个实例（如果有的话）
      const firstInstance = dbPlugin.instances?.[0]
      plugin.instance = firstInstance ? {
        id: firstInstance.id,
        pluginId: firstInstance.pluginId,
        name: firstInstance.name,
        enabled: firstInstance.enabled,
        configJson: firstInstance.configJson || '{}',
        order: firstInstance.order,
        createdAt: firstInstance.createdAt,
        updatedAt: firstInstance.updatedAt
      } : undefined
      // 调用 onLoad 钩子
      if (plugin.manifest.lifecycle?.onLoad) {
        try {
          await plugin.manifest.lifecycle.onLoad()
        } catch (err) {
          logger.error(`[Plugin] 插件 ${dbPlugin.name} onLoad 失败:`, err instanceof Error ? err.message : String(err))
        }
      }
    } else {
      logger.warn(`[Plugin] 数据库中的插件 ${dbPlugin.name} 未注册，已跳过`)
    }
  }

  logger.info(`[Plugin] 插件加载完成，共 ${pluginRegistry.size} 个插件`)
}

/**
 * 调用插件方法
 */
export async function invokePluginMethod<T = unknown>(
  pluginId: string,
  method: string,
  ...args: unknown[]
): Promise<T> {
  const plugin = pluginRegistry.get(pluginId)
  if (!plugin) {
    throw new Error(`插件 ${pluginId} 不存在`)
  }

  const methodFn = plugin.manifest.methods?.[method]
  if (!methodFn) {
    throw new Error(`插件 ${pluginId} 没有方法 ${method}`)
  }

  return await methodFn(...args) as T
}

/**
 * 获取插件配置
 */
export function getPluginConfig(pluginId: string): Record<string, unknown> {
  const plugin = pluginRegistry.get(pluginId)
  if (!plugin?.instance) {
    return {}
  }
  try {
    return JSON.parse(plugin.instance.configJson || '{}')
  } catch {
    return {}
  }
}

/**
 * 更新插件配置
 */
export async function updatePluginConfig(
  pluginId: string,
  config: Record<string, unknown>
): Promise<void> {
  const plugin = pluginRegistry.get(pluginId)
  if (!plugin?.instance) {
    throw new Error(`插件 ${pluginId} 未加载`)
  }

  await prisma.plugin.update({
    where: { id: pluginId },
    data: { configJson: JSON.stringify(config) }
  })

  plugin.instance.configJson = JSON.stringify(config)
}

/**
 * 获取插件的 UI 配置
 */
export function getPluginUI(pluginId: string): PluginUI | undefined {
  return pluginRegistry.get(pluginId)?.manifest.ui
}

/**
 * 获取所有启用的插件的 Dashboard 挂件
 */
export function getEnabledDashboardWidgets(): NonNullable<PluginUI['dashboardWidget']>[] {
  const widgets: NonNullable<PluginUI['dashboardWidget']>[] = []
  
  for (const plugin of pluginRegistry.values()) {
    if (plugin.manifest.ui?.dashboardWidget) {
      widgets.push(plugin.manifest.ui.dashboardWidget)
    }
  }

  return widgets
}

// ============================================
// 动态文件系统加载器
// ============================================

/**
 * 扫描插件目录，发现并加载插件
 */
export async function scanPluginDirectory(): Promise<string[]> {
  const found: string[] = []

  if (!existsSync(PLUGIN_DIR)) {
    logger.info('[Plugin] 插件目录不存在，跳过扫描')
    return found
  }

  try {
    const entries = await fs.readdir(PLUGIN_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const pluginPath = path.join(PLUGIN_DIR, entry.name)
      const manifestPath = path.join(pluginPath, 'manifest.json')

      if (existsSync(manifestPath)) {
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8')
          const manifest = JSON.parse(manifestContent) as PluginInterface

          if (manifest.id && manifest.name && manifest.version) {
            found.push(manifest.id)
            logger.info(`[Plugin] 发现插件: ${manifest.id} v${manifest.version}`)
          }
        } catch {
          logger.warn(`[Plugin] 跳过无效插件目录: ${entry.name}`)
        }
      }
    }
  } catch (err) {
    logger.error('[Plugin] 扫描插件目录失败', 'plugin-core', err instanceof Error ? err : new Error(String(err)))
  }

  return found
}

/**
 * 从文件系统加载单个插件
 */
export async function loadPluginFromDisk(pluginId: string): Promise<PluginInterface | null> {
  const pluginPath = path.join(PLUGIN_DIR, pluginId)
  const manifestPath = path.join(pluginPath, 'manifest.json')

  if (!existsSync(manifestPath)) {
    return null
  }

  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent) as PluginInterface

    // 验证必需字段
    if (!manifest.id || !manifest.name || !manifest.version) {
      logger.warn(`[Plugin] 插件 ${pluginId} 清单缺少必需字段`)
      return null
    }

    return manifest
  } catch (err) {
    logger.error(`[Plugin] 加载插件 ${pluginId} 失败`, 'plugin-core', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

// ============================================
// 插件开发辅助
// ============================================

/**
 * 创建插件构建器
 */
export function createPlugin(manifest: Omit<PluginInterface, 'id'> & { id: string }): PluginInterface {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    dependencies: manifest.dependencies,
    lifecycle: manifest.lifecycle,
    ui: manifest.ui,
    methods: manifest.methods
  }
}

/**
 * 声明插件（用于静态分析）
 */
export function declarePlugin(manifest: PluginInterface): void {
  registerPlugin(manifest)
}
