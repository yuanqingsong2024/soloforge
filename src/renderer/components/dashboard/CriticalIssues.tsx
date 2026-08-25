// ============================================
// Dashboard Critical Issues Component
// 仪表盘关键问题
// ============================================

import { Link } from 'react-router-dom'

interface CriticalIssue {
  id: string
  issueType: string
  severity: 'CRITICAL' | 'HIGH'
  workspaceId: string
  workspaceName: string
  targetId?: string
  targetName?: string
  summary: string
  lastOccurredAt: string
  actions: Array<{
    label: string
    route: string
  }>
}

interface CriticalIssuesProps {
  issues: CriticalIssue[]
  getIssueTypeLabel: (value: string) => string
  formatTime: (time: string) => string
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'border-[hsl(var(--google-red)_/_0.24)] bg-[hsl(var(--google-red)_/_0.16)] text-[hsl(var(--destructive))]'
    case 'HIGH':
      return 'border-[hsl(var(--google-yellow)_/_0.28)] bg-[hsl(var(--google-yellow)_/_0.22)] text-[hsl(var(--foreground))]'
    default:
      return 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
  }
}

export function CriticalIssues({ issues, getIssueTypeLabel, formatTime }: CriticalIssuesProps) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card))] p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎉</span>
          <h3 className="font-semibold text-[hsl(var(--foreground))]">暂无关键问题</h3>
        </div>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          系统运行正常，没有发现需要立即处理的问题。
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card))] p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🚨</span>
        <h3 className="font-semibold text-[hsl(var(--foreground))]">关键问题</h3>
        <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
          {issues.length}
        </span>
      </div>

      <div className="space-y-3">
        {issues.map(issue => (
          <div
            key={issue.id}
            className="rounded-lg border border-[hsl(var(--border)_/_0.6)] bg-[hsl(var(--background))] p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getSeverityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {getIssueTypeLabel(issue.issueType)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-[hsl(var(--foreground))] line-clamp-2">
                  {issue.summary}
                </p>
                <div className="mt-2 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                  <span>{issue.workspaceName}</span>
                  {issue.targetName && <span>→ {issue.targetName}</span>}
                  <span>{formatTime(issue.lastOccurredAt)}</span>
                </div>
              </div>

              {/* 操作按钮 */}
              {issue.actions.length > 0 && (
                <div className="flex flex-col gap-1">
                  {issue.actions.slice(0, 2).map((action, idx) => (
                    <Link
                      key={idx}
                      to={action.route}
                      className="rounded-full px-3 py-1.5 text-xs font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 whitespace-nowrap"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
