import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useErrorMessage, useConfirmMessage, translateEnum } from '../lib/i18n-helpers'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ThemeInput, ThemeSelect, ThemeTextarea } from '../components/ui/FormFields'
import { getToneByStatus } from '../lib/status-badge'
interface Ticket {
  id: string
  title: string
  status: string
  priority: string
  source: string
  contactId?: string | null
  primaryTargetId?: string | null
  assignee?: { name: string }
  contact?: { id: string; name: string; company?: string | null } | null
  primaryTarget?: { id: string; channel: string; to: string; displayName: string; allowlisted: boolean } | null
  artifacts?: Artifact[]
  approvals?: Approval[]
  tags?: TicketTag[]
  createdAt: string
  updatedAt: string
}
interface TicketTag {
  id: string
  tag: Tag
}
interface Tag {
  id: string
  name: string
  color: string
}
interface Artifact {
  id: string
  type: string
  content: string
  version: number
  createdAt: string
}
interface Approval {
  id: string
  actionType: string
  status: string
  requestedBy: string
  approvedBy?: string
  createdAt: string
}

interface OutboundDraft {
  channel: string
  to: string
  subject: string
  body: string
}

interface Contact {
  id: string
  name: string
  company?: string | null
  tags: string[]
  notes: string
  contactTargets: ContactTarget[]
}

interface ContactTarget {
  id: string
  commsTargetId: string
  isPrimary: boolean
  channel: string
  toMasked: string
  displayName: string
  commsTarget: CommsTarget
}

interface CommsTarget {
  id: string
  channel: string
  to: string
  displayName: string
  allowlisted: boolean
}

