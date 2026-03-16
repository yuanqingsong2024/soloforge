import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'

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
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchChangeRequests(port)
    })
  }, [])

  const fetchChangeRequests = async (port: number, status?: string, type?: string) => {
    try {
      setLoading(true)
      const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
      const params = new URLSearchParams()
      if (status && status !== 'all') params.append('status', status)
      if (type && type !== 'all') params.append('type', type)
      
      const response = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}/change-requests?${params}`)
      const data = await response.json()
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
    if (apiPort) {
      fetchChangeRequests(apiPort, status, type)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      PENDING_APPROVAL: { label: '待审批', className: 'bg-yellow-100 text-yellow-800' },
      APPROVED: { label: '已批准', className: 'bg-green-100 text-green-800' },
      APPLYING: { label: '执行中', className: 'bg-blue-100 text-blue-800' },
      APPLIED: { label: '已应用', className: 'bg-green-100 text-green-800' },
      FAILED: { label: '失败', className: 'bg-red-100 text-red-800' },
      ROLLED_BACK: { label: '已回滚', className: 'bg-gray-100 text-gray-800' }
    }
    const config = statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-workshop-sm text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; className: string }> = {
      CONFIG: { label: '配置', className: 'bg-blue-100 text-blue-800' },
      POLICY: { label: '策略', className: 'bg-purple-100 text-purple-800' },
      TOOLS: { label: '工具', className: 'bg-orange-100 text-orange-800' },
      COMMS: { label: '通信', className: 'bg-teal-100 text-teal-800' },
      MIXED: { label: '混合', className: 'bg-gray-100 text-gray-800' }
    }
    const config = typeMap[type] || { label: type, className: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-workshop-sm text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
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
            className="px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
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
            className="px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
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
      <div className="bg-[hsl(var(--card))] rounded-workshop-md shadow-workshop-sm border border-[hsl(var(--border))]">
        {changeRequests.length === 0 ? (
          <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
            暂无变更单
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {changeRequests.map((cr) => (
              <div key={cr.id} className="p-4 hover:bg-[hsl(var(--accent))] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-[hsl(var(--foreground))]">
                        {cr.title}
                      </h3>
                      {getTypeBadge(cr.type)}
                      {getStatusBadge(cr.status)}
                    </div>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
                      {cr.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                      <span>创建者: {cr.createdBy}</span>
                      <span>创建时间: {new Date(cr.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // TODO: 导航到详情页
                      console.log('查看详情:', cr.id)
                    }}
                    className="ml-4 px-3 py-1 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-sm hover:opacity-90 transition-opacity"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
