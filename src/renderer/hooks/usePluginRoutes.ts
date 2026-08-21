// ============================================
// SoloForge Plugin System - Dynamic Routes Hook
// 插件动态路由 Hook
// ============================================

import { useEffect, useState, useCallback } from 'react'
import { apiFetch, ApiResponse } from '../lib/api'
import type { PluginPage } from '../components/plugin/types'

interface PluginRouteInfo {
  pluginId: string
  pluginName: string
  path: string
  component: string
  title?: string
  instanceId: string | null
}

/**
 * 获取插件动态路由
 */
async function fetchPluginRoutes(): Promise<PluginRouteInfo[]> {
  try {
    const response = await apiFetch<ApiResponse<PluginRouteInfo[]>>('/api/plugins/routes')
    if (!response.success) {
      console.error('[usePluginRoutes] Failed to fetch routes:', response.error)
      return []
    }
    return response.data || []
  } catch (error) {
    console.error('[usePluginRoutes] Error fetching routes:', error)
    return []
  }
}

/**
 * 加载插件页面组件
 */
async function loadPluginComponent(componentPath: string): Promise<React.ComponentType | null> {
  try {
    // 动态导入插件组件
    const module = await import(/* @vite-ignore */ componentPath)
    return module.default || module
  } catch (error) {
    console.error(`[usePluginRoutes] Failed to load component: ${componentPath}`, error)
    return null
  }
}

/**
 * 插件动态路由 Hook
 */
export function usePluginRoutes() {
  const [routes, setRoutes] = useState<PluginRouteInfo[]>([])
  const [loadedComponents, setLoadedComponents] = useState<Map<string, React.ComponentType>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 加载路由
  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const pluginRoutes = await fetchPluginRoutes()
      setRoutes(pluginRoutes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugin routes')
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    void loadRoutes()
  }, [loadRoutes])

  // 加载指定路由的组件
  const loadComponent = useCallback(async (route: PluginRouteInfo): Promise<React.ComponentType | null> => {
    if (loadedComponents.has(route.path)) {
      return loadedComponents.get(route.path) || null
    }

    const component = await loadPluginComponent(route.component)
    if (component) {
      setLoadedComponents(prev => new Map(prev).set(route.path, component))
    }
    return component
  }, [loadedComponents])

  // 获取已加载的页面
  const getPage = useCallback(async (path: string): Promise<{
    component: React.ComponentType | null
    route: PluginRouteInfo | null
  }> => {
    const route = routes.find(r => r.path === path)
    if (!route) {
      return { component: null, route: null }
    }

    const component = await loadComponent(route)
    return { component, route }
  }, [routes, loadComponent])

  // 获取所有启用的插件页面
  const getPluginPages = useCallback((): PluginPage[] => {
    return routes.map(route => ({
      id: route.pluginId,
      path: route.path,
      title: route.title,
      // 组件需要通过 loadComponent 动态加载
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component: (() => null) as unknown as React.ComponentType
    }))
  }, [routes])

  return {
    routes,
    loadedComponents,
    loading,
    error,
    loadRoutes,
    loadComponent,
    getPage,
    getPluginPages
  }
}

/**
 * 插件路由配置 Hook - 供 App.tsx 使用
 */
export function usePluginRouteConfig() {
  const { routes, loading, error, loadRoutes } = usePluginRoutes()
  const [refreshKey, setRefreshKey] = useState(0)

  // 刷新路由
  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
    void loadRoutes()
  }, [loadRoutes])

  // 获取路由配置（用于 react-router-dom）
  const getRouteConfig = useCallback(() => {
    return routes.map(route => ({
      path: route.path,
      pluginId: route.pluginId,
      pluginName: route.pluginName,
      title: route.title,
      instanceId: route.instanceId
    }))
  }, [routes])

  return {
    routes,
    routeConfig: getRouteConfig(),
    loading,
    error,
    refresh,
    refreshKey
  }
}