interface MessageTemplate {
  id: string
  name: string
  scenario: string
  channelConstraints: string[]
  contentFormat: 'MARKDOWN' | 'PLAINTEXT'
  subjectTemplate?: string | null
  bodyTemplate: string
  variablesSchema: {
    properties?: Record<string, { title?: string }>
  }
  defaults: Record<string, unknown>
  enabled: boolean
}
interface PipelineState {
  id: string
  ticketId: string
  pipelineId: string
  currentStepOrder: number
  status: string
  pipeline: {
    id: string
    name: string
    steps: PipelineStep[]
  }
}
interface PipelineStep {
  id: string
  order: number
  roleName: string
  inputArtifacts: string
  outputArtifacts: string
  requireApprovalActions: string
  allowRework: boolean
}
interface Job {
  id: string
  ticketId: string
  type: string
  status: string
  traceId: string
  logs?: string
  createdAt: string
  updatedAt: string
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['tickets', 'common'])
  const getErrorMessage = useErrorMessage()
  const getConfirmMessage = useConfirmMessage()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [newArtifactType, setNewArtifactType] = useState('PRD')
  const [newArtifactContent, setNewArtifactContent] = useState('')
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [selectedContactId, setSelectedContactId] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({})
  const [composePreview, setComposePreview] = useState<{ subject: string; body: string } | null>(null)
  const [renderedDraftId, setRenderedDraftId] = useState<string>('')
  const [outboundDraft, setOutboundDraft] = useState<OutboundDraft>({
    channel: 'slack',
    to: '',
    subject: '',
    body: ''
  })
  const [sendingOutbound, setSendingOutbound] = useState(false)
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      await Promise.all([
        fetchTicket(),
        fetchAvailableTags(),
        fetchContacts(),
        fetchTemplates(),
        fetchPipelineState(),
        fetchJobs()
      ])
    })()
  }, [id])

  useEffect(() => {
    if (!ticket) return
    if (ticket.contactId) {
      setSelectedContactId(ticket.contactId)
    }
    if (ticket.primaryTargetId) {
      setSelectedTargetId(ticket.primaryTargetId)
    }
  }, [ticket?.id, ticket?.contactId, ticket?.primaryTargetId])
  const fetchTicket = async () => {
    try {
      const tickets = await apiFetch<Ticket[]>('/api/tickets')
      const found = tickets.find((t: Ticket) => t.id === id)
      setTicket(found || null)
    } catch (error) {
      console.error('Failed to fetch ticket:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async () => {
    try {
      const data = await apiFetch<Contact[]>('/api/contacts')
      setContacts(data)
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    }
  }

  const fetchTemplates = async () => {
    try {
      const data = await apiFetch<MessageTemplate[]>('/api/message-templates?enabled=true')
      setTemplates(data)
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }
  const fetchAvailableTags = async () => {
    try {
      const tags = await apiFetch<Tag[]>('/api/tags')
      setAvailableTags(tags)
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    }
  }
  const fetchPipelineState = async () => {
    try {
      const result = await apiFetch<ApiResponse<PipelineState>>(`/api/tickets/${id}/pipeline`)
      if (result.success) {
        setPipelineState(result.data ?? null)
      }
    } catch (error) {
      console.error('Failed to fetch pipeline state:', error)
    }
  }
  const fetchJobs = async () => {
    try {
      const result = await apiFetch<ApiResponse<Job[]>>(`/api/jobs?ticketId=${id}`)
      if (!result.success) {
        throw new Error(result.error)
      }
      setJobs(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
      setJobs([])
    }
  }
  const handleAdvancePipeline = async () => {
    try {
      const result = await apiFetch<ApiResponse<{ needsApproval?: boolean; approvalIds?: string[] }>>(`/api/tickets/${id}/pipeline/advance`, {
        method: 'POST',
        body: JSON.stringify({ requestedBy: 'admin' })
      })
      if (!result.success) {
        throw new Error(t('tickets:detail.pipeline.advanceFailed'))
      }
      if (result.data?.needsApproval) {
        alert(t('tickets:detail.pipeline.needsApproval', { ids: (result.data?.approvalIds || []).join(', ') }))
      } else {
        alert(t('tickets:detail.pipeline.advanceSuccess'))
      }
      await Promise.all([fetchPipelineState(), fetchTicket()])
    } catch (error) {
      console.error('Failed to advance pipeline:', error)
      alert(getErrorMessage(error))
    }
  }
  const handleRollbackPipeline = async () => {
    if (!confirm(getConfirmMessage('rollback'))) return
    try {
      const result = await apiFetch<ApiResponse<{ needsApproval?: boolean; approvalIds?: string[] }>>(`/api/tickets/${id}/pipeline/rollback`, {
        method: 'POST',
        body: JSON.stringify({ requestedBy: 'admin' })
      })
      if (!result.success) {
        throw new Error(t('tickets:detail.pipeline.rollbackFailed'))
      }
      alert(t('tickets:detail.pipeline.rollbackSuccess'))
      await Promise.all([fetchPipelineState(), fetchTicket()])
    } catch (error) {
      console.error('Failed to rollback pipeline:', error)
      alert(getErrorMessage(error))
    }
  }
  const handleRetryJob = async (jobId: string) => {
    try {
      const result = await apiFetch<ApiResponse<Job>>(`/api/jobs/${jobId}/retry`, {
        method: 'POST'
      })
      if (!result.success) {
        throw new Error(t('tickets:detail.jobs.retryFailed'))
      }
      alert(t('tickets:detail.jobs.retrySuccess'))
      await fetchJobs()
    } catch (error) {
      console.error('Failed to retry job:', error)
      alert(getErrorMessage(error))
    }
  }
  const handleAddTag = async () => {
    if (!selectedTagId) return
    try {
      await apiFetch(`/api/tickets/${id}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId: selectedTagId })
      })
      setSelectedTagId('')
      await fetchTicket()
    } catch (error) {
      console.error('Failed to add tag:', error)
    }
  }
  const handleRemoveTag = async (tagId: string) => {
    try {
      await apiFetch(`/api/tickets/${id}/tags/${tagId}`, {
        method: 'DELETE'
      })
      await fetchTicket()
    } catch (error) {
      console.error('Failed to remove tag:', error)
    }
  }
  const handleAddArtifact = async () => {
    if (!newArtifactContent.trim()) return
    try {
      await apiFetch('/api/artifacts', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: id,
          type: newArtifactType,
          content: newArtifactContent,
          version: 1
        })
      })
      setNewArtifactContent('')
      await fetchTicket()
    } catch (error) {
      console.error('Failed to add artifact:', error)
    }
  }

  const handleCreateOutboundDraftFromArtifact = (artifact: Artifact) => {
    const defaultSubject = `Ticket ${ticket?.id || ''} 外发消息`
    setOutboundDraft({
      channel: 'slack',
      to: '',
      subject: defaultSubject,
      body: artifact.content.trim()
    })
  }

  const renderListSection = <T,>(params: {
    title: string
    items: T[]
    emptyMessage: string
    renderItem: (item: T) => JSX.Element
    testId?: string
  }) => (
    <SectionCard title={params.title} testId={params.testId}>
      <div className="space-y-3">
        {params.items.map(params.renderItem)}
        {params.items.length === 0 && <EmptyState message={params.emptyMessage} />}
      </div>
    </SectionCard>
  )

  const selectedContact = contacts.find(contact => contact.id === selectedContactId)
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId)
  const selectedContactTarget = selectedContact?.contactTargets.find(item => item.commsTargetId === selectedTargetId)

  const handleBindContactToTicket = async (contactId: string) => {
    if (!ticket) return
    const selected = contacts.find(contact => contact.id === contactId)
    const primary = selected?.contactTargets.find(target => target.isPrimary)

    await apiFetch(`/api/tickets/${ticket.id}/contact`, {
      method: 'PUT',
      body: JSON.stringify({
        contactId,
        primaryTargetId: primary?.commsTargetId || null
      })
    })

    setSelectedContactId(contactId)
    setSelectedTargetId(primary?.commsTargetId || '')
    if (primary) {
      setOutboundDraft(prev => ({
        ...prev,
        channel: primary.channel,
        to: primary.commsTarget.to
      }))
    }
    await fetchTicket()
  }

  const handleRenderTemplateDraft = async () => {
    if (!ticket || !selectedTemplateId) return

    const target = selectedContactTarget?.commsTarget
    const result = await apiFetch<{ outboundDraft: { id: string; channel: string; to: string; subject?: string; body: string }; rendered: { subject?: string; body: string } }>('/api/template-runs/render-draft', {
      method: 'POST',
      body: JSON.stringify({
        templateId: selectedTemplateId,
        ticketId: ticket.id,
        variables: templateVariables,
        channel: target?.channel || outboundDraft.channel,
        to: target?.to || outboundDraft.to
      })
    })

    setRenderedDraftId(result.outboundDraft.id)
    setComposePreview({
      subject: result.rendered.subject || '',
      body: result.rendered.body
    })
    setOutboundDraft({
      channel: result.outboundDraft.channel,
      to: result.outboundDraft.to,
      subject: result.outboundDraft.subject || '',
      body: result.outboundDraft.body
    })
  }

  const handleSendOutboundDraft = async () => {
    if (!ticket || !outboundDraft.to.trim() || !outboundDraft.body.trim()) return

    if (!ticket.contactId) {
      const confirmed = window.confirm('当前工单未绑定联系人，发送前请确认目标无误。是否继续？')
      if (!confirmed) return
    }

    setSendingOutbound(true)
    try {
      const draftId = renderedDraftId || (await (async () => {
        const created = await apiFetch<{ id: string }>('/api/outbound-messages', {
          method: 'POST',
          body: JSON.stringify({
            ticketId: ticket.id,
            channel: outboundDraft.channel,
            to: outboundDraft.to.trim(),
            subject: outboundDraft.subject.trim() || null,
            body: outboundDraft.body,
            status: 'DRAFT'
          })
        })
        return created.id as string
      })())

      const sendResult = await apiFetch<{ status?: string; message?: string; approvalId?: string }>(`/api/outbound-messages/${draftId}/send`, {
        method: 'POST',
        body: JSON.stringify({})
      })

      if (sendResult.status === 'blocked_allowlist') {
        alert(sendResult.message)
        return
      }
      if (sendResult.status === 'pending_approval') {
        alert(`外发消息已创建并进入审批，审批 ID: ${sendResult.approvalId}`)
      } else if (sendResult.status === 'sent') {
        alert('外发消息发送成功')
      }

      setOutboundDraft(prev => ({ ...prev, to: '' }))
      setRenderedDraftId('')
      await fetchTicket()
    } catch (error) {
      console.error('Failed to send outbound draft:', error)
    } finally {
      setSendingOutbound(false)
    }
  }
  if (loading) {
    return (
      <LoadingState message="加载工单详情中..." />
    )
  }
  if (!ticket) {
    return (
      <div>
        <EmptyState message="工单不存在" className="mb-4" />
        <div className="text-center">
          <button
            onClick={() => navigate('/tickets')}
            className="text-[hsl(var(--primary))] hover:underline"
          >
            返回看板
          </button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <PageHeader
        title={ticket.title}
        description={`工单 ID: ${ticket.id}`}
        actions={
          <button
            onClick={() => navigate('/tickets')}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))]
                     hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            ← 返回看板
          </button>
        }
      />
      {/* 工单基本信息 */}
      <SectionCard className="mb-6" testId="ticket-basic-info-panel">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] p-4">
            <span className="text-[hsl(var(--muted-foreground))]">状态：</span>
            <StatusBadge label={ticket.status} tone={getToneByStatus(ticket.status, { DONE: 'success', DELIVERY: 'success', TEST: 'info', SPEC: 'info', DEV: 'warning' })} className="ml-2 px-2.5 py-1" />
          </div>
          <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] p-4">
            <span className="text-[hsl(var(--muted-foreground))]">优先级：</span>
            <StatusBadge label={ticket.priority} tone={getToneByStatus(ticket.priority, { HIGH: 'danger', MEDIUM: 'warning', LOW: 'muted' })} className="ml-2 px-2.5 py-1" />
          </div>
          <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
            <span className="text-[hsl(var(--muted-foreground))]">来源：</span>
            <span className="ml-2 font-medium text-[hsl(var(--foreground))]">{ticket.source}</span>
          </div>
          <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
            <span className="text-[hsl(var(--muted-foreground))]">负责人：</span>
            <span className="ml-2 font-medium text-[hsl(var(--foreground))]">{ticket.assignee?.name || '未分配'}</span>
          </div>
        </div>
        {/* 标签显示 */}
        <div className="mt-6 border-t border-[hsl(var(--border))] pt-6">
          <span className="text-[hsl(var(--muted-foreground))] text-sm font-medium">标签：</span>
          <div className="flex flex-wrap gap-2 mt-3">
            {ticket.tags && ticket.tags.length > 0 ? (
              ticket.tags.map(tt => (
                <span
                  key={tt.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm"
                  style={{ backgroundColor: `${tt.tag.color}20`, color: tt.tag.color }}
                >
                  {tt.tag.name}
                  <button
                    onClick={() => handleRemoveTag(tt.tag.id)}
                    className="hover:opacity-70 transition-opacity"
                    aria-label={`移除标签 ${tt.tag.name}`}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span className="text-[hsl(var(--muted-foreground))] text-sm">无标签</span>
            )}
          </div>
        </div>
        {/* 添加标签 */}
        <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
          <h3 className="font-medium mb-3 text-sm text-[hsl(var(--foreground))]">添加标签</h3>
          <div className="flex gap-2">
            <ThemeSelect
              value={selectedTagId}
              onChange={e => setSelectedTagId(e.target.value)}
              fieldSize="lg"
              fieldShape="pill"
              className="flex-1"
            >
              <option value="">选择标签...</option>
              {availableTags
                .filter(tag => !ticket.tags?.some(tt => tt.tag.id === tag.id))
                .map(tag => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
            </ThemeSelect>
            <button
              onClick={handleAddTag}
              disabled={!selectedTagId}
               className="rounded-full px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                        hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                        text-sm font-medium transition-opacity"
            >
              添加
            </button>
          </div>
        </div>
      </SectionCard>
      {/* 双栏布局：交付物 + 审批记录 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 交付物 */}
        <SectionCard title="交付物" testId="ticket-artifacts-panel">
          <div className="space-y-3 mb-6">
            {ticket.artifacts?.map(artifact => (
              <div key={artifact.id} className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[hsl(var(--google-blue)_/_0.14)] bg-[hsl(var(--google-blue)_/_0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--google-blue))]">{artifact.type}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono">v{artifact.version}</span>
                  </div>
                </div>
                <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap leading-relaxed">{artifact.content}</p>
                {(artifact.type === 'CLIENT_MSG' || artifact.type === 'DELIVERY_LIST') && (
                  <button
                    onClick={() => handleCreateOutboundDraftFromArtifact(artifact)}
                    className="mt-3 rounded-full bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
                  >
                    用此交付物生成外发草稿
                  </button>
                )}
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                  {formatDateTime(artifact.createdAt)}
                </p>
              </div>
            ))}
            {(!ticket.artifacts || ticket.artifacts.length === 0) && (
              <EmptyState message="暂无交付物" />
            )}
          </div>
          <div className="pt-4 border-t border-[hsl(var(--border))]">
            <h3 className="font-medium mb-3 text-sm text-[hsl(var(--foreground))]">添加交付物</h3>
            <ThemeSelect
              value={newArtifactType}
              onChange={e => setNewArtifactType(e.target.value)}
              fieldSize="lg"
              fieldShape="pill"
              className="mb-3 w-full"
            >
              <option value="PRD">PRD</option>
              <option value="PLAN">方案</option>
              <option value="CODE_CHANGE">代码改动</option>
              <option value="TEST_CASES">测试用例</option>
              <option value="DEPLOY">部署</option>
              <option value="ROLLBACK">回滚</option>
              <option value="DELIVERY_LIST">交付清单</option>
              <option value="CLIENT_MSG">客户沟通</option>
            </ThemeSelect>
            <ThemeTextarea value={newArtifactContent} onChange={e => setNewArtifactContent(e.target.value)} placeholder="内容（支持 Markdown）" fieldSize="lg" fieldShape="soft" className="mb-3 w-full" rows={4} />
            <button
              onClick={handleAddArtifact}
               className="w-full rounded-full px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                        hover:opacity-90 transition-opacity
                        text-sm font-medium"
            >
              添加
            </button>
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))] mt-4">
            <h3 className="font-medium mb-3 text-sm text-[hsl(var(--foreground))]">Compose & Send（模板外发）</h3>
            <div className="grid grid-cols-1 gap-3 mb-3">
              <ThemeSelect
                value={selectedContactId}
                onChange={e => {
                  const nextId = e.target.value
                  setSelectedContactId(nextId)
                  if (nextId) {
                    handleBindContactToTicket(nextId)
                  }
                }}
                fieldSize="lg"
                fieldShape="pill"
              >
                <option value="">选择联系人（可选）</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}{contact.company ? ` / ${contact.company}` : ''}
                  </option>
                ))}
              </ThemeSelect>

              <ThemeSelect
                value={selectedTargetId}
                onChange={e => {
                  const nextTargetId = e.target.value
                  setSelectedTargetId(nextTargetId)
                  const target = selectedContact?.contactTargets.find(item => item.commsTargetId === nextTargetId)?.commsTarget
                  if (target) {
                    setOutboundDraft(prev => ({ ...prev, channel: target.channel, to: target.to }))
                  }
                }}
                fieldSize="lg"
                fieldShape="pill"
              >
                <option value="">选择联系人目标（可选）</option>
                {(selectedContact?.contactTargets || []).map(target => (
                  <option key={target.id} value={target.commsTargetId}>
                    {target.displayName} / {target.channel} / {target.toMasked}
                  </option>
                ))}
              </ThemeSelect>

              <ThemeSelect
                value={selectedTemplateId}
                onChange={e => {
                  setSelectedTemplateId(e.target.value)
                  setTemplateVariables({})
                }}
                fieldSize="lg"
                fieldShape="pill"
              >
                <option value="">选择模板</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} / {template.scenario}
                  </option>
                ))}
              </ThemeSelect>

              {selectedTemplate && (
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(selectedTemplate.variablesSchema?.properties || {}).map(([key, schema]) => (
                    <ThemeInput
                      key={key}
                      value={templateVariables[key] || ''}
                      onChange={e => setTemplateVariables(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={schema.title || key}
                      fieldSize="lg"
                      fieldShape="pill"
                    />
                  ))}
                </div>
              )}

              <button
                data-testid="ticket-render-template-draft"
                onClick={handleRenderTemplateDraft}
                disabled={!selectedTemplateId}
                className="rounded-full px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
              >
                生成草稿（DRAFT）
              </button>

               {composePreview && (
                  <div data-testid="ticket-template-preview" className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--muted)_/_0.56)] p-3 shadow-sm">
                   <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">模板预览</p>
                   <p className="text-sm font-medium mb-2">主题：{composePreview.subject || '（无）'}</p>
                   <p className="text-sm whitespace-pre-wrap">{composePreview.body}</p>
                </div>
              )}

              <ThemeSelect
                data-testid="ticket-outbound-channel-select"
                value={outboundDraft.channel}
                onChange={e => setOutboundDraft(prev => ({ ...prev, channel: e.target.value }))}
                fieldSize="lg"
                fieldShape="pill"
              >
                <option value="slack">slack</option>
                <option value="telegram">telegram</option>
                <option value="discord">discord</option>
                <option value="msteams">msteams</option>
                <option value="signal">signal</option>
                <option value="whatsapp">whatsapp</option>
                <option value="imessage">imessage</option>
              </ThemeSelect>
              <ThemeInput
                data-testid="ticket-outbound-to-input"
                value={outboundDraft.to}
                onChange={e => setOutboundDraft(prev => ({ ...prev, to: e.target.value }))}
                placeholder="收件人 / 频道 ID"
                fieldSize="lg"
                fieldShape="pill"
              />
              <ThemeInput
                data-testid="ticket-outbound-subject-input"
                value={outboundDraft.subject}
                onChange={e => setOutboundDraft(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="主题（可选）"
                fieldSize="lg"
                fieldShape="pill"
              />
              <ThemeTextarea data-testid="ticket-outbound-body-input" value={outboundDraft.body} onChange={e => setOutboundDraft(prev => ({ ...prev, body: e.target.value }))} placeholder="外发正文（支持 Markdown）" rows={6} fieldSize="lg" fieldShape="soft" />
            </div>
            <Button
              data-testid="ticket-send-outbound"
              className="w-full"
              onClick={handleSendOutboundDraft}
              loading={sendingOutbound}
              disabled={!outboundDraft.to.trim() || !outboundDraft.body.trim()}
            >
              发送（创建审批）
            </Button>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">仅 allowlist 目标允许发送；发送会创建 SEND_EXTERNAL 审批。</p>
          </div>
        </SectionCard>
        {/* 审批记录 */}
        {renderListSection({
          title: '审批记录',
          items: ticket.approvals || [],
          emptyMessage: '暂无审批记录',
          testId: 'ticket-approvals-panel',
          renderItem: (approval) => (
            <div key={approval.id} className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{approval.actionType}</span>
                <StatusBadge label={approval.status} tone={getToneByStatus(approval.status, { APPROVED: 'success', REJECTED: 'danger', PENDING: 'warning' })} className="px-2.5 py-1" />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                申请人：{approval.requestedBy}
              </p>
              {approval.approvedBy && (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  审批人：{approval.approvedBy}
                </p>
              )}
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                {formatDateTime(approval.createdAt)}
              </p>
            </div>
          )
        })}
        {/* Pipeline 面板 */}
        {pipelineState && (
          <SectionCard title="Pipeline 流程" testId="ticket-pipeline-panel">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--muted)_/_0.52)] p-4">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    当前步骤：{pipelineState.currentStepOrder}/{pipelineState.pipeline.steps.length} - {pipelineState.pipeline.steps.find(s => s.order === pipelineState.currentStepOrder)?.roleName}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    Pipeline: {pipelineState.pipeline.name}
                  </p>
                </div>
                <StatusBadge label={pipelineState.status} tone={getToneByStatus(pipelineState.status, { RUNNING: 'info', PAUSED: 'warning', COMPLETED: 'success', FAILED: 'danger' })} className="px-2.5 py-1" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdvancePipeline}
                  disabled={pipelineState.status !== 'RUNNING'}
                  className="rounded-full px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
                >
                  推进到下一步
                </button>
                <button
                  onClick={handleRollbackPipeline}
                  disabled={pipelineState.currentStepOrder <= 1}
                  className="rounded-full px-4 py-2.5 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:opacity-90 disabled:opacity-50"
                >
                  回退到上一步
                </button>
              </div>
            </div>
          </SectionCard>
        )}
        {/* Jobs 列表 */}
        {renderListSection({
          title: 'Jobs 执行记录',
          items: jobs,
          emptyMessage: '暂无作业记录',
          renderItem: (job) => (
            <div key={job.id} className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="rounded-full border border-[hsl(var(--google-blue)_/_0.14)] bg-[hsl(var(--google-blue)_/_0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--google-blue))]">{job.type}</span>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    {formatDateTime(job.createdAt)}
                  </p>
                </div>
                <StatusBadge label={translateEnum(t, 'operationStatusMap', job.status)} tone={getToneByStatus(job.status, { RUNNING: 'info', SUCCEEDED: 'success', FAILED: 'danger' })} className="px-2.5 py-1" />
              </div>
              {job.logs && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                    className="text-xs text-[hsl(var(--primary))] hover:underline"
                  >
                    {expandedJobId === job.id ? '隐藏日志' : '查看日志'}
                  </button>
                  {expandedJobId === job.id && (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-3 text-xs">
                      {job.logs}
                    </pre>
                  )}
                </div>
              )}
              {job.status === 'FAILED' && (
                <button
                  onClick={() => handleRetryJob(job.id)}
                  className="mt-2 rounded-full px-3 py-1.5 text-xs font-medium bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] hover:opacity-90"
                >
                  重试
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
