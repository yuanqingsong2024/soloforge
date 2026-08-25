import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { Button } from '../components/ui'
import { translateEnum } from '../lib/i18n-helpers'
import { ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface Role {
  id: string
  name: string
  description: string
  riskLevel: string
}

interface Agent {
  id: string
  name: string
  workspaceId: string
  roleId: string
  model: string
  runtime: string
  enabled: boolean
  role?: Role
}

interface Tool {
  id: string
  name: string
  scope: string
  riskClass: string
}

interface AgentTool {
  id: string
  agentId: string
  toolId: string
}

interface ConnectionProfile {
  id: string
  name: string
  baseUrl: string
  authMode: string
}

interface HireResponse {
  success: boolean
  data?: {
    profileId: string
    profileName: string
    template: string
    hired: Array<{
      roleId: string
      roleName: string
      agentId: string
      agentName: string
      grantedToolCount: number
    }>
  }
  error?: string
}

export function TeamManagement() {
  const { t } = useTranslation(['team', 'common'])
  const [roles, setRoles] = useState<Role[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [agentTools, setAgentTools] = useState<AgentTool[]>([])
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [hireProfileId, setHireProfileId] = useState('')
  const [hireTemplate, setHireTemplate] = useState<'core-team' | 'support-pod'>('core-team')
  const [hireLoading, setHireLoading] = useState(false)
  const [hireMessage, setHireMessage] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'pending_approval' | 'success' | 'error'>('idle')
  const [approvalId, setApprovalId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      await fetchAll()
    })()
  }, [])

  const fetchAll = async () => {
    const wid = readWorkspaceId()
    const [fetchedRoles, fetchedAgents, fetchedTools, fetchedMatrix, fetchedProfiles] = await Promise.all([
      apiFetch<Role[]>('/api/roles'),
      apiFetch<Agent[]>(`/api/agents?workspaceId=${encodeURIComponent(wid)}`),
      apiFetch<Tool[]>('/api/tools'),
      apiFetch<AgentTool[]>(`/api/agent-tools?workspaceId=${encodeURIComponent(wid)}`),
      apiFetch<ConnectionProfile[]>('/api/profiles')
    ])

    setRoles(fetchedRoles)
    setAgents(fetchedAgents)
    setTools(fetchedTools)
    setAgentTools(fetchedMatrix)
    setProfiles(fetchedProfiles)
    setHireProfileId(current => current || fetchedProfiles[0]?.id || '')
  }

  const toggleAgent = async (agent: Agent) => {
    await apiFetch(`/api/agents/${agent.id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !agent.enabled })
    })
    await fetchAll()
  }

  const toggleAuth = async (agentId: string, toolId: string) => {
    const existed = agentTools.find(item => item.agentId === agentId && item.toolId === toolId)
    if (existed) {
      await apiFetch(`/api/agent-tools/${existed.id}`, { method: 'DELETE' })
    } else {
      await apiFetch('/api/agent-tools', {
        method: 'POST',
        body: JSON.stringify({ agentId, toolId, permissionJson: JSON.stringify({ level: 'full' }) })
      })
    }
    await fetchAll()
  }

  const handleHire = async () => {
    if (!hireProfileId) return
    setHireLoading(true)
    setHireMessage(null)
    try {
      const result = await apiFetch<HireResponse>('/api/team/hire', {
        method: 'POST',
        body: JSON.stringify({ profileId: hireProfileId, template: hireTemplate, workspaceId: readWorkspaceId() })
      })
      if (!result.success || !result.data) {
        throw new Error(result.error || '一键招聘失败')
      }
      setHireMessage(`已基于 ${result.data.profileName} 完成 ${result.data.hired.length} 名员工招聘：${result.data.hired.map(item => item.agentName).join('、')}`)
      await fetchAll()
    } catch (error) {
      setHireMessage(error instanceof Error ? error.message : '一键招聘失败')
    } finally {
      setHireLoading(false)
    }
  }

  const handleSyncToOpenClaw = async () => {
    setSyncStatus('syncing')
    setApprovalId(null)
    setErrorMessage(null)

    try {
      const result = await apiFetch<{
        status?: string
        approvalId?: string
        success?: boolean
        error?: string
      }>('/api/agents/sync-to-openclaw', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: readWorkspaceId() })
      })

      if (result.status === 'pending_approval') {
        setSyncStatus('pending_approval')
        setApprovalId(result.approvalId || null)
        return
      }

      if (!result.success) {
        throw new Error(result.error || '同步到 Claude Code 失败')
      }

      setSyncStatus('success')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch (error) {
      setSyncStatus('error')
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div>
      <PageHeader title="团队管理" description="岗位、员工、工具与授权矩阵" />

      <SectionCard title="一键招聘员工" description="基于既有 Connection Profile 生成默认岗位、员工与低/中风险工具授权。" className="mb-6">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                连接配置
              </label>
              <ThemeSelect value={hireProfileId} onChange={e => setHireProfileId(e.target.value)} fieldTone="primary" className="transition-colors">
                {profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name} · {translateEnum(t, 'commonStatusMap', profile.authMode.toUpperCase()) !== profile.authMode.toUpperCase() ? translateEnum(t, 'commonStatusMap', profile.authMode.toUpperCase()) : profile.authMode}</option>
                ))}
              </ThemeSelect>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                招聘模板
              </label>
              <ThemeSelect value={hireTemplate} onChange={e => setHireTemplate(e.target.value as 'core-team' | 'support-pod')} fieldTone="primary" className="transition-colors">
                <option value="core-team">核心团队（Support/PM/Dev/QA/Ops）</option>
                <option value="support-pod">支持小队（Support/QA）</option>
              </ThemeSelect>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2 border-t border-[hsl(var(--border))]">
            <Button onClick={handleHire} loading={hireLoading} disabled={!hireProfileId}>
              一键招聘
            </Button>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              默认不会自动授予 CRITICAL 工具，避免越权。
            </p>
          </div>
        </div>

        {hireMessage && (
          <div className="mt-6 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
            {hireMessage}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <SectionCard title={`岗位 (${roles.length})`}>
          <div className="space-y-2">
            {roles.map(role => (
              <div key={role.id} className="p-2 border border-[hsl(var(--border))] rounded-md">
                <p className="font-medium">{role.name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{role.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={`员工 (${agents.length})`}>
          <div className="space-y-2">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between gap-3 p-2 border border-[hsl(var(--border))] rounded-md">
                <div className="min-w-0">
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{agent.role?.name || '未绑定岗位'} / {agent.model}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => toggleAgent(agent)}>
                  {agent.enabled ? '禁用' : '启用'}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button onClick={handleSyncToOpenClaw} loading={syncStatus === 'syncing'}>
              同步到 OpenClaw
            </Button>

            {syncStatus === 'pending_approval' && (
              <div className="flex items-center gap-2">
                <span className="text-[hsl(var(--warning-foreground))]">⏳ 等待审批</span>
                <a
                  href={`/approvals?highlight=${approvalId}`}
                  className="text-[hsl(var(--primary))] underline hover:opacity-80"
                >
                  前往审批中心
                </a>
              </div>
            )}

            {syncStatus === 'success' && (
              <span className="text-[hsl(var(--success))]">✓ 同步成功</span>
            )}

            {syncStatus === 'error' && (
              <span className="text-[hsl(var(--destructive))]">✗ {errorMessage}</span>
            )}
          </div>
        </SectionCard>

        <SectionCard title={`工具 (${tools.length})`}>
          <div className="space-y-2">
            {tools.map(tool => (
              <div key={tool.id} className="p-2 border border-[hsl(var(--border))] rounded-md">
                <p className="font-medium">{tool.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{tool.scope} / {translateEnum(t, 'toolRiskLevelMap', tool.riskClass)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="授权矩阵">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">员工 \ 工具</th>
                {tools.map(tool => (
                  <th key={tool.id} className="p-2 text-center">{tool.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} className="border-t border-[hsl(var(--border))]">
                  <td className="p-2">{agent.name}</td>
                  {tools.map(tool => {
                    const authorized = agentTools.some(item => item.agentId === agent.id && item.toolId === tool.id)
                    return (
                      <td key={tool.id} className="p-2 text-center">
                        <button
                          onClick={() => toggleAuth(agent.id, tool.id)}
                          className={`w-7 h-7 rounded-md border ${authorized ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : ''}`}
                        >
                          {authorized ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
