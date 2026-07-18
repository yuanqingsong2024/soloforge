import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getApiPort } from '../lib/api'
import { getHealthErrorPanelClass, getHealthSeverityBadgeClass, getHealthStatusBadgeClass } from '../lib/health-badge'
import { translateEnum } from '../lib/i18n-helpers'

interface DiagnosticReport {
  id: string
  workspaceId: string
  checkId: string
  status: 'PASS' | 'WARN' | 'FAIL'
  message: string | null
  details: any
  createdAt: string
  check?: {
    id: string
    name: string
    category: string
    severity: string
  }
}

interface DoctorCheckListItem {
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

export function DoctorPage() {
  const { t } = useTranslation('common')
  const [searchParams] = useSearchParams()
  const workspaceId = searchParams.get('workspaceId')
  
  const [reports, setReports] = useState<DiagnosticReport[]>([])
  const [checks, setChecks] = useState<DoctorCheckListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null)
  const [runningCheck, setRunningCheck] = useState(false)

  useEffect(() => {
    loadData()
  }, [workspaceId])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const port = await getApiPort()
      
      const [reportsRes, checksRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/doctor/reports${workspaceId ? `?workspaceId=${workspaceId}` : ''}`),
        fetch(`http://127.0.0.1:${port}/api/doctor/checks${workspaceId ? `?workspaceId=${workspaceId}` : ''}`)
      ])

      if (!reportsRes.ok || !checksRes.ok) {
        throw new Error('加载数据失败')
      }

      const reportsData = await reportsRes.json() as ApiResponse<DiagnosticReport[]>
      const checksData = await checksRes.json() as ApiResponse<DoctorCheckListItem[]>

      setReports(reportsData.success ? reportsData.data : [])
      setChecks(checksData.success ? checksData.data : [])
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
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className={getHealthErrorPanelClass()}>
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 text-sm text-[hsl(var(--destructive))] hover:opacity-80 underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">系统诊断 (Doctor)</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            运行系统健康检查并查看诊断报告
            {workspaceId && ` (工作空间: ${workspaceId})`}
          </p>
        </div>
        <button
          onClick={runAllChecks}
          disabled={runningCheck}
          className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {runningCheck ? '执行中...' : '执行全部诊断'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：诊断结果列表 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">诊断结果</h2>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              共 {reports.length} 条
            </span>
          </div>
          
          {reports.length === 0 ? (
            <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
              <p>暂无诊断报告</p>
              <p className="text-xs mt-2">点击右上角"执行全部诊断"开始检查</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
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

        {/* 右侧：详情或可用检查项 */}
        <div className="space-y-4">
          {selectedReport ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">报告详情</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  关闭
                </button>
              </div>
              <div className="rounded-workshop-md border border-[hsl(var(--border))] p-4 space-y-4">
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">检查项</label>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {selectedReport.check?.name || selectedReport.checkId}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">检查分类</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    {selectedReport.check?.category || '-'}
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
                {selectedReport.check?.severity && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">严重程度</label>
                    <p className="text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthSeverityBadgeClass(selectedReport.check.severity)}`}>
                        {translateEnum(t, 'severityMap', selectedReport.check.severity)}
                      </span>
                    </p>
                  </div>
                )}
                {selectedReport.message && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">消息</label>
                    <p className="text-sm text-[hsl(var(--foreground))]">{selectedReport.message}</p>
                  </div>
                )}
                {selectedReport.details && (
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">可用检查项</h2>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {checks.filter(c => c.enabled).length} 个已启用
                </span>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {checks.filter(c => c.enabled).length === 0 ? (
                  <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
                    暂无可用的检查项
                  </div>
                ) : (
                  checks.filter(c => c.enabled).map((check) => (
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
                            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] [overflow-wrap:anywhere]">
                              {check.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            检查分类: {translateEnum(t, 'doctorCategoryMap', check.category)}
                          </p>
                        </div>
                        <button
                          onClick={() => runSingleCheck(check.id)}
                          disabled={runningCheck}
                          className="ml-4 px-3 py-1 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-sm hover:bg-[hsl(var(--secondary))]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          执行
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
