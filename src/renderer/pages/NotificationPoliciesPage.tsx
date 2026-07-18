import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { FormError, FormField, FormHint, FormLabel, ThemeCheckbox, ThemeInput, ThemeNumberInput, ThemeTextarea } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface NotificationPolicy {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  enabled: boolean
  eventFilters: unknown
  targetFilters: unknown
  deliveryTargets: unknown
  quietHours?: unknown | null
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

interface PolicyTestResponse {
  matched: boolean
  renderedMessage?: string
  reason?: string
}

interface PolicyFormData {
  name: string
  description: string
  enabled: boolean
  eventFilters: string
  targetFilters: string
  deliveryTargets: string
  quietHours: string
  cooldownSeconds: number
  dedupeWindowSeconds: number
  messageTemplate: string
}

interface FormSectionProps {
  formData: PolicyFormData
  setFormData: React.Dispatch<React.SetStateAction<PolicyFormData>>
  jsonFieldErrors?: Record<string, string>
}

function PolicyBasicFields({ formData, setFormData }: FormSectionProps) {
  return (
    <>
      <FormField>
        <FormLabel>策略名称</FormLabel>
        <ThemeInput
          type="text"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </FormField>

      <FormField>
        <FormLabel>描述</FormLabel>
        <ThemeTextarea
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          rows={2}
        />
      </FormField>

      <div className="flex items-center gap-2 text-[hsl(var(--foreground))]">
        <ThemeCheckbox
          checked={formData.enabled}
          onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
        />
        <label className="text-sm font-medium text-[hsl(var(--foreground))]">启用策略</label>
      </div>
    </>
  )
}

function PolicyJsonFields({ formData, setFormData, jsonFieldErrors }: FormSectionProps) {
  return (
    <>
      <FormField>
        <FormLabel>事件过滤器 (JSON)</FormLabel>
        <FormHint>例: {`{"sourceType": "DEPLOYMENT", "severity": "CRITICAL"}`}</FormHint>
        <ThemeTextarea
          value={formData.eventFilters}
          onChange={e => setFormData({ ...formData, eventFilters: e.target.value })}
          rows={4}
          required
        />
        {jsonFieldErrors?.eventFilters && <FormError>{jsonFieldErrors.eventFilters}</FormError>}
      </FormField>

      <FormField>
        <FormLabel>目标过滤器 (JSON)</FormLabel>
        <FormHint>例: {`{"targetId": "prod-*"}`}</FormHint>
        <ThemeTextarea
          value={formData.targetFilters}
          onChange={e => setFormData({ ...formData, targetFilters: e.target.value })}
          rows={4}
          required
        />
        {jsonFieldErrors?.targetFilters && <FormError>{jsonFieldErrors.targetFilters}</FormError>}
      </FormField>

      <FormField>
        <FormLabel>投递目标 (JSON)</FormLabel>
        <FormHint>例: {`{"channels": ["email"], "recipients": ["admin@example.com"]}`}</FormHint>
        <ThemeTextarea
          value={formData.deliveryTargets}
          onChange={e => setFormData({ ...formData, deliveryTargets: e.target.value })}
          rows={4}
          required
        />
        {jsonFieldErrors?.deliveryTargets && <FormError>{jsonFieldErrors.deliveryTargets}</FormError>}
      </FormField>

      <FormField>
        <FormLabel>静默时段 (JSON, 可选)</FormLabel>
        <FormHint>例: {`{"start": "22:00", "end": "08:00", "timezone": "Asia/Shanghai"}`}</FormHint>
        <ThemeTextarea
          value={formData.quietHours}
          onChange={e => setFormData({ ...formData, quietHours: e.target.value })}
          rows={3}
        />
        {jsonFieldErrors?.quietHours && <FormError>{jsonFieldErrors.quietHours}</FormError>}
      </FormField>
    </>
  )
}

function PolicyTimingFields({ formData, setFormData }: FormSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField>
        <FormLabel>冷却时间 (秒)</FormLabel>
        <ThemeNumberInput
          value={formData.cooldownSeconds}
          onChange={e => setFormData({ ...formData, cooldownSeconds: parseInt(e.target.value) })}
          min={0}
          required
        />
      </FormField>

      <FormField>
        <FormLabel>去重窗口 (秒)</FormLabel>
        <ThemeNumberInput
          value={formData.dedupeWindowSeconds}
          onChange={e => setFormData({ ...formData, dedupeWindowSeconds: parseInt(e.target.value) })}
          min={0}
          required
        />
      </FormField>
    </div>
  )
}

interface PolicyTemplateAndActionsProps extends FormSectionProps {
  editingPolicy: NotificationPolicy | null
  onCancel: () => void
  isSubmitting: boolean
}

function PolicyTemplateAndActions({ formData, setFormData, editingPolicy, onCancel, isSubmitting }: PolicyTemplateAndActionsProps) {
  return (
    <>
      <FormField>
        <FormLabel>消息模板</FormLabel>
        <FormHint>支持变量: {`{{title}}, {{summary}}, {{severity}}`}</FormHint>
        <ThemeTextarea
          value={formData.messageTemplate}
          onChange={e => setFormData({ ...formData, messageTemplate: e.target.value })}
          rows={6}
          required
        />
      </FormField>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? '提交中...' : (editingPolicy ? '保存' : '创建')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </>
  )
}

