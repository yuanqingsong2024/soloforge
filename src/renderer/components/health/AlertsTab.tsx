import { useEffect, useState } from 'react'
import { getApiPort } from '../../lib/api'
import { getHealthErrorPanelClass, getHealthMetricBadgeClass, getHealthSeverityBadgeClass, getHealthStatusBadgeClass } from '../../lib/health-badge'

interface Alert {
  id: string
  workspaceId: string
  targetId: string | null
  sourceCheckId: string | null
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  status: 'OPEN' | 'ACKED' | 'RESOLVED'
  title: string
  summary: string
  traceId: string | null
  createdAt: string
  updatedAt: string
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

interface AlertsTabProps {
  workspaceId: string
}

export function AlertsTab({ workspaceId }: AlertsTabProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')

  useEffect(() => {
    void loadAlerts()
  }, [workspaceId])

  async function loadAlerts() {
    try {
      setLoading(true)
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/alerts?workspaceId=${encodeURIComponent(workspaceId)}`)
      if (!res.ok) {
        throw new Error('加载告警失败')
      }

      const data = await res.json() as ApiResponse<Alert[]>
      if (!data.success) {
        throw new Error(data.error)
      }

      setAlerts(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }

  async function updateAlertStatus(alertId: string, status: 'ACKED' | 'RESOLVED') {
    try {
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/alerts/${alertId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (!res.ok) {
        throw new Error(status === 'ACKED' ? '确认告警失败' : '解决告警失败')
      }

      const updated = await res.json() as ApiResponse<Alert>
      if (!updated.success) {
        throw new Error(updated.error)
      }

      if (selectedAlert?.id === alertId) {
        setSelectedAlert(updated.data)
      }

      await loadAlerts()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }

  const filteredAlerts = alerts.filter(alert => {
    if (filterStatus !== 'all' && alert.status !== filterStatus) return false
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false
    return true
  })

  const activeCount = alerts.filter(alert => alert.status === 'OPEN').length
  const acknowledgedCount = alerts.filter(alert => alert.status === 'ACKED').length
  const resolvedCount = alerts.filter(alert => alert.status === 'RESOLVED').length

  if (loading) {
    return <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">加载中...</div>
  }

  if (error) {
    return (
      <div className={getHealthErrorPanelClass()}>
        <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        <button
          onClick={() => void loadAlerts()}
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
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-workshop-sm border ${getHealthMetricBadgeClass('danger')}`}>
            <span className="text-sm font-medium">活跃: {activeCount}</span>
          </div>
          <div className={`px-3 py-1 rounded-workshop-sm border ${getHealthMetricBadgeClass('warning')}`}>
            <span className="text-sm font-medium">已确认: {acknowledgedCount}</span>
          </div>
          <div className={`px-3 py-1 rounded-workshop-sm border ${getHealthMetricBadgeClass('success')}`}>
            <span className="text-sm font-medium">已解决: {resolvedCount}</span>
          </div>
        </div>
        <button
          onClick={() => void loadAlerts()}
          className="px-4 py-2 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--secondary))]/80 transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] mr-2">状态:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1 rounded-workshop-sm border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          >
            <option value="all">全部</option>
            <option value="OPEN">活跃</option>
            <option value="ACKED">已确认</option>
            <option value="RESOLVED">已解决</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] mr-2">严重程度:</label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-3 py-1 rounded-workshop-sm border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          >
            <option value="all">全部</option>
            <option value="CRITICAL">严重</option>
            <option value="ERROR">错误</option>
            <option value="WARN">警告</option>
            <option value="INFO">信息</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">
            告警列表 ({filteredAlerts.length})
          </h4>
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
              暂无告警
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlert(alert)}
                  className={`p-4 rounded-workshop-md border cursor-pointer transition-colors ${
                    selectedAlert?.id === alert.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                      : `${getHealthSeverityBadgeClass(alert.severity, true)} hover:border-[hsl(var(--primary))]/50`
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthStatusBadgeClass(alert.status)}`}>
                          {alert.status}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthSeverityBadgeClass(alert.severity)}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <h5 className="text-sm font-medium text-[hsl(var(--foreground))]">
                        {alert.title}
                      </h5>
                      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        {alert.summary}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] flex-wrap">
                        <span>来源检查: {alert.sourceCheckId || '未关联'}</span>
                        {alert.targetId && <span>目标: {alert.targetId}</span>}
                        <span>{new Date(alert.createdAt).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selectedAlert ? (
            <>
              <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">告警详情</h4>
              <div className="rounded-workshop-md border border-[hsl(var(--border))] p-4 space-y-4">
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">标题</label>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {selectedAlert.title}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">状态</label>
                  <p className="text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthStatusBadgeClass(selectedAlert.status)}`}>
                      {selectedAlert.status}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">严重程度</label>
                  <p className="text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthSeverityBadgeClass(selectedAlert.severity)}`}>
                      {selectedAlert.severity}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">摘要</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">{selectedAlert.summary}</p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">来源检查</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">{selectedAlert.sourceCheckId || '未关联'}</p>
                </div>
                {selectedAlert.targetId && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">目标</label>
                    <p className="text-sm text-[hsl(var(--foreground))]">{selectedAlert.targetId}</p>
                  </div>
                )}
                {selectedAlert.traceId && (
                  <div>
                    <label className="text-xs text-[hsl(var(--muted-foreground))]">追踪 ID</label>
                    <p className="text-sm text-[hsl(var(--foreground))] break-all">{selectedAlert.traceId}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">创建时间</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    {new Date(selectedAlert.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">更新时间</label>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    {new Date(selectedAlert.updatedAt).toLocaleString('zh-CN')}
                  </p>
                </div>

                <div className="flex gap-2 pt-4 border-t border-[hsl(var(--border))]">
                  {selectedAlert.status === 'OPEN' && (
                    <button
                      onClick={() => void updateAlertStatus(selectedAlert.id, 'ACKED')}
                      className="flex-1 px-4 py-2 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--secondary))]/80 transition-colors"
                    >
                      确认
                    </button>
                  )}
                  {(selectedAlert.status === 'OPEN' || selectedAlert.status === 'ACKED') && (
                    <button
                      onClick={() => void updateAlertStatus(selectedAlert.id, 'RESOLVED')}
                      className="flex-1 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--primary))]/90 transition-colors"
                    >
                      解决
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
              选择一个告警查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
