import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useTranslation } from 'react-i18next'
import { useEnumTranslation } from '../lib/i18n-helpers'
import { getToneByStatus } from '../lib/status-badge'
import { ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

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

export function Deployments() {
  const { t } = useTranslation(['deployment', 'common'])
  const translateType = useEnumTranslation('deploymentTypeMap')
  
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
      const workspaceId = readWorkspaceId()
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets?workspaceId=${encodeURIComponent(workspaceId)}`)
      if (!response.ok) {
        throw new Error(t('deployment:errors.fetchTargetsFailed'))
      }
      const data = await response.json()
      setTargets(data)
    } catch (err) {
      console.error('Failed to fetch deployment targets:', err)
      setError(err instanceof Error ? err.message : t('deployment:errors.fetchTargetsFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!apiPort) return
    if (!confirm(t('deployment:confirmDelete', { name }))) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.status === 'pending_approval') {
          alert(t('deployment:deleteSubmittedForApproval'))
          return
        }
        throw new Error(error.message || t('deployment:errors.deleteFailed'))
      }

      setTargets(prev => prev.filter(t => t.id !== id))
      alert(t('deployment:deleteSuccess'))
    } catch (err) {
      console.error('Failed to delete target:', err)
      alert(err instanceof Error ? err.message : t('deployment:errors.deleteFailed'))
    }
  }

  const handleHealthCheck = async (id: string) => {
    if (!apiPort) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/health`)
      const result = await response.json()
      
      if (result.healthy) {
        alert(t('deployment:healthCheckPassed', { message: result.message || t('deployment:serviceRunningNormally') }))
      } else {
        alert(t('deployment:healthCheckFailed', { message: result.message || t('deployment:serviceUnreachable') }))
      }

      // 刷新列表
      fetchTargets(apiPort)
    } catch (err) {
      console.error('Health check failed:', err)
      alert(t('deployment:errors.healthCheckFailed'))
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
          workspaceId: readWorkspaceId(),
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
        throw new Error(result.error || t('deployment:errors.bootstrapFailed'))
      }

      setBootstrapResult(result.data)
      setBootstrapMessage(t('deployment:bootstrapSuccess'))

      await fetchTargets(apiPort)
    } catch (err) {
      setBootstrapResult(null)
      setBootstrapMessage(err instanceof Error ? err.message : t('deployment:errors.bootstrapFailed'))
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
        throw new Error(result.error || t('deployment:errors.installJobFailed'))
      }
      setInstallJobMessage([
        t('deployment:installJobCreated', { jobId: result.data.jobId, status: result.data.status }),
        result.data.dispatchMessage || t('deployment:installJobSubmitted'),
        result.data.dispatchedActionId ? t('deployment:installJobActionId', { actionId: result.data.dispatchedActionId }) : t('deployment:installJobNoAction')
      ].join('；'))
    } catch (error) {
      setInstallJobMessage(error instanceof Error ? error.message : t('deployment:errors.installJobFailed'))
    } finally {
      setInstallJobLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('deployment:title')}
          description={t('deployment:description')}
        />
        <LoadingState message={t('common:loading')} className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('deployment:title')}
          description={t('deployment:description')}
        />
        <EmptyState message={error} tone="danger" className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('deployment:title')}
        description={t('deployment:description')}
        actions={
          <button
            onClick={() => navigate('/deployments/new')}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
          >
            {t('deployment:newDeployment')}
          </button>
        }
      />

      <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{t('deployment:bootstrapTitle')}</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('deployment:bootstrapDescription')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ThemeInput value={bootstrapName} onChange={e => setBootstrapName(e.target.value)} placeholder={t('deployment:placeholders.deploymentName')} fieldSize="lg" fieldShape="pill" />
          <ThemeInput value={bootstrapHost} onChange={e => setBootstrapHost(e.target.value)} placeholder={t('deployment:placeholders.hostAddress')} fieldSize="lg" fieldShape="pill" />
          <ThemeInput value={bootstrapSshUser} onChange={e => setBootstrapSshUser(e.target.value)} placeholder={t('deployment:placeholders.sshUser')} fieldSize="lg" fieldShape="pill" />
          <ThemeSelect value={bootstrapType} onChange={e => setBootstrapType(e.target.value as 'REMOTE_HOST' | 'REMOTE_DOCKER')} fieldSize="lg" fieldShape="pill">
                      <option value="REMOTE_DOCKER">{translateType('REMOTE_DOCKER')}</option>
                      <option value="REMOTE_HOST">{translateType('REMOTE_HOST')}</option>
          </ThemeSelect>
          <ThemeInput value={bootstrapSshPort} onChange={e => setBootstrapSshPort(e.target.value)} placeholder={t('deployment:placeholders.sshPort')} fieldSize="lg" fieldShape="pill" />
          <ThemeInput value={bootstrapGatewayPort} onChange={e => setBootstrapGatewayPort(e.target.value)} placeholder={t('deployment:placeholders.gatewayPort')} fieldSize="lg" fieldShape="pill" />
          <ThemeSelect value={bootstrapEnvType} onChange={e => setBootstrapEnvType(e.target.value as 'DEV' | 'STAGING' | 'PROD')} fieldSize="lg" fieldShape="pill">
                      <option value="DEV">{t('deployment:envTypes.DEV')}</option>
                      <option value="STAGING">{t('deployment:envTypes.STAGING')}</option>
                      <option value="PROD">{t('deployment:envTypes.PROD')}</option>
          </ThemeSelect>
          <ThemeSelect value={autoHireTemplate} onChange={e => setAutoHireTemplate(e.target.value as 'none' | 'core-team' | 'support-pod')} fieldSize="lg" fieldShape="pill">
            <option value="core-team">{t('deployment:autoHire.coreTeam')}</option>
            <option value="support-pod">{t('deployment:autoHire.supportPod')}</option>
            <option value="none">{t('deployment:autoHire.none')}</option>
          </ThemeSelect>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => void handleBootstrap()} disabled={bootstrapLoading || !bootstrapName || !bootstrapHost || !bootstrapSshUser} className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50">
            {bootstrapLoading ? t('deployment:bootstrapCreating') : t('deployment:bootstrapButton')}
          </button>
          <button onClick={() => navigate('/host-agents/new')} className="px-4 py-2 bg-[hsl(var(--muted))] rounded-workshop-md hover:opacity-90">{t('deployment:generateBootstrapTokenOnly')}</button>
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
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">{t('deployment:deploymentTarget')}</div>
                <div className="font-medium">{bootstrapResult.target.name}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1">{bootstrapResult.target.targetType} · {bootstrapResult.target.envType}</div>
              </div>
              <div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">{t('deployment:connectionProfile')}</div>
                <div className="font-medium">{bootstrapResult.profile.name}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1 break-all">{bootstrapResult.profile.baseUrl}</div>
              </div>
              <div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Bootstrap</div>
                <div className="font-medium break-all">{bootstrapResult.bootstrap.registrationId}</div>
                <div className="text-[hsl(var(--muted-foreground))] mt-1">{t('deployment:expiresAt', { date: new Date(bootstrapResult.bootstrap.expiresAt).toLocaleString('zh-CN') })}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">{t('deployment:installCommand')}</div>
              <pre className="text-xs font-mono whitespace-pre-wrap rounded-workshop-md bg-[hsl(var(--muted))] p-4 overflow-auto">{bootstrapResult.bootstrap.installCommand}</pre>
            </div>

            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">{t('deployment:autoHireResult')}</div>
              {bootstrapResult.hired.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bootstrapResult.hired.map(item => (
                    <span key={item.agentName} className="px-3 py-1 rounded-full text-xs bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                      {item.agentName}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('deployment:noAutoHire')}</div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => void copyInstallCommand()} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                {copiedInstallCommand ? t('deployment:installCommandCopied') : t('deployment:copyInstallCommand')}
              </button>
              <button onClick={() => void triggerInstallJob()} disabled={installJobLoading} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50">
                {installJobLoading ? t('deployment:submitting') : t('deployment:triggerInstallJob')}
              </button>
              <button onClick={() => navigate(`/deployments/${bootstrapResult.target.id}`)} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                {t('deployment:viewDeploymentDetail')}
              </button>
              <button onClick={() => navigate('/host-agents')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                {t('deployment:goToHostAgents')}
              </button>
              <button onClick={() => navigate('/team')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                {t('deployment:goToTeamManagement')}
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
            {t('deployment:noTargets')}
          </h3>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {t('deployment:noTargetsHint')}
          </p>
          <button
            onClick={() => navigate('/deployments/new')}
            className="mt-6 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
          >
            {t('deployment:newDeployment')}
          </button>
        </div>
      ) : (
        <div className="rounded-workshop-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-workshop-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3 text-sm text-[hsl(var(--muted-foreground))]">
            <span>当前 Workspace 部署目标 {targets.length} 个</span>
            <span className="hidden sm:inline">操作列已固定在右侧，可横向滚动查看完整字段</span>
          </div>
          <div className="overflow-x-auto pb-2">
          <table className="min-w-[1120px] w-full table-fixed">
            <thead className="bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="w-[25%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.name')}
                </th>
                <th className="w-[12%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.type')}
                </th>
                <th className="w-[17%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.address')}
                </th>
                <th className="w-[11%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.environment')}
                </th>
                <th className="w-[14%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.status')}
                </th>
                <th className="w-[14%] px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {t('deployment:table.lastCheck')}
                </th>
                <th className="sticky right-0 z-10 w-[9rem] border-l border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-5 py-3 text-right text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider shadow-[-8px_0_16px_-14px_hsl(var(--foreground))]">
                  {t('common:actions')}
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
                  <td className="px-6 py-4">
                    <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]" title={target.name}>
                      {target.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {translateType(target.targetType)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {target.host ? `${target.host}:${target.port || 18789}` : t('deployment:local')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge label={t('deployment:envTypes.' + (target.envType || 'DEV'))} tone={getToneByStatus(target.envType, { DEV: 'info', STAGING: 'warning', PROD: 'danger' })} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge label={t('deployment:status.' + (target.status || 'UNKNOWN'))} tone={getToneByStatus(target.status, { HEALTHY: 'success', DEGRADED: 'warning', UNREACHABLE: 'danger' })} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[hsl(var(--muted-foreground))]">
                    {target.lastCheckAt ? new Date(target.lastCheckAt).toLocaleString('zh-CN') : t('deployment:never')}
                  </td>
                  <td className="sticky right-0 z-10 whitespace-nowrap border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4 text-right text-sm font-medium shadow-[-8px_0_16px_-14px_hsl(var(--foreground))]">
                    <div className="flex justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleHealthCheck(target.id)
                      }}
                      className="rounded-full border border-[hsl(var(--google-blue)_/_0.2)] px-3 py-1.5 text-xs text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--google-blue)_/_0.08)]"
                    >
                      {t('deployment:check', { defaultValue: '检查' })}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(target.id, target.name)
                      }}
                       className="rounded-full border border-[hsl(var(--google-red)_/_0.2)] px-3 py-1.5 text-xs text-[hsl(var(--destructive))] transition-colors duration-200 hover:bg-[hsl(var(--google-red)_/_0.08)]"
                    >
                      {t('common:delete')}
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
