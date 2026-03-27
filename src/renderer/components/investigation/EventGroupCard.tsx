import { EventRecord } from './types'
import { eventRowSeverityStyle, severityColor, severityDotColor, sourceTypeColor, SourceTypeIcon } from './styles'

interface SummaryEntry {
  label: string
  value: string
}

interface EventGroupCardProps {
  title: string
  subtitle: string
  groupKey: string
  collapsed: boolean
  onToggle: (groupKey: string) => void
  events: EventRecord[]
  getSummaryEntries: (event: EventRecord) => SummaryEntry[]
  onJump: (event: EventRecord) => void
  renderPayload: (event: EventRecord) => string
}

export function EventGroupCard({
  title,
  subtitle,
  groupKey,
  collapsed,
  onToggle,
  events,
  getSummaryEntries,
  onJump,
  renderPayload
}: EventGroupCardProps) {
  return (
    <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">按时间顺序</div>
          <button
            type="button"
            onClick={() => onToggle(groupKey)}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background)_/_0.5)] px-3 py-1 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          >
            {collapsed ? '展开' : '折叠'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="relative pl-4 space-y-4 before:absolute before:inset-y-2 before:left-[11px] before:w-px before:bg-[hsl(var(--border))]">
          {events.map((event, index) => (
            <div key={event.id} className="relative pl-6 rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
              <span className={`absolute left-[-5px] top-4 h-2 w-2 rounded-full ring-4 ring-[hsl(var(--background))] ${severityDotColor(event.severity)}`} />
              <div className="text-xs text-[hsl(var(--muted-foreground))]">#{index + 1} · {new Date(event.createdAt).toLocaleString('zh-CN')}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border ${severityColor(event.severity)}`}>{event.severity}</span>
                <span className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] border ${sourceTypeColor(event.sourceType)}`}>
                  <SourceTypeIcon type={event.sourceType} />
                  <span className="font-mono font-medium">{event.sourceType}</span>
                </span>
                <span className="text-[11px] font-mono text-[hsl(var(--muted-foreground))]">{event.eventType}</span>
              </div>
              <div className="mt-2 text-sm font-medium text-[hsl(var(--foreground))]">{event.title}</div>
              {event.summary && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{event.summary}</div>}
              {getSummaryEntries(event).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {getSummaryEntries(event).map(item => (
                    <span key={`${event.id}-${item.label}`} className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.5)] px-2.5 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      <span className="uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{item.label}</span>
                      <span className="font-mono text-[hsl(var(--foreground))]">{item.value}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => onJump(event)} className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${eventRowSeverityStyle(event.severity)}`}>
                  来源 →
                </button>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))]">展开 Payload</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] p-3 text-xs font-mono">{renderPayload(event)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
