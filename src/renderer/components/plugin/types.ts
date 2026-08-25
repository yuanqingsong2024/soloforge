// ============================================
// SoloForge Plugin System - Type Definitions
// 插件系统类型定义
// ============================================

import type { ReactNode } from 'react'

/**
 * 插件生命周期钩子
 */
export interface PluginHooks {
  /** 插件加载时调用 */
  onLoad?: () => void | Promise<void>
  /** 插件卸载时调用 */
  onUnload?: () => void | Promise<void>
  /** 应用初始化完成 */
  onAppReady?: () => void | Promise<void>
}

/**
 * 插件提供的菜单项
 */
export interface PluginMenuItem {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 图标（可选） */
  icon?: ReactNode
  /** 路径 */
  path: string
  /** 排序权重（越小越靠前） */
  order?: number
}

/**
 * 插件提供的侧边栏菜单
 */
export interface PluginSidebarItem {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 图标（可选） */
  icon?: ReactNode
  /** 子菜单项 */
  items?: PluginMenuItem[]
  /** 路径（如果是独立菜单） */
  path?: string
  /** 排序权重 */
  order?: number
}

/**
 * 插件提供的页面组件
 */
export interface PluginPage {
  /** 唯一标识 */
  id: string
  /** 页面路径 */
  path: string
  /** 页面组件 */
  component: React.ComponentType
  /** 页面标题 */
  title?: string
}

/**
 * 插件提供的 API 扩展
 */
export interface PluginAPI {
  /** 自定义 API 端点 */
  endpoints?: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    path: string
    handler: (request: unknown) => Promise<unknown>
  }>
}

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 配置项定义 */
  fields: Array<{
    key: string
    label: string
    type: 'string' | 'number' | 'boolean' | 'select'
    default?: unknown
    options?: Array<{ label: string; value: unknown }>
  }>
}

/**
 * 插件清单（manifest）
 */
export interface PluginManifest {
  /** 插件唯一标识 */
  id: string
  /** 插件名称 */
  name: string
  /** 插件版本 */
  version: string
  /** 插件描述 */
  description?: string
  /** 作者 */
  author?: string
  /** 插件入口文件 */
  main: string
}

/**
 * 插件实例
 */
export interface Plugin {
  /** 插件清单 */
  manifest: PluginManifest
  /** 插件实例 ID */
  instanceId: string
  /** 是否启用 */
  enabled: boolean
  /** 插件配置 */
  config: Record<string, unknown>
  /** 钩子函数 */
  hooks: PluginHooks
  /** 提供的菜单 */
  menuItems?: PluginMenuItem[]
  /** 提供的侧边栏 */
  sidebarItems?: PluginSidebarItem[]
  /** 提供的页面 */
  pages?: PluginPage[]
  /** 提供的 API */
  api?: PluginAPI
  /** 插件配置定义 */
  configSchema?: PluginConfig
}

/**
 * 插件系统 API（暴露给插件）
 */
export interface PluginSystemAPI {
  /** 获取已加载的插件列表 */
  getPlugins: () => Plugin[]
  /** 获取单个插件 */
  getPlugin: (id: string) => Plugin | undefined
  /** 更新插件配置 */
  updatePluginConfig: (id: string, config: Record<string, unknown>) => Promise<void>
  /** 启用插件 */
  enablePlugin: (id: string) => Promise<void>
  /** 禁用插件 */
  disablePlugin: (id: string) => Promise<void>
  /** 注册新插件（仅开发模式） */
  registerPlugin: (plugin: Plugin) => Promise<void>
  /** 注销插件 */
  unregisterPlugin: (id: string) => Promise<void>
}

/**
 * 插件错误类型
 */
export interface PluginError {
  code: 'LOAD_ERROR' | 'CONFIG_ERROR' | 'HOOK_ERROR' | 'MANIFEST_ERROR'
  message: string
  pluginId: string
  details?: unknown
}