export function NotificationPoliciesPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [policies, setPolicies] = useState<NotificationPolicy[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<NotificationPolicy | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState<PolicyFormData>({
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

  const workspaceId = readWorkspaceId()

  const parseJsonField = (value: string, label: string, optional = false) => {
    if (optional && value.trim() === '') {
      return null
    }

    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`${label} 不是合法的 JSON`)
    }
  }

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message
    return '未知错误'
  }

  const getJsonFieldErrors = () => {
    const errors: Record<string, string> = {}
    const fields = [
      { key: 'eventFilters', label: '事件过滤器', value: formData.eventFilters, optional: false },
      { key: 'targetFilters', label: '目标过滤器', value: formData.targetFilters, optional: false },
      { key: 'deliveryTargets', label: '投递目标', value: formData.deliveryTargets, optional: false },
      { key: 'quietHours', label: '静默时段', value: formData.quietHours, optional: true }
    ]

    for (const field of fields) {
      try {
        parseJsonField(field.value, field.label, field.optional)
      } catch (error) {
        errors[field.key] = error instanceof Error ? error.message : `${field.label} 格式错误`
      }
    }

    return errors
  }

  const jsonFieldErrors = getJsonFieldErrors()

  const renderJsonBlock = (label: string, value: unknown) => (
    <div>
      <div className="font-medium text-[hsl(var(--foreground))]">{label}</div>
      <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )

  const renderPolicyCard = (policy: NotificationPolicy) => (
    <div key={policy.id} className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-[hsl(var(--foreground))]">{policy.name}</h3>
            <StatusBadge label={policy.enabled ? '已启用' : '已禁用'} tone={policy.enabled ? 'success' : 'muted'} className="px-2.5 py-1" />
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
          {renderJsonBlock('事件过滤器:', policy.eventFilters)}
          {renderJsonBlock('目标过滤器:', policy.targetFilters)}
          {renderJsonBlock('投递目标:', policy.deliveryTargets)}
          {policy.quietHours != null && renderJsonBlock('静默时段:', policy.quietHours)}
          <div>
            <div className="font-medium text-[hsl(var(--foreground))]">消息模板:</div>
            <pre className="mt-1 overflow-x-auto rounded-workshop-md border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.5)] p-2 whitespace-pre-wrap">
              {policy.messageTemplate}
            </pre>
          </div>
        </div>
      </details>
    </div>
  )

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
    setFormError(null)
    setPageError(null)
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
    setFormError(null)
    setPageError(null)
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

    if (isSubmitting) return

    setFormError(null)
    setPageError(null)

    if (Object.keys(jsonFieldErrors).length > 0) {
      setFormError('请先修正 JSON 字段格式错误后再提交')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        workspaceId,
        name: formData.name,
        description: formData.description || null,
        enabled: formData.enabled,
        eventFilters: parseJsonField(formData.eventFilters, '事件过滤器'),
        targetFilters: parseJsonField(formData.targetFilters, '目标过滤器'),
        deliveryTargets: parseJsonField(formData.deliveryTargets, '投递目标'),
        quietHours: parseJsonField(formData.quietHours, '静默时段', true),
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

      const json = await response.json() as ApiResponse<NotificationPolicy>
      if (!json.success) {
        setFormError(`保存失败：${json.error}`)
        return
      }

      await fetchPolicies(apiPort)
      setShowForm(false)
      setEditingPolicy(null)
      setFormError(null)
    } catch (err: unknown) {
      setFormError(`提交失败：${getErrorMessage(err)}`)
    } finally {
      setIsSubmitting(false)
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

      const json = await response.json() as ApiResponse<PolicyTestResponse>
      if (!json.success) {
        setTestResult(`测试失败: ${json.error}`)
        return
      }

      if (json.data.matched) {
        setTestResult(`✅ 策略匹配成功！\n\n渲染消息:\n${json.data.renderedMessage}`)
      } else {
        setTestResult(`❌ 策略不匹配\n\n原因: ${json.data.reason || '未知'}`)
      }
    } catch (err: unknown) {
      setTestResult(`测试失败: ${getErrorMessage(err)}`)
    }
  }

  const handleToggleEnabled = async (policy: NotificationPolicy) => {
    if (!apiPort) return

    setPageError(null)

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/notification-policies/${policy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...policy,
          enabled: !policy.enabled
        })
      })

      const json = await response.json() as ApiResponse<NotificationPolicy>
      if (!json.success) {
        setPageError(`切换策略状态失败：${json.error}`)
        return
      }

      await fetchPolicies(apiPort)
    } catch (err: unknown) {
      setPageError(`切换策略状态失败：${getErrorMessage(err)}`)
    }
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingPolicy(null)
    setTestResult(null)
    setFormError(null)
  }

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader title="通知策略" description="管理事件驱动的通知规则" />
        <LoadingState message="加载通知策略中..." />
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
            className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-colors"
          >
            新建策略
          </button>
        }
      />

      {pageError && (
        <div className="mt-4 rounded-workshop-lg border border-[hsl(var(--destructive)_/_0.25)] bg-[hsl(var(--destructive)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {pageError}
        </div>
      )}

      {showForm && (
        <SectionCard title={editingPolicy ? '编辑策略' : '新建策略'} className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="rounded-workshop-lg border border-[hsl(var(--destructive)_/_0.25)] bg-[hsl(var(--destructive)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
                {formError}
              </div>
            )}
            <PolicyBasicFields formData={formData} setFormData={setFormData} />
            <PolicyJsonFields formData={formData} setFormData={setFormData} jsonFieldErrors={jsonFieldErrors} />
            <PolicyTimingFields formData={formData} setFormData={setFormData} />
            <PolicyTemplateAndActions
              formData={formData}
              setFormData={setFormData}
              editingPolicy={editingPolicy}
              onCancel={handleCancelForm}
              isSubmitting={isSubmitting}
            />
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
          <EmptyState message={'暂无策略，点击"新建策略"创建第一个通知策略'} className="py-8" />
        ) : (
          <div className="space-y-4">
            {policies.map(policy => renderPolicyCard(policy))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
