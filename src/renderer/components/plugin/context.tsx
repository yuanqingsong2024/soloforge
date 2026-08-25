// ============================================
// SoloForge Plugin System - Context
// 插件上下文
// ============================================

import { createContext, useContext } from 'react'
import type { Plugin, PluginSystemAPI } from './types'

/**
 * 默认的空插件系统 API
 */
const defaultPluginAPI: PluginSystemAPI = {
  getPlugins: () => [],
  getPlugin: () => undefined,
  updatePluginConfig: async () => {},
  enablePlugin: async () => {},
  disablePlugin: async () => {},
  registerPlugin: async () => {},
  unregisterPlugin: async () => {},
}

/**
 * 插件系统上下文
 */
export const PluginContext = createContext<PluginSystemAPI>(defaultPluginAPI)

/**
 * 使用插件系统 API
 */
export function usePlugins(): PluginSystemAPI {
  return useContext(PluginContext)
}

/**
 * 使用已加载的插件列表
 */
export function usePluginList(): Plugin[] {
  const api = usePlugins()
  return api.getPlugins()
}

/**
 * 使用单个插件
 */
export function usePlugin(id: string): Plugin | undefined {
  const api = usePlugins()
  return api.getPlugin(id)
}

/**
 * 插件是否启用
 */
export function usePluginEnabled(id: string): boolean {
  const plugin = usePlugin(id)
  return plugin?.enabled ?? false
}
