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

export function TeamManagement() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [agentTools, setAgentTools] = useState<AgentTool[]>([])

  useEffect(() => {
    getApiPort().then(async (port) => {
      setApiPort(port)
      await fetchAll(port)
    })
  }, [])

  const fetchAll = async (port: number) => {
    const [rolesRes, agentsRes, toolsRes, matrixRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/roles`),
      fetch(`http://127.0.0.1:${port}/api/agents`),
      fetch(`http://127.0.0.1:${port}/api/tools`),
      fetch(`http://127.0.0.1:${port}/api/agent-tools`)
    ])

    setRoles(await rolesRes.json())
    setAgents(await agentsRes.json())
    setTools(await toolsRes.json())
    setAgentTools(await matrixRes.json())
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

  return (
    <div>
      <PageHeader title="团队管理" description="岗位、员工、工具与授权矩阵" />

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
