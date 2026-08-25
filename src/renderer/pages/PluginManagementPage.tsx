// ============================================
// SoloForge Plugin Management Page
// 插件管理页面
// ============================================

import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getPluginManager, type Plugin } from '../components/plugin'

export function PluginManagementPage() {
  const [plugins, setPlugins] = useState<Plugin[]>(() => getPluginManager().getPlugins())
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)

  const handleRefresh = () => {
    setPlugins(getPluginManager().getPlugins())
  }

  const handleToggle = async (plugin: Plugin) => {
    const manager = getPluginManager()
    if (plugin.enabled) {
      await manager.disablePlugin(plugin.manifest.id)
    } else {
      await manager.enablePlugin(plugin.manifest.id)
    }
    handleRefresh()
  }

  const handleUninstall = async (pluginId: string) => {
    if (!confirm('确定要卸载此插件吗？')) return
    await getPluginManager().unregisterPlugin(pluginId)
    setSelectedPlugin(null)
    handleRefresh()
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="插件管理"
        description="管理 SoloForge 的插件扩展"
        actions={
          <Button variant="secondary" onClick={handleRefresh}>
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 插件列表 */}
        <div className="lg:col-span-1">
          <SectionCard title="已安装的插件" className="h-fit">
            {plugins.length === 0 ? (
              <EmptyState message="暂无已安装的插件" />
            ) : (
              <div className="space-y-2">
                {plugins.map(plugin => (
                  <div
                    key={plugin.instanceId}
                    onClick={() => setSelectedPlugin(plugin)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPlugin?.instanceId === plugin.instanceId
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]'
                        : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[hsl(var(--foreground))]">{plugin.manifest.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">v{plugin.manifest.version}</p>
                      </div>
                      <StatusBadge
                        label={plugin.enabled ? '已启用' : '已禁用'}
                        tone={plugin.enabled ? 'success' : 'muted'}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* 插件详情 */}
        <div className="lg:col-span-2">
          <SectionCard title="插件详情" className="h-fit">
            {selectedPlugin ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedPlugin.manifest.name}</h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {selectedPlugin.manifest.description || '暂无描述'}
                    </p>
                  </div>
                  <StatusBadge
                    label={selectedPlugin.enabled ? '已启用' : '已禁用'}
                    tone={selectedPlugin.enabled ? 'success' : 'muted'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">插件 ID：</span>
                    <code className="ml-1 text-[hsl(var(--foreground))]">{selectedPlugin.manifest.id}</code>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">版本：</span>
                    <span className="ml-1">{selectedPlugin.manifest.version}</span>
                  </div>
                  {selectedPlugin.manifest.author && (
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">作者：</span>
                      <span className="ml-1">{selectedPlugin.manifest.author}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">入口文件：</span>
                    <code className="ml-1 text-xs">{selectedPlugin.manifest.main}</code>
                  </div>
                </div>

                {selectedPlugin.pages && selectedPlugin.pages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">提供的页面</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlugin.pages.map(page => (
                        <span
                          key={page.id}
                          className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-xs"
                        >
                          {page.path}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlugin.menuItems && selectedPlugin.menuItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">菜单项</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlugin.menuItems.map(item => (
                        <span
                          key={item.id}
                          className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-xs"
                        >
                          {item.label} → {item.path}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleToggle(selectedPlugin)}
                  >
                    {selectedPlugin.enabled ? '禁用插件' : '启用插件'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleUninstall(selectedPlugin.manifest.id)}
                  >
                    卸载插件
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-[hsl(var(--muted-foreground))]">
                选择一个插件查看详情
              </div>
            )}
          </SectionCard>

          {/* 开发工具提示 */}
          {process.env.NODE_ENV !== 'production' && (
            <SectionCard title="开发者工具" className="mt-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
                在开发模式下，您可以通过控制台手动加载插件：
              </p>
              <pre className="p-3 rounded bg-[hsl(var(--muted))] text-xs overflow-auto">
{`import { getPluginManager, createHelloWorldPlugin } from './components/plugin/example-plugin'

// 注册示例插件
getPluginManager().registerPlugin(createHelloWorldPlugin())

// 启用插件
getPluginManager().enablePlugin('hello-world')`}
              </pre>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
