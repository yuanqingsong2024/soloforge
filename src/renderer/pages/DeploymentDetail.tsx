import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'

interface DeploymentTarget {
  id: string
  name: string
  targetType: string
  connectionMode: string
  host?: string
  port?: number
  sshUser?: string
  sshPort?: number
  gatewayUrl?: string
  dockerEnabled: boolean
  tailscaleEnabled: boolean
  envType: string
  status: string
  lastCheckAt?: string
  metadata: string
  createdAt: string
  updatedAt: string
}

interface DeploymentJob {
  id: string
  targetId: string
  jobType: string
  status: string
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  metadata: string
  createdAt: string
}

interface HealthCheckResult {
  healthy: boolean
  message?: string
  details?: Record<string, unknown>
}

type TabType = 'overview' | 'service' | 'logs' | 'jobs'

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [target, setTarget] = useState<DeploymentTarget | null>(null)
  const [jobs, setJobs] = useState<DeploymentJob[]>([])
  const [logs, setLogs] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      if (id) {
        fetchTarget(port, id)
        fetchJobs(port, id)
      }
    })
  }, [id])

  useEffect(() => {
    if (autoRefreshLogs && apiPort && id && activeTab === 'logs') {
      const interval = setInterval(() => {
        fetchLogs(apiPort, id)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefreshLogs, apiPort, id, activeTab])

  const fetchTarget = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets/${targetId}`)
      if (!response.ok) {
        throw new Error('获取部署目标失败')
      }
      const data = await response.json()
      setTarget(data)
    } catch (err) {
      console.error('Failed to fetch target:', err)
      setError(err instanceof Error ? err.message : '获取部署目标失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchJobs = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-jobs?targetId=${targetId}`)
      if (!response.ok) {
        throw new Error('获取作业历史失败')
      }
      const data = await response.json()
      setJobs(data)
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }

  const fetchLogs = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets/${targetId}/logs?lines=100`)
      if (!response.ok) {
        throw new Error('获取日志失败')
      }
      const data = await response.json()
      setLogs(data.logs || '暂无日志')
    } catch (err) {
      console.error('Failed to fetch logs:', err)
      setLogs('获取日志失败')
    }
  }

  const handleServiceAction = async (action: 'start' | 'stop' | 'restart' | 'upgrade') => {
    if (!apiPort || !id) return

    setActionLoading(action)
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const result = await response.json()

      if (result.status === 'pending_approval') {
        alert(`${action} 操作已提交审批（审批 ID: ${result.approvalId}）\n\n请在审批中心查看并批准`)
        navigate('/approvals')
        return
      }

      if (!response.ok) {
        throw new Error(result.message || `${action} 操作失败`)
      }

      alert(`${action} 操作成功`)
      if (id) {
        fetchTarget(apiPort, id)
        fetchJobs(apiPort, id)
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err)
      alert(err instanceof Error ? err.message : `${action} 操作失败`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleHealthCheck = async () => {
    if (!apiPort || !id) return

    setActionLoading('health')
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/health`)
      const result: HealthCheckResult = await response.json()

      if (result.healthy) {
        alert(`健康检查通过\n\n${result.message || '服务运行正常'}`)
      } else {
        alert(`健康检查失败\n\n${result.message || '服务不可达'}`)
      }

      if (id) {
        fetchTarget(apiPort, id)
      }
    } catch (err) {
      console.error('Health check failed:', err)
      alert('健康检查失败')
    } finally {
      setActionLoading(null)
    }
  }

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deployment-${id}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="部署详情" description="加载中..." />
        <div className="flex items-center justify-center h-64">
          <p className="text-[hsl(var(--muted-foreground))]">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !target) {
    return (
      <div className="space-y-6">
        <PageHeader title="部署详情" description="加载失败" />
        <div className="flex items-center justify-center h-64">
          <p className="text-red-500">{error || '部署目标不存在'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={target.name}
        description={`部署类型: ${target.targetType} | 环境: ${target.envType}`}
        actions={
          <button
            onClick={() => navigate('/deployments')}
            className="px-4 py-2 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:bg-[hsl(var(--muted)/0.8)] transition-colors"
          >
            返回列表
          </button>
        }
      />

      {/* Tabs */}
      <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] overflow-hidden">
        <div className="border-b border-[hsl(var(--border))]">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {[
              { id: 'overview', label: '概览' },
              { id: 'service', label: '服务管理' },
              { id: 'logs', label: '日志' },
              { id: 'jobs', label: '作业历史' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as TabType)
                  if (tab.id === 'logs' && apiPort && id) {
                    fetchLogs(apiPort, id)
                  }
                }}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))]'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    名称
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    类型
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.targetType}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    连接模式
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.connectionMode}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    环境
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.envType}</p>
                </div>
                {target.host && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        主机
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.host}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        端口
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.port || 18789}</p>
                    </div>
                  </>
                )}
                {target.sshUser && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        SSH 用户
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.sshUser}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        SSH 端口
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.sshPort || 22}</p>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    状态
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.status}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    最后检查
                  </label>
                  <p className="text-[hsl(var(--foreground))]">
                    {target.lastCheckAt ? new Date(target.lastCheckAt).toLocaleString('zh-CN') : '从未'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    Docker 启用
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.dockerEnabled ? '是' : '否'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    Tailscale 启用
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.tailscaleEnabled ? '是' : '否'}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    创建时间
                  </label>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(target.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Service Management Tab */}
          {activeTab === 'service' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleServiceAction('start')}
                  disabled={actionLoading !== null}
                  className="px-4 py-3 bg-green-600 text-white rounded-workshop-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading === 'start' ? '启动中...' : '启动服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('stop')}
                  disabled={actionLoading !== null}
                  className="px-4 py-3 bg-red-600 text-white rounded-workshop-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading === 'stop' ? '停止中...' : '停止服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('restart')}
                  disabled={actionLoading !== null}
                  className="px-4 py-3 bg-yellow-600 text-white rounded-workshop-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading === 'restart' ? '重启中...' : '重启服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('upgrade')}
                  disabled={actionLoading !== null}
                  className="px-4 py-3 bg-blue-600 text-white rounded-workshop-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading === 'upgrade' ? '升级中...' : '升级服务'}
                </button>
                <button
                  onClick={handleHealthCheck}
                  disabled={actionLoading !== null}
                  className="col-span-2 px-4 py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {actionLoading === 'health' ? '检查中...' : '健康检查'}
                </button>
              </div>

              {target.envType === 'PROD' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-workshop-md p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>注意：</strong>此部署目标为生产环境，服务管理操作需要审批。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={autoRefreshLogs}
                      onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">自动刷新（5秒）</span>
                  </label>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => apiPort && id && fetchLogs(apiPort, id)}
                    className="px-3 py-1 text-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:bg-[hsl(var(--muted)/0.8)] transition-colors"
                  >
                    刷新
                  </button>
                  <button
                    onClick={downloadLogs}
                    className="px-3 py-1 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
                  >
                    下载日志
                  </button>
                </div>
              </div>
              <pre className="bg-black text-green-400 p-4 rounded-workshop-md overflow-x-auto text-xs font-mono h-96 overflow-y-auto">
                {logs}
              </pre>
            </div>
          )}

          {/* Jobs History Tab */}
          {activeTab === 'jobs' && (
            <div className="space-y-4">
              {jobs.length === 0 ? (
                <p className="text-center text-[hsl(var(--muted-foreground))] py-8">暂无作业历史</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                          作业类型
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                          状态
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                          开始时间
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                          完成时间
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                          错误信息
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {jobs.map(job => (
                        <tr key={job.id} className="hover:bg-[hsl(var(--muted)/0.5)]">
                          <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))]">
                            {job.jobType}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              job.status === 'SUCCEEDED' ? 'bg-green-100 text-green-800' :
                              job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                              job.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                            {job.startedAt ? new Date(job.startedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                            {job.completedAt ? new Date(job.completedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-red-600">
                            {job.errorMessage || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
