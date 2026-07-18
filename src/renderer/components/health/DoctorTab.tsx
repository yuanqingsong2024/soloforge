import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getApiPort } from '../../lib/api'
import { getHealthErrorPanelClass, getHealthSeverityBadgeClass, getHealthStatusBadgeClass } from '../../lib/health-badge'
import { translateEnum } from '../../lib/i18n-helpers'

interface DiagnosticReport {
  id: string
  workspaceId: string
  checkId: string
  status: 'PASS' | 'WARN' | 'FAIL'
  message: string | null
  details: unknown
  createdAt: string
  check?: {
    id: string
    name: string
    category: string
    severity: string
  }
}

interface DoctorCheck {
  id: string
  name: string
  category: string
  description: string | null
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  enabled: boolean
  lastRunAt?: string
  score?: number | null
}

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

interface DoctorTabProps {
  workspaceId: string
}

export function DoctorTab({ workspaceId }: DoctorTabProps) {
  const { t } = useTranslation('common')
  const [reports, setReports] = useState<DiagnosticReport[]>([])
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null)
  const [runningCheck, setRunningCheck] = useState(false)

  useEffect(() => {
    void loadData()
  }, [workspaceId])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const port = await getApiPort()
      const query = `?workspaceId=${encodeURIComponent(workspaceId)}`

      const [reportsRes, checksRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/doctor/reports${query}`),
        fetch(`http://127.0.0.1:${port}/api/doctor/checks${query}`)
      ])

      if (!reportsRes.ok || !checksRes.ok) {
        throw new Error('加载数据失败')
      }

      const reportsData = await reportsRes.json() as ApiResponse<DiagnosticReport[]>
      const checksData = await checksRes.json() as ApiResponse<DoctorCheck[]>

      if (!reportsData.success) {
        throw new Error(reportsData.error)
      }
      if (!checksData.success) {
        throw new Error(checksData.error)
      }

      setReports(reportsData.data)
      setChecks(checksData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }

  async function runAllChecks() {
    try {
      setRunningCheck(true)
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/doctor/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, createdBy: 'admin' })
      })

      if (!res.ok) {
        throw new Error('执行诊断失败')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setRunningCheck(false)
    }
  }

  async function runSingleCheck(checkId: string) {
    try {
      setRunningCheck(true)
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/doctor/run/${checkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, createdBy: 'admin' })
      })

      if (!res.ok) {
        throw new Error('执行诊断失败')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setRunningCheck(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">加载中...</div>
  }

  if (error) {
    return (
      <div className={getHealthErrorPanelClass()}>
        <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        <button
          onClick={() => void loadData()}
          className="mt-2 text-sm text-[hsl(var(--destructive))] hover:opacity-80 underline"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">诊断报告</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            最近 {reports.length} 条诊断结果
          </p>
        </div>
        <button
          onClick={() => void runAllChecks()}
          disabled={runningCheck}
          className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {runningCheck ? '执行中...' : '执行全部诊断'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">诊断结果</h4>
          {reports.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
              暂无诊断报告
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`p-4 rounded-workshop-md border cursor-pointer transition-colors ${
                    selectedReport?.id === report.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthStatusBadgeClass(report.status)}`}>
                          {translateEnum(t, 'commonStatusMap', report.status)}
                        </span>
                        <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {report.check?.name || report.checkId}
                        </span>
                        {report.check?.severity && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthSeverityBadgeClass(report.check.severity)}`}>
                            {translateEnum(t, 'severityMap', report.check.severity)}
                          </span>
                        )}
                      </div>
                      {report.message && (
                        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                          {report.message}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(report.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selectedReport ? (
            <>
              <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">报告详情</h4>
              <div className="rounded-workshop-md border border-[hsl(var(--border))] p-4 space-y-4">
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">检查项</label>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {selectedReport.check?.name || selectedReport.checkId}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">状态</label>
                  <p className="text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthStatusBadgeClass(selectedReport.status)}`}>
                      {translateEnum(t, 'commonStatusMap', selectedReport.status)}
                    </span>
                  </p>
                </div>
                {selectedReport.message && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">消息</label>
                    <p className="text-sm text-[hsl(var(--foreground))]">{selectedReport.message}</p>
                  </div>
                )}
                {selectedReport.details != null && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">详细信息</label>
                    <pre className="mt-1 p-2 bg-[hsl(var(--muted))] rounded text-xs overflow-auto max-h-64">
                      {JSON.stringify(selectedReport.details, null, 2)}
                    </pre>
                  </div>
                )}
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">执行时间</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    {new Date(selectedReport.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">可用检查项</h4>
              <div className="space-y-2">
                {checks.filter(check => check.enabled).map((check) => (
                  <div
                    key={check.id}
                    className="p-4 rounded-workshop-md border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {check.name}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthSeverityBadgeClass(check.severity)}`}>
                            {translateEnum(t, 'severityMap', check.severity)}
                          </span>
                        </div>
                        {check.description && (
                          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] break-all">
                            {check.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          检查分类: {translateEnum(t, 'doctorCategoryMap', check.category)}
                        </p>
                        {check.lastRunAt && (
                          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            上次运行: {new Date(check.lastRunAt).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void runSingleCheck(check.id)}
                        disabled={runningCheck}
                        className="ml-4 px-3 py-1 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-sm hover:bg-[hsl(var(--secondary))]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        执行
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
