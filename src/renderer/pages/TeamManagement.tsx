import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface Role {
  id: string
  name: string
  description: string
  riskLevel: string
}

interface Agent {
  id: string
  name: string
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
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [agentTools, setAgentTools] = useState<AgentTool[]>([])
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [hireProfileId, setHireProfileId] = useState('')
  const [hireTemplate, setHireTemplate] = useState<'core-team' | 'support-pod'>('core-team')
  const [hireLoading, setHireLoading] = useState(false)
  const [hireMessage, setHireMessage] = useState<string | null>(null)

  useEffect(() => {
    getApiPort().then(async (port) => {
      setApiPort(port)
      await fetchAll(port)
    })
  }, [])

  const fetchAll = async (port: number) => {
    const [rolesRes, agentsRes, toolsRes, matrixRes, profilesRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/roles`),
      fetch(`http://127.0.0.1:${port}/api/agents`),
      fetch(`http://127.0.0.1:${port}/api/tools`),
      fetch(`http://127.0.0.1:${port}/api/agent-tools`),
      fetch(`http://127.0.0.1:${port}/api/profiles`)
    ])

    setRoles(await rolesRes.json())
    setAgents(await agentsRes.json())
    setTools(await toolsRes.json())
    setAgentTools(await matrixRes.json())
    const fetchedProfiles = await profilesRes.json() as ConnectionProfile[]
    setProfiles(fetchedProfiles)
    setHireProfileId(current => current || fetchedProfiles[0]?.id || '')
  }

  const toggleAgent = async (agent: Agent) => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !agent.enabled })
    })
    await fetchAll(apiPort)
  }

  const toggleAuth = async (agentId: string, toolId: string) => {
    if (!apiPort) return
    const existed = agentTools.find(item => item.agentId === agentId && item.toolId === toolId)
    if (existed) {
      await fetch(`http://127.0.0.1:${apiPort}/api/agent-tools/${existed.id}`, { method: 'DELETE' })
    } else {
      await fetch(`http://127.0.0.1:${apiPort}/api/agent-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, toolId, permissionJson: JSON.stringify({ level: 'full' }) })
      })
    }
    await fetchAll(apiPort)
  }

  const handleHire = async () => {
    if (!apiPort || !hireProfileId) return
    setHireLoading(true)
    setHireMessage(null)
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/team/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: hireProfileId, template: hireTemplate })
      })
      const result = await response.json() as HireResponse
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '一键招聘失败')
      }
      setHireMessage(`已基于 ${result.data.profileName} 完成 ${result.data.hired.length} 名员工招聘：${result.data.hired.map(item => item.agentName).join('、')}`)
      await fetchAll(apiPort)
    } catch (error) {
      setHireMessage(error instanceof Error ? error.message : '一键招聘失败')
    } finally {
      setHireLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="团队管理" description="岗位、员工、工具与授权矩阵" />

      <SectionCard title="一键招聘员工" description="基于既有 Connection Profile 生成默认岗位、员工与低/中风险工具授权。" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-2">连接配置</label>
            <select
              value={hireProfileId}
              onChange={e => setHireProfileId(e.target.value)}
              className="w-full px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            >
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name} · {profile.authMode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">招聘模板</label>
            <select
              value={hireTemplate}
              onChange={e => setHireTemplate(e.target.value as 'core-team' | 'support-pod')}
              className="w-full px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            >
              <option value="core-team">核心团队（Support/PM/Dev/QA/Ops）</option>
              <option value="support-pod">支持小队（Support/QA）</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              onClick={handleHire}
              disabled={!hireProfileId || hireLoading}
              className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            >
              {hireLoading ? '招聘中...' : '一键招聘'}
            </button>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">默认不会自动授予 CRITICAL 工具，避免越权。</p>
          </div>
        </div>

        {hireMessage && (
          <div className="mt-4 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
            {hireMessage}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <SectionCard title={`岗位 (${roles.length})`}>
          <div className="space-y-2">
            {roles.map(role => (
              <div key={role.id} className="p-2 border border-[hsl(var(--border))] rounded-workshop-md">
                <p className="font-medium">{role.name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{role.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={`员工 (${agents.length})`}>
          <div className="space-y-2">
            {agents.map(agent => (
              <div key={agent.id} className="p-2 border border-[hsl(var(--border))] rounded-workshop-md">
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{agent.role?.name || '未绑定岗位'} / {agent.model}</p>
                <button onClick={() => toggleAgent(agent)} className="mt-2 px-2 py-1 text-xs rounded-workshop-md bg-[hsl(var(--muted))]">
                  {agent.enabled ? '禁用' : '启用'}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={`工具 (${tools.length})`}>
          <div className="space-y-2">
            {tools.map(tool => (
              <div key={tool.id} className="p-2 border border-[hsl(var(--border))] rounded-workshop-md">
                <p className="font-medium">{tool.name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{tool.scope} / {tool.riskClass}</p>
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
                          className={`w-7 h-7 rounded-workshop-md border ${authorized ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : ''}`}
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
