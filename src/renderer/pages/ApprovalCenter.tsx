import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
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
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchApprovals(port)
    })
  }, [filter])
  const fetchApprovals = async (port: number) => {
    try {
      const url = filter === 'all'
        ? `http://127.0.0.1:${port}/api/approvals`
        : `http://127.0.0.1:${port}/api/approvals?status=${filter}`
      
      const response = await fetch(url)
      const data = await response.json()
      setApprovals(data)
    } catch (error) {
      console.error('Failed to fetch approvals:', error)
    } finally {
      setLoading(false)
    }
  }
  const handleApprove = async (approvalId: string) => {
    if (!apiPort || !confirm('确定批准该审批？')) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/approvals/${approvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          approvedBy: 'admin'
        })
      })
      fetchApprovals(apiPort)
    } catch (error) {
      console.error('Failed to approve:', error)
    }
  }
  const handleReject = async (approvalId: string) => {
    if (!apiPort || !confirm('确定拒绝该审批？')) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/approvals/${approvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          approvedBy: 'admin'
        })
      })
      fetchApprovals(apiPort)
    } catch (error) {
      console.error('Failed to reject:', error)
    }
  }
  // 审批状态徽章样式
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      APPROVED: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
      REJECTED: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
      PENDING: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]'
    }
    return statusMap[status] || statusMap.PENDING
  }
  // 审批状态标签
  const getStatusLabel = (status: string) => {
    const labelMap: Record<string, string> = {
      APPROVED: '已批准',
      REJECTED: '已拒绝',
      PENDING: '待审批'
    }
    return labelMap[status] || status
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
        title="审批中心"
        description="管理高危动作审批请求"
      />
      {/* 筛选标签 */}
      <div className="border-b border-[hsl(var(--border))] mb-6">
        <nav className="-mb-px flex space-x-8">
          {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map(status => {
            const count = status === 'all' ? approvals.length : approvals.filter(a => a.status === status).length
            const label = status === 'all' ? '全部' : getStatusLabel(status)
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  filter === status
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))]'
                }`}
              >
                {label}
                <span className="ml-2 text-xs font-mono">({count})</span>
              </button>
            )
          })}
        </nav>
      </div>
      {/* 审批列表 */}
      <div className="space-y-4">
        {approvals.length === 0 ? (
          <SectionCard>
            <div className="text-center py-8">
              <p className="text-[hsl(var(--muted-foreground))]">暂无审批记录</p>
            </div>
          </SectionCard>
        ) : (
          approvals.map(approval => (
            <SectionCard key={approval.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                      {approval.actionType}
                    </h3>
                    <span className={`px-3 py-1 text-xs rounded-full font-medium ${getStatusBadge(approval.status)}`}>
                      {getStatusLabel(approval.status)}
                    </span>
                  </div>
                  {approval.ticket && (
                    <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                      关联工单: {approval.ticket.title}
                    </p>
                  )}
                  <div className="mt-4 bg-[hsl(var(--muted))] rounded-workshop-md p-4">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-2">请求内容:</p>
                    <pre className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap font-mono">
                      {JSON.stringify(JSON.parse(approval.payload), null, 2)}
                    </pre>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-[hsl(var(--muted-foreground))] gap-2">
                    <span>申请人: {approval.requestedBy}</span>
                    {approval.approvedBy && (
                      <>
                        <span>•</span>
                        <span>审批人: {approval.approvedBy}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(approval.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
                {approval.status === 'PENDING' && (
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => handleApprove(approval.id)}
                      className="px-4 py-2 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]
                               rounded-workshop-md hover:opacity-90 transition-opacity
                               text-sm font-medium"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => handleReject(approval.id)}
                      className="px-4 py-2 bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]
                               rounded-workshop-md hover:opacity-90 transition-opacity
                               text-sm font-medium"
                    >
                      拒绝
                    </button>
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
