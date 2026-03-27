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

interface BootstrapResponse {
  success: boolean
  data?: {
    target: {
      id: string
      name: string
      host: string | null
      gatewayUrl: string | null
      envType: string
      targetType: string
    }
    profile: {
      id: string
      name: string
      baseUrl: string
      wsUrl: string
      authMode: string
    }
    bootstrap: {
      registrationId: string
      expiresAt: string
      installCommand: string
    }
    hired: Array<{ agentName: string }>
  }
  error?: string
}

interface BootstrapResultData {
  target: {
    id: string
    name: string
    host: string | null
    gatewayUrl: string | null
    envType: string
    targetType: string
  }
  profile: {
    id: string
    name: string
    baseUrl: string
    wsUrl: string
    authMode: string
  }
  bootstrap: {
    registrationId: string
    expiresAt: string
    installCommand: string
  }
  hired: Array<{ agentName: string }>
}

interface BootstrapInstallJobResponse {
  success: boolean
  data?: {
    jobId: string
    status: string
    targetId: string
    targetName: string
    profileId: string
    profileName: string
    dispatchedActionId?: string | null
    dispatchMessage?: string
  }
  error?: string
}

const STATUS_COLORS = {
  UNKNOWN: 'border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  HEALTHY: 'border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]',
  DEGRADED: 'border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]',
  UNREACHABLE: 'border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
}

