import { useEffect, useMemo, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { ThemeInput, ThemeSelect, ThemeTextarea } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

interface VersionCatalogItem {
  id: string
  workspaceId: string
  component: string
  version: string
  releaseChannel: string
  source: string
  metadataJson: string
  releaseNotesSummary: string
  createdAt: string
}

interface InstalledVersionItem {
  id: string
  targetId: string
  component: string
  installedVersion: string
  detectedAt: string
  source: string
  detailsJson: string
  target: {
    id: string
    name: string
    targetType: string
    envType: string
  }
}

interface DeploymentTarget {
  id: string
  name: string
  targetType: string
  envType: string
}

const DEFAULT_WORKSPACE_ID = readWorkspaceId()

export function ReleasesPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<VersionCatalogItem[]>([])
  const [installed, setInstalled] = useState<InstalledVersionItem[]>([])
  const [targets, setTargets] = useState<DeploymentTarget[]>([])
  const [catalogForm, setCatalogForm] = useState({
    component: 'GATEWAY',
    version: '',
    releaseChannel: 'STABLE',
    source: 'MANUAL',
    metadataJson: '{}',
    releaseNotesSummary: ''
  })
  const [manifestText, setManifestText] = useState('[\n  {\n    "component": "GATEWAY",\n    "version": "0.9.2",\n    "releaseChannel": "STABLE",\n    "source": "LOCAL_MANIFEST",\n    "metadataJson": "{}",\n    "releaseNotesSummary": "示例清单导入版本"\n  }\n]')

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await refreshAll(port)
      setLoading(false)
    })
  }, [])

  const refreshAll = async (port: number) => {
    const [catalogRes, installedRes, targetRes] = await Promise.all([
      fetchJson<VersionCatalogItem[]>(port, `/api/version-catalog?workspaceId=${DEFAULT_WORKSPACE_ID}`),
      fetchJson<InstalledVersionItem[]>(port, `/api/installed-versions?workspaceId=${DEFAULT_WORKSPACE_ID}`),
      fetch(`http://127.0.0.1:${port}/api/deployment-targets?workspaceId=${DEFAULT_WORKSPACE_ID}`).then(res => res.json() as Promise<DeploymentTarget[]>)
    ])

    setCatalog(catalogRes)
    setInstalled(installedRes)
    setTargets(targetRes)
  }

  const latestByComponent = useMemo(() => {
    const map = new Map<string, VersionCatalogItem>()
    for (const item of catalog) {
      const existing = map.get(item.component)
      if (!existing) {
        map.set(item.component, item)
        continue
      }
      if (item.createdAt > existing.createdAt) {
        map.set(item.component, item)
      }
    }
    return map
  }, [catalog])

  const renderInstalledVersionRow = (item: InstalledVersionItem, latest?: VersionCatalogItem) => (
    <tr key={item.id} className="border-b border-[hsl(var(--border))]">
      <td className="py-2 pr-4">{item.component}</td>
      <td className="py-2 pr-4 font-mono">{item.installedVersion}</td>
      <td className="py-2 pr-4 font-mono">{latest?.version || '—'}</td>
      <td className="py-2 pr-4">
        {latest && latest.version !== item.installedVersion ? (
          <span className="text-[hsl(var(--google-yellow))]">可升级</span>
        ) : (
          <span className="text-[hsl(var(--success))]">已是最新</span>
        )}
      </td>
    </tr>
  )

  const renderCatalogRow = (item: VersionCatalogItem) => (
    <tr key={item.id} className="border-b border-[hsl(var(--border))] align-top">
      <td className="py-3 pr-4 font-medium">{item.component}</td>
      <td className="py-3 pr-4 font-mono">{item.version}</td>
      <td className="py-3 pr-4">{item.releaseChannel}</td>
      <td className="py-3 pr-4">{item.source}</td>
      <td className="py-3 pr-4 text-[hsl(var(--muted-foreground))]">{item.releaseNotesSummary || '—'}</td>
    </tr>
  )

  const renderInstalledTargetCard = (target: DeploymentTarget) => {
    const rows = installed.filter(item => item.targetId === target.id)
    const component = target.targetType.includes('DOCKER') ? 'DOCKER_IMAGE' : 'GATEWAY'
    const latest = latestByComponent.get(component)

    return (
      <div key={target.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-[hsl(var(--foreground))]">{target.name}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">{target.targetType} · {target.envType}</div>
          </div>
          <button onClick={() => handleDetect(target.id)} className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">重新检测</button>
        </div>

        {rows.length === 0 ? (
          <div className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">尚未检测到安装版本。</div>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--muted-foreground))]">
                  <th className="py-2 pr-4">组件</th>
                  <th className="py-2 pr-4">当前版本</th>
                  <th className="py-2 pr-4">目标建议</th>
                  <th className="py-2 pr-4">状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => renderInstalledVersionRow(item, latest))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const handleCreateCatalog = async () => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/version-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: DEFAULT_WORKSPACE_ID,
        ...catalogForm
      })
    })
    const json = await response.json() as ApiResponse<VersionCatalogItem>
    if (!json.success) {
      alert(json.error)
      return
    }
    setCatalogForm(prev => ({ ...prev, version: '', releaseNotesSummary: '' }))
    await refreshAll(apiPort)
  }

  const handleImportManifest = async () => {
    if (!apiPort) return
    try {
      const parsed = JSON.parse(manifestText) as Array<Record<string, string>>
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/version-catalog/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: DEFAULT_WORKSPACE_ID, items: parsed })
      })
      const json = await response.json() as ApiResponse<{ count: number }>
      if (!json.success) {
        alert(json.error)
        return
      }
      await refreshAll(apiPort)
      alert(`已导入 ${json.data.count} 条版本目录`) 
    } catch (error) {
      alert(error instanceof Error ? error.message : '清单 JSON 解析失败')
    }
  }

  const handleDetect = async (targetId: string) => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/installed-versions/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: DEFAULT_WORKSPACE_ID, targetId })
    })
    const json = await response.json() as ApiResponse<InstalledVersionItem>
    if (!json.success) {
      alert(json.error)
      return
    }
    await refreshAll(apiPort)
  }

  if (loading) {
    return <LoadingState message="加载 Release Center 中..." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Releases"
        description="统一查看版本目录、目标已安装版本与可升级差异"
        actions={
          <button
            onClick={() => apiPort && refreshAll(apiPort)}
            className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            刷新
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title="手动录入版本" description="先支持手工维护版本目录，后续可扩展 GitHub Release / Docker Registry。">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ThemeSelect value={catalogForm.component} onChange={e => setCatalogForm(prev => ({ ...prev, component: e.target.value }))}>
              <option value="OPENCLAW">OPENCLAW</option>
              <option value="GATEWAY">GATEWAY</option>
              <option value="DOCKER_IMAGE">DOCKER_IMAGE</option>
              <option value="RUNNER">RUNNER</option>
              <option value="CUSTOM">CUSTOM</option>
            </ThemeSelect>
            <ThemeInput value={catalogForm.version} onChange={e => setCatalogForm(prev => ({ ...prev, version: e.target.value }))} placeholder="版本号或镜像标签" />
            <ThemeSelect value={catalogForm.releaseChannel} onChange={e => setCatalogForm(prev => ({ ...prev, releaseChannel: e.target.value }))}>
              <option value="STABLE">STABLE</option>
              <option value="BETA">BETA</option>
              <option value="PINNED">PINNED</option>
              <option value="CUSTOM">CUSTOM</option>
            </ThemeSelect>
            <ThemeInput value={catalogForm.source} onChange={e => setCatalogForm(prev => ({ ...prev, source: e.target.value }))} placeholder="来源" />
            <ThemeTextarea value={catalogForm.metadataJson} onChange={e => setCatalogForm(prev => ({ ...prev, metadataJson: e.target.value }))} rows={4} variant="code" className="md:col-span-2" />
            <ThemeTextarea value={catalogForm.releaseNotesSummary} onChange={e => setCatalogForm(prev => ({ ...prev, releaseNotesSummary: e.target.value }))} placeholder="发布说明摘要" rows={3} fieldShape="soft" className="md:col-span-2" />
          </div>
          <div className="mt-4">
            <button onClick={handleCreateCatalog} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">录入版本</button>
          </div>
        </SectionCard>

        <SectionCard title="导入本地版本清单" description="使用 JSON 数组批量导入版本目录。">
          <ThemeTextarea value={manifestText} onChange={e => setManifestText(e.target.value)} rows={14} variant="code" className="w-full" />
          <div className="mt-4">
            <button onClick={handleImportManifest} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">导入清单</button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={`版本目录 (${catalog.length})`} description="已知可用版本目录。">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--muted-foreground))]">
                <th className="py-3 pr-4">组件</th>
                <th className="py-3 pr-4">版本</th>
                <th className="py-3 pr-4">通道</th>
                <th className="py-3 pr-4">来源</th>
                <th className="py-3 pr-4">摘要</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map(item => renderCatalogRow(item))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={`已安装版本 (${installed.length})`} description="按 Target 展示当前检测到的真实版本，以及是否存在新版本。">
        <div className="space-y-4">
          {targets.map(target => renderInstalledTargetCard(target))}
        </div>
      </SectionCard>
    </div>
  )
}

async function fetchJson<T>(port: number, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  const json = await response.json() as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error)
  }
  return json.data
}
