import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface DeploymentTarget {
  id: string
  name: string
  targetType: string
  envType: string
}

interface BootstrapResult {
  registrationId: string
  bootstrapToken: string
  expiresAt: string
  installCommand: string
}

interface ApiOk<T> { success: true; data: T }
interface ApiFail { success: false; error: string }
type ApiResponse<T> = ApiOk<T> | ApiFail

export function HostAgentBootstrapWizardPage() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001')
  const [targetId, setTargetId] = useState('')
  const [expiresInMinutes, setExpiresInMinutes] = useState('15')
  const [targets, setTargets] = useState<DeploymentTarget[]>([])
  const [result, setResult] = useState<BootstrapResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets?workspaceId=${encodeURIComponent(workspaceId)}`)
      setTargets(await response.json() as DeploymentTarget[])
    })
  }, [workspaceId])

  const createToken = async () => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/host-agents/bootstrap-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        targetId: targetId || null,
        expiresInMinutes: Number.parseInt(expiresInMinutes, 10)
      })
    })

    const json = await response.json() as ApiResponse<BootstrapResult>
    if (json.success) {
      setResult(json.data)
    }
  }

  const copyCommand = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Bootstrap Wizard"
        description="为 Remote Host / Remote Docker target 生成一次性 bootstrap token 与安装命令。"
        actions={<button onClick={() => navigate('/host-agents')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))]">返回列表</button>}
      />

      <SectionCard title="Step 1 · 绑定 Workspace / Target" description="选择 Agent 所属作用域；不绑定 target 也可先走本地测试模式。">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Workspace ID" />
          <select value={targetId} onChange={event => setTargetId(event.target.value)} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">不绑定 target（本地测试）</option>
            {targets.map(target => (
              <option key={target.id} value={target.id}>{target.name} · {target.targetType} · {target.envType}</option>
            ))}
          </select>
          <input value={expiresInMinutes} onChange={event => setExpiresInMinutes(event.target.value)} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="有效期（分钟）" />
        </div>
      </SectionCard>

      <SectionCard title="Step 2 · 生成 Bootstrap Token" description="默认 15 分钟有效；注册成功后即失效。">
        <button onClick={() => void createToken()} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
          Create Bootstrap Token
        </button>
      </SectionCard>

      {result && (
        <>
          <SectionCard title="Step 3 · 安装命令" description="把 `<soloForge-host>` 替换成远端宿主机能访问到的 SoloForge 地址；默认 Local API 仍只监听 127.0.0.1。">
            <div className="space-y-3">
              <div className="text-sm text-[hsl(var(--muted-foreground))]">注册 ID：<span className="font-mono">{result.registrationId}</span></div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">过期时间：{new Date(result.expiresAt).toLocaleString('zh-CN')}</div>
              <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{result.installCommand}</pre>
              <button onClick={() => void copyCommand()} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">{copied ? '已复制' : '复制命令'}</button>
            </div>
          </SectionCard>

          <SectionCard title="Step 4 · 注册完成确认" description="Agent 启动成功后会自动注册并开始 heartbeat；随后回到 Host Agents 页面刷新即可看到 ONLINE。">
            <button onClick={() => navigate('/host-agents')} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              返回 Host Agents 检查心跳
            </button>
          </SectionCard>
        </>
      )}
    </div>
  )
}
