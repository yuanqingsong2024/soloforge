import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface ApiSuccess<T> { success: true; data: T }
interface ApiFailure { success: false; error: string }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure

interface UpgradeRun {
  id: string
  targetId: string
  status: string
  startedAt: string
  endedAt?: string | null
  resultJson: string
  rollbackResultJson?: string | null
  target: { name: string }
  plan: { component: string; targetVersion: string }
}

const DEFAULT_WORKSPACE_ID = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'

export function UpgradeRunsPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [runs, setRuns] = useState<UpgradeRun[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchRuns(port, '')
    })
  }, [])

  const fetchRuns = async (port: number, nextStatus: string) => {
    const suffix = nextStatus ? `&status=${nextStatus}` : ''
    const response = await fetch(`http://127.0.0.1:${port}/api/upgrade-runs?workspaceId=${DEFAULT_WORKSPACE_ID}${suffix}`)
    const json = await response.json() as ApiResponse<UpgradeRun[]>
    if (json.success) setRuns(json.data)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Upgrade Runs" description="查看升级执行历史、失败记录与回滚结果。" />
      <SectionCard title="过滤器" description="按状态筛选升级运行历史。">
        <div className="flex gap-3">
          <input value={status} onChange={e => setStatus(e.target.value)} placeholder="状态，如 SUCCEEDED / FAILED" className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <button onClick={() => apiPort && fetchRuns(apiPort, status)} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">应用</button>
        </div>
      </SectionCard>

      <SectionCard title={`运行记录 (${runs.length})`}>
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{run.target.name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">{run.plan.component} → {run.plan.targetVersion}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{new Date(run.startedAt).toLocaleString('zh-CN')}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--muted))]">{run.status}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <pre className="p-3 rounded-workshop-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-56">{prettyJson(run.resultJson)}</pre>
                <pre className="p-3 rounded-workshop-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-56">{prettyJson(run.rollbackResultJson || '{}')}</pre>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
