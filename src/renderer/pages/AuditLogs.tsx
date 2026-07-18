import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { translateEnum } from '../lib/i18n-helpers'

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
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchLogs(port)
    })
  }, [])

  const fetchLogs = async (port: number) => {
    try {
      const params = new URLSearchParams()
      if (filters.ticketId) params.append('ticketId', filters.ticketId)
      if (filters.traceId) params.append('traceId', filters.traceId)
      if (filters.actor) params.append('actor', filters.actor)

      const url = `http://127.0.0.1:${port}/api/audit-logs?${params}`
      const response = await fetch(url)
      const data = await response.json()
      setLogs(data)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (apiPort) {
      setLoading(true)
      fetchLogs(apiPort)
    }
  }

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
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
          <button
            onClick={handleSearch}
            className="rounded-full px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                     hover:opacity-90 transition-opacity
                     text-sm font-medium"
          >
            {t('common:buttons.search')}
          </button>
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
                      <span>{new Date(log.ts).toLocaleString('zh-CN')}</span>
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
                      <pre className="max-h-64 overflow-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-3 text-xs font-mono text-[hsl(var(--foreground))]">
                        {JSON.stringify(JSON.parse(log.request), null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-[hsl(var(--foreground))] mb-2">{t('audit:responseLabel')}:</h4>
                      <pre className="max-h-64 overflow-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-3 text-xs font-mono text-[hsl(var(--foreground))]">
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
