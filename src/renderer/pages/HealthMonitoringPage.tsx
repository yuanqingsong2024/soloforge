import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DoctorTab } from '../components/health/DoctorTab'
import { AlertsTab } from '../components/health/AlertsTab'
import { SchedulerTab } from '../components/health/SchedulerTab'
import { readWorkspaceId } from '../lib/storage'

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function getWorkspaceId(searchParams: URLSearchParams): string {
  const workspaceIdFromQuery = searchParams.get('workspaceId')
  if (workspaceIdFromQuery) {
    return workspaceIdFromQuery
  }

  if (typeof window === 'undefined') {
    return DEFAULT_WORKSPACE_ID
  }

  try {
    return readWorkspaceId()
  } catch {
    return DEFAULT_WORKSPACE_ID
  }
}

export function HealthMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [workspaceId, setWorkspaceId] = useState(() => getWorkspaceId(searchParams))

  useEffect(() => {
    setWorkspaceId(getWorkspaceId(searchParams))
  }, [searchParams])

  const activeTab: 'doctor' | 'alerts' | 'scheduler' = (() => {
    const tab = searchParams.get('tab')
    return tab === 'alerts' || tab === 'scheduler' ? tab : 'doctor'
  })()

  function switchTab(tab: 'doctor' | 'alerts' | 'scheduler') {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    next.set('workspaceId', workspaceId)
    setSearchParams(next)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">健康监控</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          系统诊断、告警管理与调度配置
        </p>
      </div>

      <div className="border-b border-[hsl(var(--border))]">
        <nav className="flex gap-4">
          <button
            onClick={() => switchTab('doctor')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'doctor'
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            诊断中心
          </button>
          <button
            onClick={() => switchTab('alerts')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'alerts'
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            告警中心
          </button>
          <button
            onClick={() => switchTab('scheduler')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'scheduler'
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            调度器
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'doctor' && <DoctorTab workspaceId={workspaceId} />}
        {activeTab === 'alerts' && <AlertsTab workspaceId={workspaceId} />}
        {activeTab === 'scheduler' && <SchedulerTab workspaceId={workspaceId} />}
      </div>
    </div>
  )
}
