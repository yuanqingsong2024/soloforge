import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'

interface DeploymentTarget {
  id: string
  name: string
  targetType: string
  connectionMode: string
  host?: string
  port?: number
  envType: string
  status: string
  lastCheckAt?: string
  createdAt: string
}

const STATUS_COLORS = {
  UNKNOWN: 'bg-gray-500',
  HEALTHY: 'bg-green-500',
  DEGRADED: 'bg-yellow-500',
  UNREACHABLE: 'bg-red-500'
}

const ENV_COLORS = {
  DEV: 'bg-blue-500',
  STAGING: 'bg-yellow-500',
  PROD: 'bg-red-500'
}

const TYPE_LABELS = {
  LOCAL_HOST: '本地原生',
  LOCAL_DOCKER: '本地 Docker',
  REMOTE_HOST: '远程原生',
  REMOTE_DOCKER: '远程 Docker'
}

export function Deployments() {
  const [targets, setTargets] = useState<DeploymentTarget[]>([])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchTargets(port)
    })
  }, [])

  const fetchTargets = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets`)
      if (!response.ok) {
        throw new Error('获取部署目标失败')
      }
      const data = await response.json()
      setTargets(data)
    } catch (err) {
      console.error('Failed to fetch deployment targets:', err)
      setError(err instanceof Error ? err.message : '获取部署目标失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!apiPort) return
    if (!confirm(`确定要删除部署目标"${name}"吗？此操作不可撤销。`)) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.status === 'pending_approval') {
          alert('删除请求已提交审批，请在审批中心查看')
          return
        }
        throw new Error(error.message || '删除失败')
      }

      setTargets(prev => prev.filter(t => t.id !== id))
      alert('删除成功')
    } catch (err) {
      console.error('Failed to delete target:', err)
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleHealthCheck = async (id: string) => {
    if (!apiPort) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/health`)
      const result = await response.json()
      
      if (result.healthy) {
        alert(`健康检查通过\n\n${result.message || '服务运行正常'}`)
      } else {
        alert(`健康检查失败\n\n${result.message || '服务不可达'}`)
      }

      // 刷新列表
      fetchTargets(apiPort)
    } catch (err) {
      console.error('Health check failed:', err)
      alert('健康检查失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="部署管理"
          description="管理 OpenClaw 部署目标"
        />
        <div className="flex items-center justify-center h-64">
          <p className="text-[hsl(var(--muted-foreground))]">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="部署管理"
          description="管理 OpenClaw 部署目标"
        />
        <div className="flex items-center justify-center h-64">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="部署管理"
        description="管理 OpenClaw 部署目标"
        actions={
          <button
            onClick={() => navigate('/deployments/new')}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
          >
            新建部署
          </button>
        }
      />

      {targets.length === 0 ? (
        <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-[hsl(var(--muted-foreground))]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14M12 5l7 7-7 7"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-[hsl(var(--foreground))]">
            暂无部署目标
          </h3>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            点击"新建部署"按钮创建第一个部署目标
          </p>
          <button
            onClick={() => navigate('/deployments/new')}
            className="mt-6 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
          >
            新建部署
          </button>
        </div>
      ) : (
        <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  地址
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  环境
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  最后检查
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {targets.map(target => (
                <tr
                  key={target.id}
                  className="hover:bg-[hsl(var(--muted)/0.5)] transition-colors cursor-pointer"
                  onClick={() => navigate(`/deployments/${target.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {target.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {TYPE_LABELS[target.targetType as keyof typeof TYPE_LABELS] || target.targetType}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {target.host ? `${target.host}:${target.port || 18789}` : '本地'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${ENV_COLORS[target.envType as keyof typeof ENV_COLORS]}`}>
                      {target.envType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[target.status as keyof typeof STATUS_COLORS]}`}>
                      {target.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[hsl(var(--muted-foreground))]">
                    {target.lastCheckAt ? new Date(target.lastCheckAt).toLocaleString('zh-CN') : '从未'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleHealthCheck(target.id)
                      }}
                      className="text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] mr-4"
                    >
                      检查
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(target.id, target.name)
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
