import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
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
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [filters, setFilters] = useState({
    ticketId: '',
    traceId: '',
    actor: ''
  })
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
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
  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }
  return (
    <div>
      <PageHeader
        title="审计日志"
        description="全链路操作记录与回放"
      />
      {/* 筛选器 */}
      <SectionCard className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <input
            type="text"
            placeholder="Trace ID"
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
            placeholder="操作人"
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
            placeholder="工单 ID"
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
            搜索
          </button>
        </div>
      </SectionCard>
      {/* 日志列表 */}
      <div className="space-y-3">
        {logs.length === 0 ? (
          <SectionCard>
            <div className="text-center py-8">
              <p className="text-[hsl(var(--muted-foreground))]">暂无审计日志</p>
            </div>
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
                        title="点击复制 Trace ID"
                      >
                        {log.traceId}
                      </button>
                      <span className="text-[hsl(var(--muted-foreground))]">•</span>
                      <span className="font-medium text-[hsl(var(--foreground))]">{log.action}</span>
                      {log.tool && (
                        <>
                          <span className="text-[hsl(var(--muted-foreground))]">•</span>
                          <span className="text-sm text-[hsl(var(--muted-foreground))]">{log.tool}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex items-center text-sm text-[hsl(var(--muted-foreground))] gap-2 flex-wrap">
                      <span>操作人: {log.actor}</span>
                      {log.ticket && (
                        <>
                          <span>•</span>
                          <span>工单: {log.ticket.title}</span>
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
                      <h4 className="font-medium text-sm text-[hsl(var(--foreground))] mb-2">请求:</h4>
                      <pre className="max-h-64 overflow-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-3 text-xs font-mono text-[hsl(var(--foreground))]">
                        {JSON.stringify(JSON.parse(log.request), null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-[hsl(var(--foreground))] mb-2">响应:</h4>
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
