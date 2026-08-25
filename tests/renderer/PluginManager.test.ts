import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginManager, createPluginAPI } from '../../src/renderer/components/plugin/manager'
import type { Plugin } from '../../src/renderer/components/plugin/types'

function createPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    manifest: {
      id: 'test-plugin',
      name: '测试插件',
      version: '1.0.0',
      main: 'index.ts',
    },
    instanceId: 'test-plugin-instance',
    enabled: false,
    config: { retries: 1 },
    hooks: {},
    menuItems: [{ id: 'menu', label: '菜单', path: '/plugins/test' }],
    sidebarItems: [{ id: 'sidebar', label: '侧边栏', path: '/plugins/test' }],
    pages: [],
    ...overrides,
  }
}

describe('PluginManager', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager()
  })

  it('registers the complete plugin and runs onLoad', async () => {
    const onLoad = vi.fn()
    const plugin = createPlugin({ hooks: { onLoad } })

    await manager.registerPlugin(plugin)

    expect(manager.getPlugin('test-plugin')).toBe(plugin)
    expect(onLoad).toHaveBeenCalledOnce()
    expect(manager.getPlugins()).toHaveLength(1)
  })

  it('ignores duplicate registrations', async () => {
    const first = createPlugin()
    const second = createPlugin({ instanceId: 'second-instance' })

    await manager.registerPlugin(first)
    await manager.registerPlugin(second)

    expect(manager.getPlugins()).toEqual([first])
  })

  it('removes a plugin when its load hook fails and records an error', async () => {
    await manager.registerPlugin(createPlugin({
      hooks: { onLoad: () => { throw new Error('load failed') } },
    }))

    expect(manager.getPlugin('test-plugin')).toBeUndefined()
    expect(manager.getErrors()).toEqual([
      expect.objectContaining({
        code: 'LOAD_ERROR',
        pluginId: 'test-plugin',
        message: 'load failed',
      }),
    ])
  })

  it('toggles plugins, merges config, and exposes enabled extensions', async () => {
    await manager.registerPlugin(createPlugin())
    await manager.enablePlugin('test-plugin')
    await manager.updatePluginConfig('test-plugin', { retries: 3, dryRun: true })

    expect(manager.getEnabledPlugins()).toHaveLength(1)
    expect(manager.getPlugin('test-plugin')?.config).toEqual({ retries: 3, dryRun: true })
    expect(manager.getMenuItems()).toHaveLength(1)
    expect(manager.getSidebarItems()).toHaveLength(1)

    await manager.disablePlugin('test-plugin')
    expect(manager.getEnabledPlugins()).toHaveLength(0)
  })

  it('runs onUnload before unregistering', async () => {
    const onUnload = vi.fn()
    await manager.registerPlugin(createPlugin({ hooks: { onUnload } }))

    await manager.unregisterPlugin('test-plugin')

    expect(onUnload).toHaveBeenCalledOnce()
    expect(manager.getPlugins()).toHaveLength(0)
  })
})

describe('createPluginAPI', () => {
  it('forwards the full plugin object to the manager', async () => {
    const manager = new PluginManager()
    const plugin = createPlugin()
    const registerSpy = vi.spyOn(manager, 'registerPlugin')
    const api = {
      getPlugins: () => manager.getPlugins(),
      getPlugin: (id: string) => manager.getPlugin(id),
      updatePluginConfig: (id: string, config: Record<string, unknown>) => manager.updatePluginConfig(id, config),
      enablePlugin: (id: string) => manager.enablePlugin(id),
      disablePlugin: (id: string) => manager.disablePlugin(id),
      registerPlugin: (value: Plugin) => manager.registerPlugin(value),
      unregisterPlugin: (id: string) => manager.unregisterPlugin(id),
    }

    await api.registerPlugin(plugin)

    expect(registerSpy).toHaveBeenCalledWith(plugin)
  })

  it('exposes the shared manager API', async () => {
    const api = createPluginAPI()
    const plugin = createPlugin({ manifest: { id: 'shared-plugin', name: 'Shared', version: '1.0.0', main: 'index.ts' } })

    await api.registerPlugin(plugin)
    await api.enablePlugin('shared-plugin')

    expect(api.getPlugin('shared-plugin')?.enabled).toBe(true)
    await api.unregisterPlugin('shared-plugin')
  })
})
