import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'

type DiagnosticSeverity = 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL'
type DiagnosticStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'
type DiagnosticCategory = 'WS_CONNECTION' | 'AUTH' | 'CONFIG_DRIFT' | 'HOOKS' | 'TRUSTED_PROXIES' | string

interface ApiOk<T> {
  success: true
  data: T
}

interface ApiFail {
  success: false
  error: string
}

type ApiResponse<T> = ApiOk<T> | ApiFail

interface DiagnosticFinding {
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  message: string
  details?: string
  recommendation?: string
}

interface DiagnosticReport {
  id: string
  workspaceId: string
  reportType: string
  status: DiagnosticStatus | string
  findings: DiagnosticFinding[]
  summary: string
  severity: DiagnosticSeverity
  createdAt: string
}

interface DiagnosticReportHistoryRow {
  id: string
  workspaceId: string
  reportType: string
  status: string
  findings: string
  summary: string
  severity: DiagnosticSeverity
  createdAt: string
  createdBy?: string
}

interface DriftLatest {
  id: string
  severity: 'LOW' | 'MED' | 'HIGH' | string
  summary: string
  createdAt: string
}

interface ChangeRequest {
  id: string
  workspaceId: string
  type: string
  title: string
  description: string
  status: string
  approvalId?: string | null
  createdAt: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatDateTimeZh(input: string): string {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleString('zh-CN')
}

function severityRank(sev: DiagnosticSeverity): number {
  const map: Record<DiagnosticSeverity, number> = {
    OK: 0,
    WARNING: 1,
    ERROR: 2,
    CRITICAL: 3
  }
  return map[sev]
}

function getSeverityBadgeClass(sev: DiagnosticSeverity): string {
  switch (sev) {
    case 'OK':
      return 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
    case 'WARNING':
      return 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]'
    case 'ERROR':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    case 'CRITICAL':
      return 'border-[hsl(var(--google-red)_/_0.26)] bg-[hsl(var(--google-red)_/_0.18)] text-[hsl(var(--destructive))]'
  }
}

function getSeverityDotClass(sev: DiagnosticSeverity): string {
  switch (sev) {
    case 'OK':
      return 'bg-[hsl(var(--google-green))]'
    case 'WARNING':
      return 'bg-[hsl(var(--google-yellow))]'
    case 'ERROR':
      return 'bg-[hsl(var(--google-red))]'
    case 'CRITICAL':
      return 'bg-[hsl(var(--destructive))]'
  }
}

function getSeverityLabelZh(sev: DiagnosticSeverity): string {
  switch (sev) {
    case 'OK':
      return '正常'
    case 'WARNING':
      return '警告'
    case 'ERROR':
      return '错误'
    case 'CRITICAL':
      return '严重'
  }
}

function getCategoryLabelZh(category: DiagnosticCategory): string {
  switch (category) {
    case 'WS_CONNECTION':
      return 'WS 连接'
    case 'AUTH':
      return '认证'
    case 'CONFIG_DRIFT':
      return '配置漂移'
    case 'HOOKS':
      return 'Hooks'
    case 'TRUSTED_PROXIES':
      return 'Trusted Proxies'
    default:
      return category
  }
}

function buildChangeRequestDescription(report: DiagnosticReport): string {
  const lines: string[] = []
  lines.push(`来源：诊断报告 ${report.id}`)
  lines.push(`时间：${formatDateTimeZh(report.createdAt)}`)
  lines.push(`摘要：${report.summary}`)
  lines.push('')
  lines.push('发现与建议：')

  const nonOk = report.findings.filter(f => f.severity !== 'OK')
  if (nonOk.length === 0) {
    lines.push('- 无需修复：所有项均正常')
    return lines.join('\n')
  }

  for (const f of nonOk) {
    const rec = (f.recommendation || '').trim()
    const details = (f.details || '').trim()
    const parts: string[] = []
    parts.push(`- [${getCategoryLabelZh(f.category)}] (${f.severity}) ${f.message}`)
    if (details) parts.push(`  - 详情：${details}`)
    if (rec) parts.push(`  - 建议：${rec}`)
    lines.push(parts.join('\n'))
  }
  return lines.join('\n')
}

