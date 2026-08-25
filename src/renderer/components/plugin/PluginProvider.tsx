// ============================================
// SoloForge Plugin System - Provider
// 插件提供者组件
// ============================================

import { useEffect, useState } from 'react'
import { PluginContext } from './context'
import { createPluginAPI } from './manager'
import type { Plugin, PluginSystemAPI } from './types'

/**
 * 插件提供者属性
 */
export interface PluginProviderProps {
  children: React.ReactNode
  /** 初始插件列表 */
  initialPlugins?: Plugin[]
}

/**
 * 插件提供者组件
 */
export function PluginProvider({ children, initialPlugins = [] }: PluginProviderProps) {
  const [api] = useState<PluginSystemAPI>(() => createPluginAPI())

  // 注册初始插件
  useEffect(() => {
    const registerInitialPlugins = async () => {
      for (const plugin of initialPlugins) {
        try {
          await api.registerPlugin(plugin)
        } catch (error) {
          console.error(`[PluginProvider] Failed to register initial plugin ${plugin.manifest.id}:`, error)
        }
      }
    }

    registerInitialPlugins()
  }, [])

  return (
    <PluginContext.Provider value={api}>
      {children}
    </PluginContext.Provider>
  )
}

/**
 * 插件开发者工具提示组件
 */
export function PluginDevTools() {
  const [showDevTools, setShowDevTools] = useState(false)

  // 开发模式下显示插件开发工具
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setShowDevTools(!showDevTools)}
        className="rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] shadow-lg hover:opacity-90"
        data-testid="plugin-dev-tools-toggle"
      >
        插件开发工具
      </button>

      {showDevTools && (
        <div className="mt-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl w-80">
          <h3 className="font-semibold text-[hsl(var(--foreground))]">已加载的插件</h3>
          <div className="mt-2 space-y-2 text-sm">
            <PluginList />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 插件列表组件
 */
function PluginList() {
  const api = createPluginAPI()
  const plugins = api.getPlugins()

  if (plugins.length === 0) {
    return <p className="text-[hsl(var(--muted-foreground))]">暂无加载的插件</p>
  }

  return (
    <ul className="space-y-2">
      {plugins.map(plugin => (
        <li key={plugin.instanceId} className="flex items-center justify-between rounded bg-[hsl(var(--muted))] p-2">
          <div>
            <p className="font-medium">{plugin.manifest.name}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">v{plugin.manifest.version}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${plugin.enabled ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'}`}>
            {plugin.enabled ? '已启用' : '已禁用'}
          </span>
        </li>
      ))}
    </ul>
  )
}
