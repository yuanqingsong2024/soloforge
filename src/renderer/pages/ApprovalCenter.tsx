import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getToneByStatus } from '../lib/status-badge'
import { useEnumTranslation } from '../lib/i18n-helpers'

interface Approval {
  id: string
  ticketId?: string
  actionType: string
  payload: string
  status: string
  requestedBy: string
  approvedBy?: string
  decidedAt?: string
  createdAt: string
  ticket?: { title: string }
}

export function ApprovalCenter() {
  const { t } = useTranslation(['approval', 'common'])
  const translateStatus = useEnumTranslation('approvalStatusMap')
  const translateActionType = useEnumTranslation('approvalTypeMap')
  const location = useLocation()
  const initialFilter = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('status')
    if (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' || status === 'all') {
      return status
    }
    return 'PENDING'
  }, [location.search])
  
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>(initialFilter)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setFilter(initialFilter)
  }, [initialFilter])

  useEffect(() => {
    void fetchApprovals()
  }, [filter])

  const fetchApprovals = async () => {
    try {
      const url = filter === 'all'
        ? '/api/approvals'
        : `/api/approvals?status=${filter}`
      
      const data = await apiFetch<Approval[]>(url)
      setApprovals(data)
    } catch (error) {
      console.error('Failed to fetch approvals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (approvalId: string) => {
    if (!confirm(t('approval:actions.confirmApprove'))) return

    try {
      await apiFetch(`/api/approvals/${approvalId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'APPROVED',
          approvedBy: 'admin'
        })
      })
      void fetchApprovals()
    } catch (error) {
      console.error('Failed to approve:', error)
    }
  }

  const handleReject = async (approvalId: string) => {
    if (!confirm(t('approval:actions.confirmReject'))) return

    try {
      await apiFetch(`/api/approvals/${approvalId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'REJECTED',
          approvedBy: 'admin'
        })
      })
      void fetchApprovals()
    } catch (error) {
      console.error('Failed to reject:', error)
    }
  }

  if (loading) {
    return (
      <LoadingState message={t('approval:loading')} />
    )
  }

  return (
    <div>
      <PageHeader
        title={t('approval:pageTitle')}
        description={t('approval:pageDescription')}
      />

      <div className="mb-6 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-2 shadow-sm">
        <nav className="flex flex-wrap gap-2">
          {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map(status => {
            const count = status === 'all' ? approvals.length : approvals.filter(a => a.status === status).length
            const label = status === 'all' ? t('approval:filters.all') : translateStatus(status)
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {label}
                <span className="ml-2 text-xs font-mono">({count})</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="space-y-4">
        {approvals.length === 0 ? (
          <SectionCard testId="approval-empty-state">
            <EmptyState message={t('approval:noRecords')} />
          </SectionCard>
        ) : (
          approvals.map(approval => (
            <SectionCard key={approval.id} testId={`approval-card-${approval.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                      {translateActionType(approval.actionType)}
                    </h3>
                    <StatusBadge label={translateStatus(approval.status)} tone={getToneByStatus(approval.status, { APPROVED: 'success', REJECTED: 'danger' }, 'warning')} className="px-3 py-1" />
                  </div>
                  {approval.ticket && (
                    <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                      {t('approval:detail.relatedTicket')}: {approval.ticket.title}
                    </p>
                  )}
                  <div className="mt-4 rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-4">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-2">{t('approval:requestContent')}:</p>
                    <pre data-testid={`approval-payload-${approval.id}`} className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap font-mono">
                      {JSON.stringify(JSON.parse(approval.payload), null, 2)}
                    </pre>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-[hsl(var(--muted-foreground))] gap-2">
                    <span>{t('approval:detail.requestedBy')}: {approval.requestedBy}</span>
                    {approval.approvedBy && (
                      <>
                        <span>•</span>
                        <span>{t('approval:detail.approvedBy')}: {approval.approvedBy}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{formatDateTime(approval.createdAt)}</span>
                  </div>
                </div>
                {approval.status === 'PENDING' && (
                  <div className="ml-4 flex gap-2">
                    <Button
                      data-testid={`approval-approve-${approval.id}`}
                      onClick={() => handleApprove(approval.id)}
                      variant="outline"
                      size="sm"
                    >
                      {t('common:buttons.approve')}
                    </Button>
                    <Button
                      data-testid={`approval-reject-${approval.id}`}
                      onClick={() => handleReject(approval.id)}
                      variant="destructive"
                      size="sm"
                    >
                      {t('common:buttons.reject')}
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>
          ))
        )}
      </div>
    </div>
  )
}
