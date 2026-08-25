// ============================================
// SoloForge Plugin System - Example Plugin
// 示例插件：Hello World
// ============================================

import type { Plugin, PluginManifest } from './types'

/**
 * Hello World 插件清单
 */
const manifest: PluginManifest = {
  id: 'hello-world',
  name: 'Hello World',
  version: '1.0.0',
  description: '示例插件，展示插件系统的基本功能',
  author: 'SoloForge Team',
  main: 'index.ts',
}

/**
 * Hello World 页面组件
 */
function HelloWorldPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Hello World 插件</h1>
      <p className="mt-4 text-[hsl(var(--muted-foreground))]">
        这是一个示例插件，展示了插件系统的基本功能。
      </p>
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h2 className="font-semibold">插件功能</h2>
          <ul className="mt-2 list-disc list-inside text-sm text-[hsl(var(--muted-foreground))]">
            <li>提供自定义页面</li>
            <li>注册侧边栏菜单</li>
            <li>响应生命周期钩子</li>
          </ul>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h2 className="font-semibold">下一步</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            基于此示例，您可以创建自己的插件来扩展 SoloForge 功能。
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 创建 Hello World 插件
 */
export function createHelloWorldPlugin(): Plugin {
  return {
    manifest,
    instanceId: `${manifest.id}-${Date.now()}`,
    enabled: false,
    config: {
      greeting: 'Hello',
    },
    hooks: {
      onLoad: () => {
        console.log('[HelloWorld Plugin] Loaded')
      },
      onUnload: () => {
        console.log('[HelloWorld Plugin] Unloaded')
      },
      onAppReady: () => {
        console.log('[HelloWorld Plugin] App is ready')
      },
    },
    menuItems: [
      {
        id: 'hello-world-menu',
        label: 'Hello World',
        path: '/plugins/hello-world',
        order: 100,
      },
    ],
    sidebarItems: [
      {
        id: 'hello-world-sidebar',
        label: '示例插件',
        path: '/plugins/hello-world',
        order: 100,
      },
    ],
    pages: [
      {
        id: 'hello-world-page',
        path: '/plugins/hello-world',
        component: HelloWorldPage,
        title: 'Hello World',
      },
    ],
  }
}
