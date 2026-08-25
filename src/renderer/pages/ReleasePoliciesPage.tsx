import { useEffect, useState } from 'react'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { ThemeCheckbox, ThemeInput, ThemeTextarea } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface UpgradePolicy {
  id: string
  name: string
  enabled: boolean
  targetScopeJson: string
  releaseChannelScopeJson: string
  autoDetectUpdates: boolean
  requireBackup: boolean
  requireApproval: boolean
  requireMaintenanceWindow: boolean
  allowAutoRollback: boolean
}

const DEFAULT_WORKSPACE_ID = readWorkspaceId()

export function ReleasePoliciesPage() {
  const [policies, setPolicies] = useState<UpgradePolicy[]>([])
  const [form, setForm] = useState({
    name: '',
    enabled: true,
    targetScopeJson: '{"envTypes":["DEV"]}',
    releaseChannelScopeJson: '{"allowedChannels":["STABLE"]}',
    autoDetectUpdates: true,
    requireBackup: true,
    requireApproval: true,
    requireMaintenanceWindow: false,
    allowAutoRollback: true
  })

  useEffect(() => {
    void (async () => {
      await refresh()
    })()
  }, [])

  const refresh = async () => {
    const json = await apiFetch<ApiResponse<UpgradePolicy[]>>(`/api/upgrade-policies?workspaceId=${DEFAULT_WORKSPACE_ID}`)
    if (json.success && json.data) setPolicies(json.data)
  }

  const savePolicy = async () => {
    const response = await apiFetch<ApiResponse<UpgradePolicy>>('/api/upgrade-policies', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: DEFAULT_WORKSPACE_ID, ...form })
    })
    if (!response.success) {
      alert(response.error ?? '保存失败')
      return
    }
    await refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Release Policies" description="定义每个 Workspace 的升级保护规则、备份要求、审批要求与自动回滚策略。" />
      <SectionCard title="新建策略">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ThemeInput value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="策略名称" />
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.enabled} onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} /> 启用</label>
          <ThemeTextarea value={form.targetScopeJson} onChange={e => setForm(prev => ({ ...prev, targetScopeJson: e.target.value }))} rows={4} variant="code" />
          <ThemeTextarea value={form.releaseChannelScopeJson} onChange={e => setForm(prev => ({ ...prev, releaseChannelScopeJson: e.target.value }))} rows={4} variant="code" />
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.autoDetectUpdates} onChange={e => setForm(prev => ({ ...prev, autoDetectUpdates: e.target.checked }))} /> 自动发现更新</label>
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.requireBackup} onChange={e => setForm(prev => ({ ...prev, requireBackup: e.target.checked }))} /> 强制备份</label>
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.requireApproval} onChange={e => setForm(prev => ({ ...prev, requireApproval: e.target.checked }))} /> 强制审批</label>
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.requireMaintenanceWindow} onChange={e => setForm(prev => ({ ...prev, requireMaintenanceWindow: e.target.checked }))} /> 强制维护窗口</label>
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.allowAutoRollback} onChange={e => setForm(prev => ({ ...prev, allowAutoRollback: e.target.checked }))} /> 允许自动回滚</label>
        </div>
        <div className="mt-4"><button onClick={savePolicy} className="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">保存策略</button></div>
      </SectionCard>

      <SectionCard title={`策略列表 (${policies.length})`}>
        <div className="space-y-3">
          {policies.map(policy => (
            <div key={policy.id} className="border border-[hsl(var(--border))] rounded-md p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">{policy.name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">审批: {policy.requireApproval ? '是' : '否'} · 备份: {policy.requireBackup ? '是' : '否'} · 维护窗口: {policy.requireMaintenanceWindow ? '是' : '否'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--muted))]">{policy.enabled ? '启用' : '禁用'}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
