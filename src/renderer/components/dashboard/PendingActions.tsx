// ============================================
// Dashboard Pending Actions Component
// 仪表盘待处理操作
// ============================================

import { Link } from 'react-router-dom'

interface PendingAction {
  id: string
  actionType: string
  workspaceId: string
  workspaceName: string
  title: string
  summary: string
  status: string
  createdAt: string
  route: string
}

interface PendingActionsProps {
  actions: PendingAction[]
  getActionLabel: (value: string) => string
  formatTime: (time: string) => string
}

function getActionTypeIcon(type: string): string {
  switch (type) {
    case 'PENDING_APPROVAL': return '📋'
    case 'PENDING_CHANGE_REQUEST': return '📝'
    case 'PENDING_UPGRADE_PLAN': return '🚀'
    case 'PENDING_RECONCILE_PLAN': return '🔧'
    case 'MANUAL_REMEDIATION': return '🛠️'
    default: return '📌'
  }
}

export function PendingActions({ actions, getActionLabel, formatTime }: PendingActionsProps) {
  if (actions.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card))] p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">⏳</span>
        <h3 className="font-semibold text-[hsl(var(--foreground))]">待处理</h3>
        <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
          {actions.length}
        </span>
      </div>

      <div className="space-y-3">
        {actions.slice(0, 5).map(action => (
          <Link
            key={action.id}
            to={action.route}
            className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border)_/_0.6)] bg-[hsl(var(--background))] p-3 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]"
          >
            <span className="text-xl">{getActionTypeIcon(action.actionType)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                  {action.title}
                </span>
                <span className="rounded-full px-2 py-0.5 text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                  {getActionLabel(action.actionType)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span>{action.workspaceName}</span>
                <span>·</span>
                <span>{formatTime(action.createdAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {actions.length > 5 && (
        <Link
          to="/approvals"
          className="mt-4 flex items-center justify-center gap-1 text-sm text-[hsl(var(--primary))] hover:underline"
        >
          查看全部 {actions.length} 项
        </Link>
      )}
    </div>
  )
}
