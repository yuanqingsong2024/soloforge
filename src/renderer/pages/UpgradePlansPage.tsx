import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface DeploymentTarget {
  id: string
  name: string
  targetType: string
  envType: string
}

interface UpgradePolicy {
  id: string
  name: string
}

interface VersionCatalogItem {
  id: string
  component: string
  version: string
  releaseChannel: string
}

interface UpgradeRun {
  id: string
  status: string
  startedAt: string
}

interface UpgradePlan {
  id: string
  targetId: string
  policyId?: string | null
  component: string
  currentVersion: string
  targetVersion: string
  releaseChannel: string
  planJson: string
  riskLevel: string
  dryRunResultJson?: string | null
  status: string
  approvalId?: string | null
  operationId?: string | null
  traceId: string
  target: DeploymentTarget
  policy?: UpgradePolicy | null
  runs: UpgradeRun[]
}

export function UpgradePlansPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const initialQuery = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      workspaceId: params.get('workspaceId') || readWorkspaceId(),
      targetId: params.get('targetId') || '',
      status: params.get('status') || ''
    }
  }, [location.search])
  const [loading, setLoading] = useState(true)
  const [workspaceId, setWorkspaceId] = useState(initialQuery.workspaceId)
  const [statusFilter, setStatusFilter] = useState(initialQuery.status)
  const [targets, setTargets] = useState<DeploymentTarget[]>([])
  const [catalog, setCatalog] = useState<VersionCatalogItem[]>([])
  const [policies, setPolicies] = useState<UpgradePolicy[]>([])
  const [plans, setPlans] = useState<UpgradePlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [form, setForm] = useState({
    targetId: initialQuery.targetId,
    policyId: '',
    component: 'GATEWAY',
    targetVersion: '',
    releaseChannel: 'STABLE'
  })

  useEffect(() => {
    setWorkspaceId(initialQuery.workspaceId)
    setStatusFilter(initialQuery.status)
    setForm(prev => ({ ...prev, targetId: initialQuery.targetId }))
  }, [initialQuery])

  useEffect(() => {
    void (async () => {
      await refreshAll(initialQuery.workspaceId, initialQuery.targetId, initialQuery.status)
      setLoading(false)
    })()
  }, [initialQuery])

  const refreshAll = async (nextWorkspaceId = workspaceId, nextTargetId = form.targetId, nextStatus = statusFilter) => {
    const planParams = new URLSearchParams({ workspaceId: nextWorkspaceId })
    if (nextTargetId) planParams.set('targetId', nextTargetId)
    if (nextStatus) planParams.set('status', nextStatus)

    const [targetRows, catalogRows, policyRows, planRows] = await Promise.all([
      apiFetch<DeploymentTarget[]>(`/api/deployment-targets?workspaceId=${nextWorkspaceId}`),
      apiFetch<ApiResponse<VersionCatalogItem[]>>(`/api/version-catalog?workspaceId=${nextWorkspaceId}`),
      apiFetch<ApiResponse<UpgradePolicy[]>>(`/api/upgrade-policies?workspaceId=${nextWorkspaceId}`),
      apiFetch<ApiResponse<UpgradePlan[]>>(`/api/upgrade-plans?${planParams.toString()}`)
    ])

    setTargets(targetRows)
    setCatalog(catalogRows.success ? (catalogRows.data ?? []) : [])
    setPolicies(policyRows.success ? (policyRows.data ?? []) : [])
    setPlans(planRows.success ? (planRows.data ?? []) : [])
    if (!selectedPlanId && planRows.success && planRows.data && planRows.data.length > 0) {
      setSelectedPlanId(planRows.data[0].id)
    }
  }

  const filteredVersions = useMemo(() => {
    return catalog.filter(item => item.component === form.component && item.releaseChannel === form.releaseChannel)
  }, [catalog, form.component, form.releaseChannel])

  const selectedPlan = useMemo(() => plans.find(plan => plan.id === selectedPlanId) || null, [plans, selectedPlanId])

  const handleCreatePlan = async () => {
    const response = await apiFetch<ApiResponse<UpgradePlan>>('/api/upgrade-plans', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId,
        targetId: form.targetId,
        policyId: form.policyId || null,
        component: form.component,
        targetVersion: form.targetVersion,
        releaseChannel: form.releaseChannel
      })
    })
    if (!response.success) {
      alert(response.error)
      return
    }
    await refreshAll()
    if (response.data) {
      setSelectedPlanId((response.data as { id: string }).id)
    }
    navigate(`/upgrade-plans?workspaceId=${workspaceId}&targetId=${encodeURIComponent(form.targetId)}`)
  }

  const runPlanAction = async (planId: string, action: 'dry-run' | 'execute' | 'rollback') => {
    const response = await apiFetch<ApiResponse<unknown>>(`/api/upgrade-plans/${planId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'admin' })
    })
    if (!response.success) {
      alert(response.error)
      return
    }
    await refreshAll()
    alert('操作已进入审批等待，请到审批中心处理。')
  }

  if (loading) {
    return <LoadingState message="加载升级计划中..." />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="升级计划" description="创建升级计划、执行预检查、提交审批并推进升级链路。" />

      <SectionCard title="筛选器" description="按工作区、目标环境与计划状态收敛升级链路。">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ThemeInput value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} placeholder="工作区 ID" />
          <ThemeSelect value={form.targetId} onChange={e => setForm(prev => ({ ...prev, targetId: e.target.value }))}>
            <option value="">全部目标环境</option>
            {targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
          </ThemeSelect>
          <ThemeSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="DRAFT">DRAFT</option>
            <option value="READY">READY</option>
            <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
            <option value="APPROVED">APPROVED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="FAILED">FAILED</option>
            <option value="ROLLED_BACK">ROLLED_BACK</option>
          </ThemeSelect>
          <button onClick={() => void refreshAll(workspaceId, form.targetId, statusFilter)} className="px-4 py-2 rounded-md bg-[hsl(var(--muted))] hover:opacity-90">应用筛选</button>
        </div>
      </SectionCard>

      <SectionCard title="创建升级计划" description="按目标环境、组件和目标版本生成升级计划。">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <ThemeSelect value={form.targetId} onChange={e => setForm(prev => ({ ...prev, targetId: e.target.value }))}>
            <option value="">选择目标环境</option>
            {targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
          </ThemeSelect>
          <ThemeSelect value={form.policyId} onChange={e => setForm(prev => ({ ...prev, policyId: e.target.value }))}>
            <option value="">自动匹配策略</option>
            {policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
          </ThemeSelect>
          <ThemeSelect value={form.component} onChange={e => setForm(prev => ({ ...prev, component: e.target.value, targetVersion: '' }))}>
            <option value="OPENCLAW">OPENCLAW</option>
            <option value="GATEWAY">GATEWAY</option>
            <option value="DOCKER_IMAGE">DOCKER_IMAGE</option>
            <option value="RUNNER">RUNNER</option>
            <option value="CUSTOM">CUSTOM</option>
          </ThemeSelect>
          <ThemeSelect value={form.releaseChannel} onChange={e => setForm(prev => ({ ...prev, releaseChannel: e.target.value, targetVersion: '' }))}>
            <option value="STABLE">STABLE</option>
            <option value="BETA">BETA</option>
            <option value="PINNED">PINNED</option>
            <option value="CUSTOM">CUSTOM</option>
          </ThemeSelect>
          <ThemeSelect value={form.targetVersion} onChange={e => setForm(prev => ({ ...prev, targetVersion: e.target.value }))}>
            <option value="">选择目标版本</option>
            {filteredVersions.map(item => <option key={item.id} value={item.version}>{item.version}</option>)}
          </ThemeSelect>
        </div>
        <div className="mt-4">
          <button onClick={handleCreatePlan} className="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">创建升级计划</button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,1fr)_minmax(0,2fr)] gap-6">
        <SectionCard title={`计划列表（${plans.length}）`} description="左侧查看计划状态，右侧查看预检查、审批和执行详情。">
          <div className="space-y-3">
            {plans.map(plan => (
              <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)} className={`w-full text-left border rounded-md p-4 ${selectedPlanId === plan.id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{plan.target.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{plan.component} · {plan.currentVersion} → {plan.targetVersion}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2">风险等级：{plan.riskLevel}</div>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--muted))]">{plan.status}</span>
                </div>
              </button>
            ))}
            {plans.length === 0 && <EmptyState message="当前筛选条件下暂无升级计划。" />}
          </div>
        </SectionCard>

        <SectionCard
          title={selectedPlan ? `${selectedPlan.target.name} 的升级计划` : '升级计划详情'}
          description={selectedPlan ? `${selectedPlan.component} · ${selectedPlan.currentVersion} → ${selectedPlan.targetVersion}` : '请选择左侧升级计划查看详情'}
          actions={selectedPlan ? (
            <>
               <button onClick={() => runPlanAction(selectedPlan.id, 'dry-run')} className="px-3 py-2 text-sm rounded-md bg-[hsl(var(--muted))] hover:opacity-90">预检查</button>
              <button onClick={() => runPlanAction(selectedPlan.id, 'execute')} className="px-3 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">执行升级</button>
              <button onClick={() => runPlanAction(selectedPlan.id, 'rollback')} className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-3 py-2 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.18)] transition-colors">回滚</button>
            </>
          ) : undefined}
        >
          {!selectedPlan ? (
             <EmptyState message="请选择左侧升级计划查看详情。" />
           ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">状态</div>
                  <div>{selectedPlan.status}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">审批 ID</div>
                  <div className="font-mono break-all">{selectedPlan.approvalId || '—'}</div>
                </div>
                <div>
                    <div className="text-[hsl(var(--muted-foreground))]">操作任务 ID</div>
                  <div className="font-mono break-all">{selectedPlan.operationId || '—'}</div>
                </div>
                <div>
                    <div className="text-[hsl(var(--muted-foreground))]">链路 ID</div>
                  <div className="font-mono break-all">{selectedPlan.traceId}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">计划详情</div>
                <pre className="p-3 rounded-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-80">{prettyJson(selectedPlan.planJson)}</pre>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">预检查结果</div>
                <pre className="p-3 rounded-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-80">{prettyJson(selectedPlan.dryRunResultJson || '{}')}</pre>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">最近运行</div>
                {selectedPlan.runs.length === 0 ? (
                  <EmptyState message="暂无运行记录" />
                ) : (
                  <div className="space-y-2">
                    {selectedPlan.runs.map(run => (
                      <div key={run.id} className="border border-[hsl(var(--border))] rounded-md p-3 text-sm">
                        <div className="font-mono">{run.id}</div>
                        <div className="text-[hsl(var(--muted-foreground))]">{run.status} · {formatDateTime(run.startedAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
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