const DIAGNOSTIC_STEPS: Array<{ key: DiagnosticCategory; label: string }> = [
  { key: 'WS_CONNECTION', label: '检查 WebSocket 连接…' },
  { key: 'AUTH', label: '检查认证配置…' },
  { key: 'CONFIG_DRIFT', label: '检查配置漂移…' },
  { key: 'HOOKS', label: '检查 Hooks 配置…' },
  { key: 'TRUSTED_PROXIES', label: '检查 trustedProxies 风险…' }
]

export function DoctorPage() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [workspaceId, setWorkspaceId] = useState<string>(
    localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
  )

  const [reports, setReports] = useState<DiagnosticReportHistoryRow[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string>('')
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [runStatus, setRunStatus] = useState<{
    running: boolean
    progress: number
    stepLabel: string
    message: { type: 'success' | 'error'; text: string } | null
  }>({
    running: false,
    progress: 0,
    stepLabel: '',
    message: null
  })

  const [crStatus, setCrStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [generatingCr, setGeneratingCr] = useState(false)

  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchHistory(port, workspaceId)
        .catch(err => {
          console.error('获取诊断历史失败:', err)
        })
        .finally(() => setLoading(false))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 本页 workspaceId 仅从 localStorage 初始化；如果用户切换 workspace，允许手动刷新。
    // 这里避免自动监听 storage 事件导致状态错乱。
  }, [])

  const fetchHistory = async (port: number, wid: string) => {
    const params = new URLSearchParams({ workspaceId: wid })
    const res = await fetch(`http://127.0.0.1:${port}/api/doctor/reports?${params}`)
    const json = (await res.json()) as ApiResponse<DiagnosticReportHistoryRow[]>
    if (!json.success) {
      throw new Error(json.error || '获取诊断历史失败')
    }
    setReports(json.data || [])
    if (!selectedReportId && json.data && json.data.length > 0) {
      setSelectedReportId(json.data[0].id)
    }
  }

  const fetchReportDetail = async (port: number, id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/doctor/reports/${encodeURIComponent(id)}`)
      const json = (await res.json()) as ApiResponse<DiagnosticReport>
      if (!json.success) {
        throw new Error(json.error || '获取诊断报告详情失败')
      }
      const report = json.data
      setSelectedReport({
        ...report,
        createdAt: typeof report.createdAt === 'string' ? report.createdAt : String(report.createdAt)
      })
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!apiPort || !selectedReportId) return
    fetchReportDetail(apiPort, selectedReportId).catch(err => {
      console.error('获取诊断报告详情失败:', err)
      setSelectedReport(null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPort, selectedReportId])

  useEffect(() => {
    if (!runStatus.running) return
    runningRef.current = true

    let idx = 0
    setRunStatus(prev => ({
      ...prev,
      progress: 5,
      stepLabel: DIAGNOSTIC_STEPS[0]?.label || '准备中…'
    }))

    const timer = setInterval(() => {
      if (!runningRef.current) return
      idx = (idx + 1) % DIAGNOSTIC_STEPS.length
      const step = DIAGNOSTIC_STEPS[idx]
      setRunStatus(prev => {
        const nextProgress = Math.min(95, prev.progress + Math.max(2, Math.floor(90 / DIAGNOSTIC_STEPS.length)))
        return {
          ...prev,
          progress: nextProgress,
          stepLabel: step?.label || prev.stepLabel
        }
      })
    }, 700)

    return () => {
      clearInterval(timer)
      runningRef.current = false
    }
  }, [runStatus.running])

  const handleRunDiagnostic = async () => {
    if (!apiPort) return
    setCrStatus(null)
    setRunStatus({ running: true, progress: 0, stepLabel: '', message: null })
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/doctor/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, createdBy: 'admin' }),
        signal: controller.signal
      })

      const json = (await response.json()) as ApiResponse<DiagnosticReport>
      if (!json.success) {
        throw new Error(json.error || '运行诊断失败')
      }

      const report = json.data
      setSelectedReportId(report.id)
      setSelectedReport({
        ...report,
        createdAt: typeof report.createdAt === 'string' ? report.createdAt : String(report.createdAt)
      })

      await fetchHistory(apiPort, workspaceId)
      setRunStatus(prev => ({
        ...prev,
        running: false,
        progress: 100,
        stepLabel: '诊断完成',
        message: { type: 'success', text: '诊断已完成，报告已生成' }
      }))
    } catch (error) {
      console.error('运行诊断失败:', error)
      setRunStatus(prev => ({
        ...prev,
        running: false,
        progress: 0,
        stepLabel: '',
        message: { type: 'error', text: `运行诊断失败：${toErrorMessage(error)}` }
      }))
    }
  }

  const groupedFindings = useMemo(() => {
    const findings = selectedReport?.findings || []
    const by: Record<string, DiagnosticFinding[]> = {}
    for (const f of findings) {
      const key = f.category || 'UNKNOWN'
      if (!by[key]) by[key] = []
      by[key].push(f)
    }
    const entries = Object.entries(by)
      .map(([category, list]) => {
        const sorted = [...list].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        const maxSev = sorted.reduce<DiagnosticSeverity>((acc, cur) => (severityRank(cur.severity) > severityRank(acc) ? cur.severity : acc), 'OK')
        return { category, findings: sorted, maxSeverity: maxSev }
      })
      .sort((a, b) => severityRank(b.maxSeverity) - severityRank(a.maxSeverity))

    return entries
  }, [selectedReport])

  const overallSeverity = selectedReport?.severity

  const handleRefreshWorkspace = async () => {
    if (!apiPort) return
    const wid = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
    setWorkspaceId(wid)
    setSelectedReport(null)
    setSelectedReportId('')
    setCrStatus(null)
    setRunStatus(prev => ({ ...prev, message: null }))
    try {
      await fetchHistory(apiPort, wid)
    } catch (error) {
      console.error('刷新诊断历史失败:', error)
      setRunStatus(prev => ({
        ...prev,
        message: { type: 'error', text: `刷新失败：${toErrorMessage(error)}` }
      }))
    }
  }

  const handleGenerateChangeRequest = async () => {
    if (!apiPort || !selectedReport) return
    setGeneratingCr(true)
    setCrStatus(null)
    try {
      // 1) 获取最新漂移 diffId（可直接生成可执行的配置变更单）
      const driftRes = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${encodeURIComponent(selectedReport.workspaceId)}/drift/latest`)
      const driftJson = (await driftRes.json()) as ApiResponse<DriftLatest | null>
      if (!driftJson.success) {
        throw new Error(driftJson.error || '获取最新漂移失败')
      }
      if (!driftJson.data || !driftJson.data.id) {
        throw new Error('未找到漂移 diff（需要先保存期望配置并同步实际配置后再试）')
      }

      // 2) 创建变更单（基于 drift diff）
      const title = `诊断修复建议（${formatDateTimeZh(selectedReport.createdAt)}）`
      const description = buildChangeRequestDescription(selectedReport)
      const createRes = await fetch(
        `http://127.0.0.1:${apiPort}/api/workspaces/${encodeURIComponent(selectedReport.workspaceId)}/change-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diffId: driftJson.data.id, title, description })
        }
      )
      const createJson = (await createRes.json()) as ApiResponse<ChangeRequest>
      if (!createJson.success) {
        throw new Error(createJson.error || '创建变更单失败')
      }

      const cr = createJson.data

      // 3) 提交执行（会自动触发审批：CHANGE_CONFIG）
      const execRes = await fetch(`http://127.0.0.1:${apiPort}/api/change-requests/${encodeURIComponent(cr.id)}/execute`, {
        method: 'POST'
      })
      const execJson = (await execRes.json()) as unknown

      // 兼容两种返回：fail/ok 包装，或 pending_approval 原样对象
      if (typeof execJson === 'object' && execJson !== null && 'success' in execJson) {
        const wrapped = execJson as ApiResponse<unknown>
        if (!wrapped.success) {
          throw new Error(wrapped.error || '提交执行失败')
        }
        setCrStatus({ type: 'success', text: `已创建变更单并提交执行：${cr.id}` })
        return
      }

      if (typeof execJson === 'object' && execJson !== null && 'status' in execJson) {
        const statusObj = execJson as { status?: string; approvalId?: string; message?: string }
        if (statusObj.status === 'pending_approval') {
          setCrStatus({
            type: 'success',
            text: `已创建变更单并发起审批（审批 ID: ${statusObj.approvalId || '未知'}；变更单 ID: ${cr.id}）。请到「审批中心」通过后再次执行。`
          })
          return
        }
      }

      setCrStatus({ type: 'success', text: `已创建变更单：${cr.id}（执行返回结构不符合预期，请到「变更单」页面查看状态）` })
    } catch (error) {
      console.error('生成变更单失败:', error)
      setCrStatus({ type: 'error', text: `生成变更单失败：${toErrorMessage(error)}` })
    } finally {
      setGeneratingCr(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card)_/_0.76)] px-6 py-5 shadow-workshop-sm backdrop-blur flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">诊断中心</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            运行工作区健康诊断：WS 连接、认证、漂移、Hooks 与 trustedProxies 风险
          </p>
          <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Workspace: <span className="font-mono">{workspaceId}</span>
            <button
              onClick={handleRefreshWorkspace}
              className="ml-3 rounded-full border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.08)] px-3 py-1 text-[hsl(var(--google-blue))] hover:bg-[hsl(var(--google-blue)_/_0.14)]"
              type="button"
            >
              刷新
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/alerts')}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            type="button"
          >
            查看 Alerts
          </button>
          <button
            onClick={handleRunDiagnostic}
            disabled={!apiPort || runStatus.running}
            className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 transition-opacity"
            type="button"
          >
            {runStatus.running ? '运行中…' : 'Run Diagnostic'}
          </button>
        </div>
      </div>

      {(runStatus.message || crStatus) && (
        <div className="space-y-2">
          {runStatus.message && (
            <div
              className={`rounded-workshop-lg border p-3 text-sm shadow-workshop-sm ${
                runStatus.message.type === 'success'
                  ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
                  : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
              }`}
            >
              {runStatus.message.text}
            </div>
          )}
          {crStatus && (
            <div
              className={`rounded-workshop-lg border p-3 text-sm shadow-workshop-sm ${
                crStatus.type === 'success'
                  ? 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.08)] text-[hsl(var(--google-blue))]'
                  : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
              }`}
            >
              {crStatus.text}
            </div>
          )}
        </div>
      )}

      {runStatus.running && (
        <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
              <div>
                <div className="text-sm font-medium text-[hsl(var(--foreground))]">诊断进行中</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{runStatus.stepLabel}</div>
              </div>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">{runStatus.progress}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              className="h-2 bg-[hsl(var(--primary))] transition-all duration-300 ease-out relative"
              style={{ width: `${runStatus.progress}%` }}
            >
              <div className="absolute inset-0 opacity-30 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse"></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 历史列表 */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
            <div className="p-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">诊断历史</h2>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">最近 {reports.length} 条</span>
              </div>
            </div>

            {reports.length === 0 ? (
              <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">暂无诊断报告</div>
            ) : (
              <div className="divide-y divide-[hsl(var(--border))] max-h-[520px] overflow-auto">
                {reports.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className={`w-full p-4 text-left transition-colors hover:bg-[hsl(var(--accent)_/_0.56)] ${
                      selectedReportId === r.id ? 'bg-[hsl(var(--accent)_/_0.56)]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium ${getSeverityBadgeClass(r.severity)}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${getSeverityDotClass(r.severity)}`}></span>
                            {getSeverityLabelZh(r.severity)}
                          </span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateTimeZh(r.createdAt)}</span>
                        </div>
                        <div className="mt-2 text-sm text-[hsl(var(--foreground))] line-clamp-2">{r.summary}</div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] font-mono truncate">{r.id}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 报告详情 */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
            <div className="p-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">诊断报告</h2>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    点击左侧历史记录查看详情
                  </p>
                </div>

                <button
                  onClick={handleGenerateChangeRequest}
                  disabled={!selectedReport || generatingCr}
                  className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-50 transition-colors"
                  type="button"
                  title="基于最新漂移（drift）生成可执行的配置变更单，并自动触发审批"
                >
                  {generatingCr ? '生成中…' : '一键生成 Change Request'}
                </button>
              </div>
            </div>

            {!selectedReportId ? (
              <div className="p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">请选择一条诊断历史或运行一次诊断</div>
            ) : detailLoading ? (
              <div className="p-10 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
              </div>
            ) : !selectedReport ? (
              <div className="p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">无法加载该报告详情</div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {overallSeverity && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium ${getSeverityBadgeClass(overallSeverity)}`}>
                        <span className={`h-2 w-2 rounded-full ${getSeverityDotClass(overallSeverity)}`}></span>
                        总体：{getSeverityLabelZh(overallSeverity)}
                      </span>
                    )}
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateTimeZh(selectedReport.createdAt)}</span>
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{selectedReport.id}</div>
                </div>

                <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] p-3 shadow-workshop-sm">
                  <div className="text-sm text-[hsl(var(--foreground))]">{selectedReport.summary}</div>
                </div>

                <div className="space-y-3">
                  {groupedFindings.length === 0 ? (
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无 findings</div>
                  ) : (
                    groupedFindings.map(group => {
                      const catLabel = getCategoryLabelZh(group.category)
                      const count = group.findings.length
                      const highest = group.maxSeverity
                      const nonOkCount = group.findings.filter(f => f.severity !== 'OK').length
                      return (
                        <details
                          key={group.category}
                          className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] shadow-workshop-sm"
                          open={severityRank(highest) >= severityRank('ERROR')}
                        >
                          <summary className="cursor-pointer select-none list-none p-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium ${getSeverityBadgeClass(highest)}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${getSeverityDotClass(highest)}`}></span>
                                {catLabel}
                              </span>
                              <span className="text-sm text-[hsl(var(--foreground))] truncate">{catLabel}</span>
                            </div>
                            <div className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
                              {nonOkCount > 0 ? `${nonOkCount} 待处理 / ` : ''}{count} 项
                            </div>
                          </summary>
                          <div className="px-3 pb-3 space-y-2">
                            {group.findings.map((f, idx) => (
                              <div
                                key={`${group.category}-${idx}-${f.message}`}
                                className={`rounded-workshop-lg border p-3 shadow-workshop-sm ${
                                  f.severity === 'OK'
                                    ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.08)]'
                                    : f.severity === 'WARNING'
                                    ? 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.12)]'
                                    : f.severity === 'ERROR'
                                    ? 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.08)]'
                                    : 'border-[hsl(var(--google-red)_/_0.24)] bg-[hsl(var(--google-red)_/_0.14)]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium ${getSeverityBadgeClass(f.severity)}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${getSeverityDotClass(f.severity)}`}></span>
                                        {getSeverityLabelZh(f.severity)}
                                      </span>
                                      <span className="text-sm text-[hsl(var(--foreground))] break-words">{f.message}</span>
                                    </div>
                                    {f.details && (
                                      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">
                                        <span className="font-medium">详情：</span>
                                        {f.details}
                                      </div>
                                    )}
                                    {f.recommendation && (
                                      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">
                                        <span className="font-medium">建议：</span>
                                        {f.recommendation}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
