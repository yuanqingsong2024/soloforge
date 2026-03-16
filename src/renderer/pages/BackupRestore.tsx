import { useMemo, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface BackupPack {
  version: string
  workspaceId: string
  workspaceName: string
  exportedAt: string
  exportedBy: string
  config: {
    desired?: unknown
    actual?: unknown
  }
  changeRequests?: unknown[]
  metadata: {
    hash: string
    itemCount: number
  }
}

interface ImportResult {
  success: boolean
  workspaceId?: string
  errors: string[]
  warnings: string[]
  credentialsNeeded: string[]
}

interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiFailResponse {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailResponse

export function BackupRestore() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exportedPackText, setExportedPackText] = useState('')
  const [importPackText, setImportPackText] = useState('')
  const [includeChangeRequests, setIncludeChangeRequests] = useState(true)
  const [includeSnapshots, setIncludeSnapshots] = useState(true)
  const [createNewWorkspace, setCreateNewWorkspace] = useState(true)
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('')

  const workspaceId = useMemo(
    () => localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    []
  )

  const handleExport = async () => {
    if (!confirm('确定要导出当前 Workspace 的备份包吗？')) return

    setExporting(true)
    try {
      const port = await window.electronAPI.getApiPort()
      const response = await fetch(`http://127.0.0.1:${port}/api/backup/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          exportedBy: 'admin',
          includeChangeRequests,
          includeSnapshots
        })
      })

      const result = await response.json() as ApiResponse<BackupPack>
      if (!response.ok || !result.success) {
        throw new Error(result.success ? '导出失败' : result.error)
      }

      setExportedPackText(JSON.stringify(result.data, null, 2))
      alert(`导出成功：Workspace「${result.data.workspaceName}」备份包已生成`)
    } catch (error) {
      console.error('Export failed:', error)
      alert(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExporting(false)
    }
  }

  const handleCopyExport = async () => {
    if (!exportedPackText) return
    await navigator.clipboard.writeText(exportedPackText)
    alert('备份包 JSON 已复制到剪贴板')
  }

  const handleImport = async () => {
    if (!importPackText.trim()) {
      alert('请粘贴备份包 JSON')
      return
    }

    if (!confirm('警告：导入会写入 Workspace 数据，确定继续吗？')) return

    setImporting(true)
    try {
      const backupPack = JSON.parse(importPackText) as BackupPack
      const port = await window.electronAPI.getApiPort()
      const response = await fetch(`http://127.0.0.1:${port}/api/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupPack,
          importedBy: 'admin',
          createNewWorkspace,
          targetWorkspaceId: createNewWorkspace ? undefined : targetWorkspaceId || undefined
        })
      })

      const result = await response.json() as ApiResponse<ImportResult>
      if (!response.ok || !result.success) {
        throw new Error(result.success ? '导入失败' : result.error)
      }

      const summary = [
        `导入成功`,
        result.data.workspaceId ? `Workspace ID：${result.data.workspaceId}` : null,
        result.data.warnings.length > 0 ? `警告：${result.data.warnings.join('；')}` : null,
        result.data.credentialsNeeded.length > 0 ? `需重新填写凭证：${result.data.credentialsNeeded.join('、')}` : null
      ].filter(Boolean).join('\n')

      alert(summary)
    } catch (error) {
      console.error('Import failed:', error)
      alert(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="备份与恢复" description="按 Workspace 导出/导入脱敏备份包（JSON）" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="导出备份包">
          <div className="space-y-4">
            <div className="p-3 bg-[hsl(var(--muted))] rounded-workshop-md text-sm text-[hsl(var(--muted-foreground))]">
              当前 Workspace：<span className="font-mono">{workspaceId}</span>
            </div>

            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input type="checkbox" checked={includeChangeRequests} onChange={e => setIncludeChangeRequests(e.target.checked)} />
              包含变更单历史
            </label>

            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input type="checkbox" checked={includeSnapshots} onChange={e => setIncludeSnapshots(e.target.checked)} />
              包含最新快照（DESIRED / ACTUAL）
            </label>

            <div className="flex gap-3">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
              >
                {exporting ? '导出中...' : '生成备份包'}
              </button>

              <button
                onClick={handleCopyExport}
                disabled={!exportedPackText}
                className="px-4 py-2 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
              >
                复制 JSON
              </button>
            </div>

            <textarea
              value={exportedPackText}
              onChange={e => setExportedPackText(e.target.value)}
              placeholder="点击“生成备份包”后，这里会出现可复制的备份 JSON。"
              rows={18}
              className="w-full px-3 py-2 text-xs font-mono rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
            />

            <div className="p-3 bg-[hsl(var(--muted))] rounded-workshop-md">
              <ul className="text-xs text-[hsl(var(--muted-foreground))] space-y-1 list-disc list-inside">
                <li>导出的是脱敏后的 JSON 备份包，不包含 Keychain 中的明文凭证</li>
                <li>适合跨设备迁移、问题排查和人工审阅</li>
                <li>如需恢复凭证，导入后需重新填写 token / password / edge token</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="导入备份包">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input type="checkbox" checked={createNewWorkspace} onChange={e => setCreateNewWorkspace(e.target.checked)} />
              导入为新 Workspace（推荐）
            </label>

            {!createNewWorkspace && (
              <input
                type="text"
                value={targetWorkspaceId}
                onChange={e => setTargetWorkspaceId(e.target.value)}
                placeholder="目标 Workspace ID"
                className="w-full px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              />
            )}

            <textarea
              value={importPackText}
              onChange={e => setImportPackText(e.target.value)}
              placeholder="请粘贴导出的备份包 JSON 内容"
              rows={18}
              className="w-full px-3 py-2 text-xs font-mono rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
            />

            <button
              onClick={handleImport}
              disabled={importing || !importPackText.trim()}
              className="w-full px-4 py-2 bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
            >
              {importing ? '导入中...' : '导入备份包'}
            </button>

            <div className="p-3 bg-[hsl(var(--muted))] rounded-workshop-md">
              <ul className="text-xs text-[hsl(var(--muted-foreground))] space-y-1 list-disc list-inside">
                <li>建议优先导入为新 Workspace，避免覆盖现有数据</li>
                <li>导入后如提示缺少凭证，请到连接设置或相关页面重新填写</li>
                <li>仅支持本系统导出的合法备份包 JSON</li>
              </ul>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
