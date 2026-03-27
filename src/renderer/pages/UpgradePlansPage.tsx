import { useEffect, useMemo, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

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

const DEFAULT_WORKSPACE_ID = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'

export function UpgradePlansPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<DeploymentTarget[]>([])
  const [catalog, setCatalog] = useState<VersionCatalogItem[]>([])
  const [policies, setPolicies] = useState<UpgradePolicy[]>([])
  const [plans, setPlans] = useState<UpgradePlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [form, setForm] = useState({
    targetId: '',
    policyId: '',
    component: 'GATEWAY',
    targetVersion: '',
    releaseChannel: 'STABLE'
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await refreshAll(port)
      setLoading(false)
    })
  }, [])

  const refreshAll = async (port: number) => {
    const [targetRows, catalogRows, policyRows, planRows] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/deployment-targets?workspaceId=${DEFAULT_WORKSPACE_ID}`).then(res => res.json() as Promise<DeploymentTarget[]>),
      fetchJson<VersionCatalogItem[]>(port, `/api/version-catalog?workspaceId=${DEFAULT_WORKSPACE_ID}`),
      fetchJson<UpgradePolicy[]>(port, `/api/upgrade-policies?workspaceId=${DEFAULT_WORKSPACE_ID}`),
      fetchJson<UpgradePlan[]>(port, `/api/upgrade-plans?workspaceId=${DEFAULT_WORKSPACE_ID}`)
    ])

    setTargets(targetRows)
    setCatalog(catalogRows)
    setPolicies(policyRows)
    setPlans(planRows)
    if (!selectedPlanId && planRows.length > 0) {
      setSelectedPlanId(planRows[0].id)
    }
  }

  const filteredVersions = useMemo(() => {
    return catalog.filter(item => item.component === form.component && item.releaseChannel === form.releaseChannel)
  }, [catalog, form.component, form.releaseChannel])

  const selectedPlan = useMemo(() => plans.find(plan => plan.id === selectedPlanId) || null, [plans, selectedPlanId])

  const handleCreatePlan = async () => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/upgrade-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: DEFAULT_WORKSPACE_ID,
        targetId: form.targetId,
        policyId: form.policyId || null,
        component: form.component,
        targetVersion: form.targetVersion,
        releaseChannel: form.releaseChannel
      })
    })
    const json = await response.json() as ApiResponse<UpgradePlan>
    if (!json.success) {
      alert(json.error)
      return
    }
    await refreshAll(apiPort)
    setSelectedPlanId(json.data.id)
  }

  const runPlanAction = async (planId: string, action: 'dry-run' | 'execute' | 'rollback') => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/upgrade-plans/${planId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'admin' })
    })
    const json = await response.json() as ApiResponse<unknown>
    if (!json.success) {
      alert(json.error)
      return
    }
    await refreshAll(apiPort)
    if (response.status === 202) {
      alert('操作已进入审批等待，请到审批中心处理。')
    }
  }

  if (loading) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">加载 Upgrade Plans 中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Upgrade Plans" description="创建升级计划、执行 Dry Run、提交审批并启动升级链路。" />

      <SectionCard title="创建升级计划" description="按 target / 组件 / 目标版本生成 Upgrade Plan。">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select value={form.targetId} onChange={e => setForm(prev => ({ ...prev, targetId: e.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">选择 Target</option>
            {targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
          </select>
          <select value={form.policyId} onChange={e => setForm(prev => ({ ...prev, policyId: e.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">自动匹配策略</option>
            {policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
          </select>
          <select value={form.component} onChange={e => setForm(prev => ({ ...prev, component: e.target.value, targetVersion: '' }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="OPENCLAW">OPENCLAW</option>
            <option value="GATEWAY">GATEWAY</option>
            <option value="DOCKER_IMAGE">DOCKER_IMAGE</option>
            <option value="RUNNER">RUNNER</option>
            <option value="CUSTOM">CUSTOM</option>
          </select>
          <select value={form.releaseChannel} onChange={e => setForm(prev => ({ ...prev, releaseChannel: e.target.value, targetVersion: '' }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="STABLE">STABLE</option>
            <option value="BETA">BETA</option>
            <option value="PINNED">PINNED</option>
            <option value="CUSTOM">CUSTOM</option>
          </select>
          <select value={form.targetVersion} onChange={e => setForm(prev => ({ ...prev, targetVersion: e.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">选择目标版本</option>
            {filteredVersions.map(item => <option key={item.id} value={item.version}>{item.version}</option>)}
          </select>
        </div>
        <div className="mt-4">
          <button onClick={handleCreatePlan} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">创建 Upgrade Plan</button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,1fr)_minmax(0,2fr)] gap-6">
        <SectionCard title={`计划列表 (${plans.length})`} description="左侧查看计划状态，右侧查看步骤、Dry Run 与执行详情。">
          <div className="space-y-3">
            {plans.map(plan => (
              <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)} className={`w-full text-left border rounded-workshop-md p-4 ${selectedPlanId === plan.id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{plan.target.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{plan.component} · {plan.currentVersion} → {plan.targetVersion}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2">Risk: {plan.riskLevel}</div>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--muted))]">{plan.status}</span>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={selectedPlan ? `${selectedPlan.target.name} 的升级计划` : '升级计划详情'}
          description={selectedPlan ? `${selectedPlan.component} · ${selectedPlan.currentVersion} → ${selectedPlan.targetVersion}` : '请选择左侧计划'}
          actions={selectedPlan ? (
            <>
              <button onClick={() => runPlanAction(selectedPlan.id, 'dry-run')} className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">Dry Run</button>
              <button onClick={() => runPlanAction(selectedPlan.id, 'execute')} className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">执行升级</button>
              <button onClick={() => runPlanAction(selectedPlan.id, 'rollback')} className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-3 py-2 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.18)] transition-colors">回滚</button>
            </>
          ) : undefined}
        >
          {!selectedPlan ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">请选择一个 Upgrade Plan。</div>
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
                  <div className="text-[hsl(var(--muted-foreground))]">Operation ID</div>
                  <div className="font-mono break-all">{selectedPlan.operationId || '—'}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">Trace ID</div>
                  <div className="font-mono break-all">{selectedPlan.traceId}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Plan JSON</div>
                <pre className="p-3 rounded-workshop-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-80">{prettyJson(selectedPlan.planJson)}</pre>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Dry Run 结果</div>
                <pre className="p-3 rounded-workshop-md bg-[hsl(var(--muted))] text-xs font-mono overflow-auto max-h-80">{prettyJson(selectedPlan.dryRunResultJson || '{}')}</pre>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">最近运行</div>
                {selectedPlan.runs.length === 0 ? (
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无运行记录</div>
                ) : (
                  <div className="space-y-2">
                    {selectedPlan.runs.map(run => (
                      <div key={run.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3 text-sm">
                        <div className="font-mono">{run.id}</div>
                        <div className="text-[hsl(var(--muted-foreground))]">{run.status} · {new Date(run.startedAt).toLocaleString('zh-CN')}</div>
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

async function fetchJson<T>(port: number, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  const json = await response.json() as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error)
  }
  return json.data
}
