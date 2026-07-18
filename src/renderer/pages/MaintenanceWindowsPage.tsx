import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { ThemeCheckbox, ThemeInput, ThemeTextarea } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface ApiSuccess<T> { success: true; data: T }
interface ApiFailure { success: false; error: string }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure

interface MaintenanceWindow {
  id: string
  name: string
  enabled: boolean
  timezone: string
  cronOrRule: string
  notes: string
}

const DEFAULT_WORKSPACE_ID = readWorkspaceId()

export function MaintenanceWindowsPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [form, setForm] = useState({
    name: '',
    enabled: true,
    timezone: 'Asia/Shanghai',
    cronOrRule: 'weekly:sun:02:00-04:00',
    notes: ''
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await refresh(port)
    })
  }, [])

  const refresh = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/maintenance-windows?workspaceId=${DEFAULT_WORKSPACE_ID}`)
    const json = await response.json() as ApiResponse<MaintenanceWindow[]>
    if (json.success) setWindows(json.data)
  }

  const saveWindow = async () => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/maintenance-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: DEFAULT_WORKSPACE_ID, ...form })
    })
    const json = await response.json() as ApiResponse<MaintenanceWindow>
    if (!json.success) {
      alert(json.error)
      return
    }
    await refresh(apiPort)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance Windows" description="定义升级执行允许的时间窗口。当前默认支持 weekly:day:HH:mm-HH:mm 规则。" />
      <SectionCard title="新建维护窗口">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ThemeInput value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="窗口名称" />
          <ThemeInput value={form.timezone} onChange={e => setForm(prev => ({ ...prev, timezone: e.target.value }))} placeholder="时区" />
          <ThemeInput value={form.cronOrRule} onChange={e => setForm(prev => ({ ...prev, cronOrRule: e.target.value }))} placeholder="weekly:sun:02:00-04:00" />
          <label className="flex items-center gap-2 text-sm"><ThemeCheckbox checked={form.enabled} onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} /> 启用</label>
          <ThemeTextarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} rows={4} className="md:col-span-2" />
        </div>
        <div className="mt-4"><button onClick={saveWindow} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">保存维护窗口</button></div>
      </SectionCard>

      <SectionCard title={`维护窗口 (${windows.length})`}>
        <div className="space-y-3">
          {windows.map(item => (
            <div key={item.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">{item.timezone} · {item.cronOrRule}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{item.notes || '—'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--muted))]">{item.enabled ? '启用' : '禁用'}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
