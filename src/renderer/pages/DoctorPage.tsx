import { useState, useEffect } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiFetch, ApiResponse } from '../lib/api'
import { getHealthErrorPanelClass, getHealthSeverityBadgeClass, getHealthStatusBadgeClass } from '../lib/health-badge'
import { translateEnum } from '../lib/i18n-helpers'
import { LoadingState } from '../components/ui/LoadingState'

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
      
      const [reportsData, checksData] = await Promise.all([
        apiFetch<ApiResponse<DiagnosticReport[]>>(`/api/doctor/reports${workspaceId ? `?workspaceId=${workspaceId}` : ''}`),
        apiFetch<ApiResponse<DoctorCheckListItem[]>>(`/api/doctor/checks${workspaceId ? `?workspaceId=${workspaceId}` : ''}`)
      ])

      setReports(reportsData.success ? (reportsData.data ?? []) : [])
      setChecks(checksData.success ? (checksData.data ?? []) : [])
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
      
      await apiFetch('/api/doctor/run', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, createdBy: 'admin' })
      })

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
      
      await apiFetch(`/api/doctor/run/${checkId}`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId, createdBy: 'admin' })
      })

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setRunningCheck(false)
    }
  }

  if (loading) {
    return <LoadingState message="加载健康检查数据中..." fullPage />
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
          className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className={`p-4 rounded-md border cursor-pointer transition-colors ${
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
                        {formatDateTime(report.createdAt)}
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
              <div className="rounded-md border border-[hsl(var(--border))] p-4 space-y-4">
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
                {selectedReport.details ? (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">详细信息</label>
                    <pre className="mt-1 p-2 bg-[hsl(var(--muted))] rounded text-xs overflow-auto max-h-64">
                      {JSON.stringify(selectedReport.details as object, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">执行时间</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    {formatDateTime(selectedReport.createdAt)}
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
                      className="p-4 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 transition-colors"
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
                          className="ml-4 px-3 py-1 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-sm hover:bg-[hsl(var(--secondary))]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