const ENV_COLORS = {
  DEV: 'border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]',
  STAGING: 'border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]',
  PROD: 'border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
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
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapHost, setBootstrapHost] = useState('')
  const [bootstrapSshUser, setBootstrapSshUser] = useState('root')
  const [bootstrapSshPort, setBootstrapSshPort] = useState('22')
  const [bootstrapGatewayPort, setBootstrapGatewayPort] = useState('18789')
  const [bootstrapType, setBootstrapType] = useState<'REMOTE_HOST' | 'REMOTE_DOCKER'>('REMOTE_DOCKER')
  const [bootstrapEnvType, setBootstrapEnvType] = useState<'DEV' | 'STAGING' | 'PROD'>('DEV')
  const [autoHireTemplate, setAutoHireTemplate] = useState<'none' | 'core-team' | 'support-pod'>('core-team')
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null)
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResultData | null>(null)
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false)
  const [installJobMessage, setInstallJobMessage] = useState<string | null>(null)
  const [installJobLoading, setInstallJobLoading] = useState(false)
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

  const handleBootstrap = async () => {
    if (!apiPort) return
    setBootstrapLoading(true)
    setBootstrapMessage(null)
    setBootstrapResult(null)

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
          name: bootstrapName,
          targetType: bootstrapType,
          host: bootstrapHost,
          sshUser: bootstrapSshUser,
          sshPort: Number.parseInt(bootstrapSshPort, 10),
          gatewayPort: Number.parseInt(bootstrapGatewayPort, 10),
          envType: bootstrapEnvType,
          autoHireTemplate: autoHireTemplate === 'none' ? null : autoHireTemplate
        })
      })
      const result = await response.json() as BootstrapResponse
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '一键部署失败')
      }

      setBootstrapResult(result.data)
      setBootstrapMessage('OpenClaw 引导部署信息已生成，可以继续复制安装命令并前往相关页面检查。')

      await fetchTargets(apiPort)
    } catch (err) {
      setBootstrapResult(null)
      setBootstrapMessage(err instanceof Error ? err.message : '一键部署失败')
    } finally {
      setBootstrapLoading(false)
    }
  }

  const copyInstallCommand = async () => {
    if (!bootstrapResult) return
    await navigator.clipboard.writeText(bootstrapResult.bootstrap.installCommand)
    setCopiedInstallCommand(true)
    setTimeout(() => setCopiedInstallCommand(false), 1500)
  }

  const triggerInstallJob = async () => {
    if (!apiPort || !bootstrapResult) return
    setInstallJobLoading(true)
    setInstallJobMessage(null)
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/bootstrap/install-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: bootstrapResult.target.id,
          profileId: bootstrapResult.profile.id,
          registrationId: bootstrapResult.bootstrap.registrationId
        })
      })
      const result = await response.json() as BootstrapInstallJobResponse
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '发起安装作业失败')
      }
      setInstallJobMessage([
        `已创建安装作业：${result.data.jobId}（${result.data.status}）`,
        result.data.dispatchMessage || '安装作业已提交',
        result.data.dispatchedActionId ? `对应 Agent Action：${result.data.dispatchedActionId}` : '当前尚未分派到 Agent Action'
      ].join('；'))
    } catch (error) {
      setInstallJobMessage(error instanceof Error ? error.message : '发起安装作业失败')
    } finally {
      setInstallJobLoading(false)
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
          <p className="text-[hsl(var(--destructive))]">{error}</p>
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

      <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">OpenClaw 一键部署</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">生成部署目标、Host Agent Bootstrap 命令、连接配置，并可选一键招聘默认员工。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <input value={bootstrapName} onChange={e => setBootstrapName(e.target.value)} placeholder="部署名称，例如：上海 OpenClaw" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm" />
          <input value={bootstrapHost} onChange={e => setBootstrapHost(e.target.value)} placeholder="主机地址，例如：192.168.1.100" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm" />
          <input value={bootstrapSshUser} onChange={e => setBootstrapSshUser(e.target.value)} placeholder="SSH 用户" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm" />
          <select value={bootstrapType} onChange={e => setBootstrapType(e.target.value as 'REMOTE_HOST' | 'REMOTE_DOCKER')} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm">
            <option value="REMOTE_DOCKER">远程 Docker</option>
            <option value="REMOTE_HOST">远程原生</option>
          </select>
          <input value={bootstrapSshPort} onChange={e => setBootstrapSshPort(e.target.value)} placeholder="SSH 端口" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm" />
          <input value={bootstrapGatewayPort} onChange={e => setBootstrapGatewayPort(e.target.value)} placeholder="Gateway 端口" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm" />
          <select value={bootstrapEnvType} onChange={e => setBootstrapEnvType(e.target.value as 'DEV' | 'STAGING' | 'PROD')} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm">
            <option value="DEV">DEV</option>
            <option value="STAGING">STAGING</option>
            <option value="PROD">PROD</option>
          </select>
          <select value={autoHireTemplate} onChange={e => setAutoHireTemplate(e.target.value as 'none' | 'core-team' | 'support-pod')} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm">
            <option value="core-team">自动招聘：核心团队</option>
            <option value="support-pod">自动招聘：支持小队</option>
            <option value="none">不自动招聘</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => void handleBootstrap()} disabled={bootstrapLoading || !bootstrapName || !bootstrapHost || !bootstrapSshUser} className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50">
            {bootstrapLoading ? '创建中...' : '一键部署 OpenClaw'}
          </button>
          <button onClick={() => navigate('/host-agents/new')} className="px-4 py-2 bg-[hsl(var(--muted))] rounded-workshop-md hover:opacity-90">仅生成 Bootstrap Token</button>
        </div>

        {bootstrapMessage && (
          <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm whitespace-pre-wrap">
            {bootstrapMessage}
          </div>
        )}

        {bootstrapResult && (
          <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">部署目标</div>
                <div className="font-medium">{bootstrapResult.target.name}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1">{bootstrapResult.target.targetType} · {bootstrapResult.target.envType}</div>
              </div>
              <div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">连接配置</div>
                <div className="font-medium">{bootstrapResult.profile.name}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1 break-all">{bootstrapResult.profile.baseUrl}</div>
              </div>
              <div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Bootstrap</div>
                <div className="font-medium break-all">{bootstrapResult.bootstrap.registrationId}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1">{new Date(bootstrapResult.bootstrap.expiresAt).toLocaleString('zh-CN')} 过期</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">安装命令</div>
              <pre className="text-xs font-mono whitespace-pre-wrap rounded-workshop-md bg-[hsl(var(--muted))] p-4 overflow-auto">{bootstrapResult.bootstrap.installCommand}</pre>
            </div>

            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">自动招聘结果</div>
              {bootstrapResult.hired.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bootstrapResult.hired.map(item => (
                    <span key={item.agentName} className="px-3 py-1 rounded-full text-xs bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                      {item.agentName}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">本次未执行自动招聘</div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => void copyInstallCommand()} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                {copiedInstallCommand ? '已复制安装命令' : '复制安装命令'}
              </button>
              <button onClick={() => void triggerInstallJob()} disabled={installJobLoading} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50">
                {installJobLoading ? '提交中...' : '发起安装作业'}
              </button>
              <button onClick={() => navigate(`/deployments/${bootstrapResult.target.id}`)} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                查看部署详情
              </button>
              <button onClick={() => navigate('/host-agents')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                前往 Host Agents
              </button>
              <button onClick={() => navigate('/team')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                前往团队管理
              </button>
            </div>

            {installJobMessage && (
              <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-sm">
                {installJobMessage}
              </div>
            )}
          </div>
        )}
      </div>

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
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ENV_COLORS[target.envType as keyof typeof ENV_COLORS]}`}>
                        {target.envType}
                      </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[target.status as keyof typeof STATUS_COLORS]}`}>
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
                       className="text-[hsl(var(--destructive))] transition-colors duration-200 hover:text-[hsl(var(--destructive)_/_0.8)]"
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
