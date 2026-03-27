import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface NotificationPolicy {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  enabled: boolean
  eventFilters: any
  targetFilters: any
  deliveryTargets: any
  quietHours?: any | null
  cooldownSeconds: number
  dedupeWindowSeconds: number
  messageTemplate: string
  createdAt: string
  updatedAt: string
}

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function NotificationPoliciesPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [policies, setPolicies] = useState<NotificationPolicy[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<NotificationPolicy | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: true,
    eventFilters: '{}',
    targetFilters: '{}',
    deliveryTargets: '{}',
    quietHours: '',
    cooldownSeconds: 300,
    dedupeWindowSeconds: 900,
    messageTemplate: ''
  })

  const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchPolicies(port)
      setLoading(false)
    })
  }, [])

  const fetchPolicies = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/notification-policies?workspaceId=${workspaceId}`)
    const json = await response.json() as ApiResponse<NotificationPolicy[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setPolicies(json.data)
  }

  const handleCreate = () => {
    setEditingPolicy(null)
    setFormData({
      name: '',
      description: '',
      enabled: true,
      eventFilters: '{}',
      targetFilters: '{}',
      deliveryTargets: '{}',
      quietHours: '',
      cooldownSeconds: 300,
      dedupeWindowSeconds: 900,
      messageTemplate: ''
    })
    setShowForm(true)
    setTestResult(null)
  }

  const handleEdit = (policy: NotificationPolicy) => {
    setEditingPolicy(policy)
    setFormData({
      name: policy.name,
      description: policy.description || '',
      enabled: policy.enabled,
      eventFilters: JSON.stringify(policy.eventFilters, null, 2),
      targetFilters: JSON.stringify(policy.targetFilters, null, 2),
      deliveryTargets: JSON.stringify(policy.deliveryTargets, null, 2),
      quietHours: policy.quietHours ? JSON.stringify(policy.quietHours, null, 2) : '',
      cooldownSeconds: policy.cooldownSeconds,
      dedupeWindowSeconds: policy.dedupeWindowSeconds,
      messageTemplate: policy.messageTemplate
    })
    setShowForm(true)
    setTestResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiPort) return

    try {
      const payload = {
        workspaceId,
        name: formData.name,
        description: formData.description || null,
        enabled: formData.enabled,
        eventFilters: JSON.parse(formData.eventFilters),
        targetFilters: JSON.parse(formData.targetFilters),
        deliveryTargets: JSON.parse(formData.deliveryTargets),
        quietHours: formData.quietHours ? JSON.parse(formData.quietHours) : null,
        cooldownSeconds: formData.cooldownSeconds,
        dedupeWindowSeconds: formData.dedupeWindowSeconds,
        messageTemplate: formData.messageTemplate
      }

      const url = editingPolicy
        ? `http://127.0.0.1:${apiPort}/api/notification-policies/${editingPolicy.id}`
        : `http://127.0.0.1:${apiPort}/api/notification-policies`

      const method = editingPolicy ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await response.json()
      if (!json.success) {
        alert(`错误: ${json.error}`)
        return
      }

      await fetchPolicies(apiPort)
      setShowForm(false)
      setEditingPolicy(null)
    } catch (err: any) {
      alert(`提交失败: ${err.message}`)
    }
  }

  const handleTest = async (policyId: string) => {
    if (!apiPort) return

    const sampleEvent = {
      workspaceId,
      sourceType: 'DEPLOYMENT',
      sourceId: 'test-deployment-id',
      eventType: 'DEPLOYMENT_FAILED',
      severity: 'CRITICAL',
      title: '测试事件：部署失败',
      summary: '这是一个测试事件，用于验证通知策略',
      payload: { test: true }
    }

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/notification-policies/${policyId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: sampleEvent })
      })

      const json = await response.json()
      if (!json.success) {
        setTestResult(`测试失败: ${json.error}`)
        return
      }

      if (json.data.matched) {
        setTestResult(`✅ 策略匹配成功！\n\n渲染消息:\n${json.data.renderedMessage}`)
      } else {
        setTestResult(`❌ 策略不匹配\n\n原因: ${json.data.reason || '未知'}`)
      }
    } catch (err: any) {
      setTestResult(`测试失败: ${err.message}`)
    }
  }

  const handleToggleEnabled = async (policy: NotificationPolicy) => {
    if (!apiPort) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/notification-policies/${policy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...policy,
          enabled: !policy.enabled
        })
      })

      const json = await response.json()
      if (!json.success) {
        alert(`错误: ${json.error}`)
        return
      }

      await fetchPolicies(apiPort)
    } catch (err: any) {
      alert(`切换失败: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader title="通知策略" description="管理事件驱动的通知规则" />
        <div className="mt-6 text-center text-[hsl(var(--muted-foreground))]">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <PageHeader
        title="通知策略"
        description="管理事件驱动的通知规则，支持过滤、去重、静默时段"
        actions={
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            新建策略
          </button>
        }
      />

      {showForm && (
        <SectionCard title={editingPolicy ? '编辑策略' : '新建策略'} className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">策略名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label className="text-sm font-medium text-slate-700">启用策略</label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                事件过滤器 (JSON)
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">例: {`{"sourceType": "DEPLOYMENT", "severity": "CRITICAL"}`}</span>
              </label>
              <textarea
                value={formData.eventFilters}
                onChange={e => setFormData({ ...formData, eventFilters: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                目标过滤器 (JSON)
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">例: {`{"targetId": "prod-*"}`}</span>
              </label>
              <textarea
                value={formData.targetFilters}
                onChange={e => setFormData({ ...formData, targetFilters: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                投递目标 (JSON)
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">例: {`{"channels": ["email"], "recipients": ["admin@example.com"]}`}</span>
              </label>
              <textarea
                value={formData.deliveryTargets}
                onChange={e => setFormData({ ...formData, deliveryTargets: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                静默时段 (JSON, 可选)
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">例: {`{"start": "22:00", "end": "08:00", "timezone": "Asia/Shanghai"}`}</span>
              </label>
              <textarea
                value={formData.quietHours}
                onChange={e => setFormData({ ...formData, quietHours: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">冷却时间 (秒)</label>
                <input
                  type="number"
                  value={formData.cooldownSeconds}
                  onChange={e => setFormData({ ...formData, cooldownSeconds: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={0}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">去重窗口 (秒)</label>
                <input
                  type="number"
                  value={formData.dedupeWindowSeconds}
                  onChange={e => setFormData({ ...formData, dedupeWindowSeconds: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={0}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                消息模板
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">支持变量: {`{{title}}, {{summary}}, {{severity}}`}</span>
              </label>
              <textarea
                value={formData.messageTemplate}
                onChange={e => setFormData({ ...formData, messageTemplate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingPolicy ? '保存' : '创建'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingPolicy(null)
                  setTestResult(null)
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                取消
              </button>
            </div>
          </form>

          {testResult && (
            <div className="mt-4 rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--muted)_/_0.5)] p-4">
              <pre className="text-sm whitespace-pre-wrap">{testResult}</pre>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="策略列表" className="mt-6">
        {policies.length === 0 ? (
          <div className="py-8 text-center text-[hsl(var(--muted-foreground))]">
            暂无策略，点击"新建策略"创建第一个通知策略
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map(policy => (
              <div key={policy.id} className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-[hsl(var(--foreground))]">{policy.name}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        policy.enabled
                          ? 'border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
                          : 'border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                      }`}>
                        {policy.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    {policy.description && (
                       <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{policy.description}</p>
                    )}
                    <div className="mt-2 space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                      <div>冷却: {policy.cooldownSeconds}s | 去重窗口: {policy.dedupeWindowSeconds}s</div>
                      <div>创建于: {new Date(policy.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(policy.id)}
                      className="rounded-full border border-[hsl(268_65%_70%_/_0.18)] bg-[hsl(268_65%_70%_/_0.12)] px-3 py-1.5 text-xs font-medium text-[hsl(268_45%_45%)] hover:bg-[hsl(268_65%_70%_/_0.18)] transition-colors"
                     >
                       测试
                     </button>
                     <button
                       onClick={() => handleToggleEnabled(policy)}
                       className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--google-yellow)_/_0.28)] transition-colors"
                     >
                       {policy.enabled ? '禁用' : '启用'}
                     </button>
                     <button
                       onClick={() => handleEdit(policy)}
                       className="rounded-full border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--google-blue))] hover:bg-[hsl(var(--google-blue)_/_0.18)] transition-colors"
                    >
                      编辑
                    </button>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                    查看配置详情
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
            <div className="font-medium text-[hsl(var(--foreground))]">事件过滤器:</div>
                       <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2">
                        {JSON.stringify(policy.eventFilters, null, 2)}
                      </pre>
                    </div>
                    <div>
            <div className="font-medium text-[hsl(var(--foreground))]">目标过滤器:</div>
                       <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2">
                        {JSON.stringify(policy.targetFilters, null, 2)}
                      </pre>
                    </div>
                    <div>
            <div className="font-medium text-[hsl(var(--foreground))]">投递目标:</div>
                       <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2">
                        {JSON.stringify(policy.deliveryTargets, null, 2)}
                      </pre>
                    </div>
                    {policy.quietHours && (
                      <div>
                         <div className="font-medium text-[hsl(var(--foreground))]">静默时段:</div>
                         <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2">
                          {JSON.stringify(policy.quietHours, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div>
                     <div className="font-medium text-[hsl(var(--foreground))]">消息模板:</div>
                       <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2 whitespace-pre-wrap">
                        {policy.messageTemplate}
                      </pre>
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
