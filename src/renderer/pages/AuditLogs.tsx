import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { translateEnum } from '../lib/i18n-helpers'
import { formatDateTime } from '../lib/i18n-formatters'

interface AuditLog {
  id: string
  ticketId?: string
  traceId: string
  actor: string
  action: string
  tool?: string
  request: string
  response: string
  ts: string
  ticket?: { title: string }
}

export function AuditLogs() {
  const { t } = useTranslation(['audit', 'common'])
  const location = useLocation()
  const initialFilters = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      ticketId: params.get('ticketId') || '',
      traceId: params.get('traceId') || '',
      actor: params.get('actor') || ''
    }
  }, [location.search])
  
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [reportGenerating, setReportGenerating] = useState(false)
  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  useEffect(() => {
    void fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.ticketId) params.append('ticketId', filters.ticketId)
      if (filters.traceId) params.append('traceId', filters.traceId)
      if (filters.actor) params.append('actor', filters.actor)

      const url = `/api/audit-logs?${params}`
      const data = await apiFetch<AuditLog[]>(url)
      setLogs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setLoading(true)
    void fetchLogs()
  }

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // 导出审计日志
  const exportLogs = async (format: 'json' | 'csv') => {
    setExporting(true)
    try {
      const filterParams: Record<string, string> = {}
      if (filters.traceId) filterParams.traceId = filters.traceId
      if (filters.actor) filterParams.actor = filters.actor
      if (filters.ticketId) filterParams.ticketId = filters.ticketId

      const url = `/api/audit-export/export/${format}`
      const response = await apiFetch<{ success: boolean; data: string; filename: string }>(url, {
        method: 'POST',
        body: JSON.stringify({
          format,
          filter: filterParams,
          includeHashChain: true,
          masked: true
        })
      })

      if (response.success && response.data) {
        // 创建下载
        const blob = new Blob([response.data], { type: format === 'json' ? 'application/json' : 'text/csv' })
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = response.filename || `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      }
    } catch (error) {
      console.error('导出失败:', error)
    } finally {
      setExporting(false)
    }
  }

  // 生成报表
  const generateReport = async () => {
    setReportGenerating(true)
    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30) // 默认最近 30 天

      const response = await apiFetch<{ success: boolean; data: string; filename: string }>(
        '/api/audit-export/report/csv',
        {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: '00000000-0000-0000-0000-000000000001',
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          })
        }
      )

      if (response.success && response.data) {
        const blob = new Blob([response.data], { type: 'text/csv' })
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = response.filename || `audit-report-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      }
    } catch (error) {
      console.error('报表生成失败:', error)
    } finally {
      setReportGenerating(false)
    }
  }

  if (loading) {
    return (
      <LoadingState message="加载审计日志中..." />
    )
  }

  return (
    <div>
      <PageHeader
        title={t('audit:pageTitle')}
        description={t('audit:pageDescription')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => exportLogs('csv')} loading={exporting} disabled={loading}>
              导出 CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportLogs('json')} loading={exporting} disabled={loading}>
              导出 JSON
            </Button>
            <Button size="sm" onClick={generateReport} loading={reportGenerating}>
              生成报表
            </Button>
          </div>
        }
      />

      <SectionCard className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <input
            type="text"
            placeholder={t('audit:filters.traceId')}
            value={filters.traceId}
            onChange={e => setFilters({ ...filters, traceId: e.target.value })}
            className="rounded-full px-4 py-2.5 text-sm
                     bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                     border border-[hsl(var(--border))]
                     placeholder:text-[hsl(var(--muted-foreground))]
                     focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <input
            type="text"
            placeholder={t('audit:filters.actor')}
            value={filters.actor}
            onChange={e => setFilters({ ...filters, actor: e.target.value })}
            className="rounded-full px-4 py-2.5 text-sm
                     bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                     border border-[hsl(var(--border))]
                     placeholder:text-[hsl(var(--muted-foreground))]
                     focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <input
            type="text"
            placeholder={t('audit:filters.ticketId')}
            value={filters.ticketId}
            onChange={e => setFilters({ ...filters, ticketId: e.target.value })}
            className="rounded-full px-4 py-2.5 text-sm
                     bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                     border border-[hsl(var(--border))]
                     placeholder:text-[hsl(var(--muted-foreground))]
                     focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <Button size="sm" onClick={handleSearch}>
            {t('common:buttons.search')}
          </Button>
        </div>
      </SectionCard>

      <div className="space-y-3">
        {logs.length === 0 ? (
          <SectionCard>
            <EmptyState message={t('audit:noLogs')} />
          </SectionCard>
        ) : (
          logs.map(log => (
            <SectionCard key={log.id} className="!p-0">
              <div
                className="cursor-pointer p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.62)]"
                onClick={() => toggleExpand(log.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(log.traceId)
                        }}
                        className="font-mono text-sm text-[hsl(var(--primary))] hover:underline"
                        title={t('audit:actions.copyTraceId')}
                      >
                        {log.traceId}
                      </button>
                      <span className="text-[hsl(var(--muted-foreground))]">•</span>
                      <span className="font-medium text-[hsl(var(--foreground))]">{translateEnum(t, 'systemActionMap', log.action)}</span>
                      {log.tool && (
                        <>
                          <span className="text-[hsl(var(--muted-foreground))]">•</span>
                          <span className="text-sm text-[hsl(var(--muted-foreground))]">{log.tool}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex items-center text-sm text-[hsl(var(--muted-foreground))] gap-2 flex-wrap">
                      <span>{t('audit:columns.actor')}: {log.actor}</span>
                      {log.ticket && (
                        <>
                          <span>•</span>
                          <span>{t('audit:ticketLabel')}: {log.ticket.title}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatDateTime(log.ts)}</span>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-[hsl(var(--muted-foreground))] transition-transform flex-shrink-0 ${
                      expandedLog === log.id ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {expandedLog === log.id && (
                <div className="border-t border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-[hsl(var(--foreground))] mb-2">{t('audit:requestLabel')}:</h4>
                      <pre className="max-h-64 overflow-auto rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-3 text-xs font-mono text-[hsl(var(--foreground))]">
                        {JSON.stringify(JSON.parse(log.request), null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-[hsl(var(--foreground))] mb-2">{t('audit:responseLabel')}:</h4>
                      <pre className="max-h-64 overflow-auto rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-3 text-xs font-mono text-[hsl(var(--foreground))]">
                        {JSON.stringify(JSON.parse(log.response), null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          ))
        )}
      </div>
    </div>
  )
}
