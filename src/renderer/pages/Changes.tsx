import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getToneByStatus } from '../lib/status-badge'
import { readWorkspaceId } from '../lib/storage'

interface ChangeRequest {
  id: string
  workspaceId: string
  type: string
  title: string
  description: string
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export function Changes() {
  const navigate = useNavigate()
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    void fetchChangeRequests()
  }, [])

  const fetchChangeRequests = async (status?: string, type?: string) => {
    try {
      setLoading(true)
      const workspaceId = readWorkspaceId()
      const params = new URLSearchParams()
      if (status && status !== 'all') params.append('status', status)
      if (type && type !== 'all') params.append('type', type)
      
      const data = await apiFetch<{ data: ChangeRequest[] }>(`/api/workspaces/${workspaceId}/change-requests?${params}`)
      setChangeRequests(data.data || [])
    } catch (error) {
      console.error('获取变更单失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (status: string, type: string) => {
    setFilterStatus(status)
    setFilterType(type)
    void fetchChangeRequests(status, type)
  }

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      DRAFT: '草稿',
      PENDING_APPROVAL: '待审批',
      APPROVED: '已批准',
      APPLYING: '执行中',
      APPLIED: '已应用',
      FAILED: '失败',
      ROLLED_BACK: '已回滚'
    }
    return statusMap[status] || status
  }

  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      CONFIG: '配置',
      POLICY: '策略',
      TOOLS: '工具',
      COMMS: '通信',
      MIXED: '混合'
    }
    return typeMap[type] || type
  }

  const renderChangeRequestCard = (cr: ChangeRequest) => (
    <div key={cr.id} data-testid={`change-request-card-${cr.id}`} className="p-4 hover:bg-[hsl(var(--accent))] transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-[hsl(var(--foreground))]">
              {cr.title}
            </h3>
            <StatusBadge label={getTypeLabel(cr.type)} tone={getToneByStatus(cr.type, { CONFIG: 'info', TOOLS: 'warning', POLICY: 'success' })} />
            <StatusBadge label={getStatusLabel(cr.status)} tone={getToneByStatus(cr.status, { APPROVED: 'success', APPLIED: 'success', FAILED: 'danger', APPLYING: 'info', PENDING_APPROVAL: 'warning' })} />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
            {cr.description}
          </p>
          <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
            <span>创建者: {cr.createdBy}</span>
            <span>创建时间: {formatDateTime(cr.createdAt)}</span>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate(`/changes/${cr.id}`)}>
          查看详情
        </Button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <LoadingState message="加载变更单中..." />
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">变更单</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          管理配置变更、策略变更和其他高危操作
        </p>
      </div>

      {/* 过滤器 */}
      <div className="mb-6 flex gap-4">
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
            状态
          </label>
          <select
            value={filterStatus}
            onChange={(e) => handleFilterChange(e.target.value, filterType)}
            className="px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          >
            <option value="all">全部</option>
            <option value="DRAFT">草稿</option>
            <option value="PENDING_APPROVAL">待审批</option>
            <option value="APPROVED">已批准</option>
            <option value="APPLYING">执行中</option>
            <option value="APPLIED">已应用</option>
            <option value="FAILED">失败</option>
            <option value="ROLLED_BACK">已回滚</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
            类型
          </label>
          <select
            value={filterType}
            onChange={(e) => handleFilterChange(filterStatus, e.target.value)}
            className="px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          >
            <option value="all">全部</option>
            <option value="CONFIG">配置</option>
            <option value="POLICY">策略</option>
            <option value="TOOLS">工具</option>
            <option value="COMMS">通信</option>
            <option value="MIXED">混合</option>
          </select>
        </div>
      </div>

      {/* 变更单列表 */}
      <div className="bg-[hsl(var(--card))] rounded-md shadow-sm border border-[hsl(var(--border))]">
        {changeRequests.length === 0 ? (
          <EmptyState message="暂无变更单" className="m-4" />
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {changeRequests.map(cr => renderChangeRequestCard(cr))}
          </div>
        )}
      </div>
    </div>
  )
}
