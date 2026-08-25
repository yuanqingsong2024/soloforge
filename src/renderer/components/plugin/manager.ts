// ============================================
// SoloForge Plugin System - Plugin Manager
// 插件管理器
// ============================================

import type { Plugin, PluginSystemAPI, PluginError } from './types'

/**
 * 插件管理器状态
 */
interface PluginManagerState {
  plugins: Map<string, Plugin>
  errors: PluginError[]
}

/**
 * 插件管理器类
 */
export class PluginManager {
  private state: PluginManagerState = {
    plugins: new Map(),
    errors: [],
  }

  /**
   * 获取插件列表
   */
  getPlugins(): Plugin[] {
    return Array.from(this.state.plugins.values())
  }

  /**
   * 获取单个插件
   */
  getPlugin(id: string): Plugin | undefined {
    return this.state.plugins.get(id)
  }

  /**
   * 获取插件错误
   */
  getErrors(): PluginError[] {
    return this.state.errors
  }

  /**
   * 注册插件
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    const pluginId = plugin.manifest.id

    try {
      // 检查是否已存在
      if (this.state.plugins.has(pluginId)) {
        console.warn(`[PluginManager] Plugin ${pluginId} already registered`)
        return
      }

      // 保存完整插件对象，确保生命周期钩子和扩展元数据不丢失
      this.state.plugins.set(pluginId, plugin)

      // 触发加载钩子
      if (plugin.hooks.onLoad) {
        await plugin.hooks.onLoad()
      }

      console.log(`[PluginManager] Plugin registered: ${pluginId} v${plugin.manifest.version}`)
    } catch (error) {
      this.state.plugins.delete(pluginId)
      const pluginError: PluginError = {
        code: 'LOAD_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        pluginId,
        details: error,
      }
      this.state.errors.push(pluginError)
      console.error(`[PluginManager] Failed to register plugin ${pluginId}:`, error)
    }
  }

  /**
   * 注销插件
   */
  async unregisterPlugin(id: string): Promise<void> {
    const plugin = this.state.plugins.get(id)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin ${id} not found`)
      return
    }

    try {
      // 触发卸载钩子
      if (plugin.hooks.onUnload) {
        await plugin.hooks.onUnload()
      }

      // 移除插件
      this.state.plugins.delete(id)
      console.log(`[PluginManager] Plugin unregistered: ${id}`)
    } catch (error) {
      console.error(`[PluginManager] Failed to unregister plugin ${id}:`, error)
    }
  }

  /**
   * 启用插件
   */
  async enablePlugin(id: string): Promise<void> {
    const plugin = this.state.plugins.get(id)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin ${id} not found`)
      return
    }

    plugin.enabled = true
    console.log(`[PluginManager] Plugin enabled: ${id}`)
  }

  /**
   * 禁用插件
   */
  async disablePlugin(id: string): Promise<void> {
    const plugin = this.state.plugins.get(id)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin ${id} not found`)
      return
    }

    plugin.enabled = false
    console.log(`[PluginManager] Plugin disabled: ${id}`)
  }

  /**
   * 更新插件配置
   */
  async updatePluginConfig(id: string, config: Record<string, unknown>): Promise<void> {
    const plugin = this.state.plugins.get(id)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin ${id} not found`)
      return
    }

    plugin.config = { ...plugin.config, ...config }
    console.log(`[PluginManager] Plugin config updated: ${id}`)
  }

  /**
   * 获取启用的插件
   */
  getEnabledPlugins(): Plugin[] {
    return this.getPlugins().filter(p => p.enabled)
  }

  /**
   * 获取所有插件的菜单项
   */
  getMenuItems(): Plugin['menuItems'] {
    return this.getEnabledPlugins().flatMap(p => p.menuItems || [])
  }

  /**
   * 获取所有插件的侧边栏项
   */
  getSidebarItems(): Plugin['sidebarItems'] {
    return this.getEnabledPlugins().flatMap(p => p.sidebarItems || [])
  }

  /**
   * 获取所有插件的页面
   */
  getPages(): Plugin['pages'] {
    return this.getEnabledPlugins().flatMap(p => p.pages || [])
  }

  /**
   * 清除错误
   */
  clearErrors(): void {
    this.state.errors = []
  }
}

// 单例实例
let pluginManagerInstance: PluginManager | null = null

/**
 * 获取插件管理器单例
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager()
  }
  return pluginManagerInstance
}

/**
 * 创建插件系统 API
 */
export function createPluginAPI(): PluginSystemAPI {
  const manager = getPluginManager()
  return {
    getPlugins: () => manager.getPlugins(),
    getPlugin: (id) => manager.getPlugin(id),
    updatePluginConfig: (id, config) => manager.updatePluginConfig(id, config),
    enablePlugin: (id) => manager.enablePlugin(id),
    disablePlugin: (id) => manager.disablePlugin(id),
    registerPlugin: (plugin) => manager.registerPlugin(plugin),
    unregisterPlugin: (id) => manager.unregisterPlugin(id),
  }
}
