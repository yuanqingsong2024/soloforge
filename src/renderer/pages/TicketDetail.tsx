import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
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

interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiFailResponse {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailResponse
export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [apiPort, setApiPort] = useState<number | null>(null)
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
    getApiPort().then(port => {
      setApiPort(port)
      fetchTicket(port)
      fetchAvailableTags(port)
      fetchContacts(port)
      fetchTemplates(port)
      fetchPipelineState(port)
      fetchJobs(port)
    })
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
  const fetchTicket = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/tickets`)
      const tickets = await response.json()
      const found = tickets.find((t: Ticket) => t.id === id)
      setTicket(found || null)
    } catch (error) {
      console.error('Failed to fetch ticket:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/contacts`)
      const data = await response.json()
      setContacts(data)
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    }
  }

  const fetchTemplates = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/message-templates?enabled=true`)
      const data = await response.json()
      setTemplates(data)
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }
  const fetchAvailableTags = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/tags`)
      const tags = await response.json()
      setAvailableTags(tags)
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    }
  }
  const fetchPipelineState = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/tickets/${id}/pipeline`)
      if (response.ok) {
        const result = await response.json() as ApiResponse<PipelineState>
        if (result.success) {
          setPipelineState(result.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch pipeline state:', error)
    }
  }
  const fetchJobs = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs?ticketId=${id}`)
      const result = await response.json() as ApiResponse<Job[]>
      if (!response.ok || !result.success) {
        throw new Error(result.success ? '获取 Jobs 失败' : result.error)
      }
      setJobs(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
      setJobs([])
    }
  }
  const handleAdvancePipeline = async () => {
    if (!apiPort) return
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${id}/pipeline/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'admin' })
      })
      const result = await response.json()
      const wrapped = result as ApiResponse<{ needsApproval?: boolean; approvalIds?: string[] }>
      if (!response.ok || !wrapped.success) {
        throw new Error(wrapped.success ? '推进失败' : wrapped.error)
      }
      if (wrapped.data.needsApproval) {
        alert(`需要审批才能推进。审批 ID: ${(wrapped.data.approvalIds || []).join(', ')}`)
      } else {
        alert('Pipeline 推进成功')
      }
      fetchPipelineState(apiPort)
      fetchTicket(apiPort)
    } catch (error) {
      console.error('Failed to advance pipeline:', error)
      alert('推进失败')
    }
  }
  const handleRollbackPipeline = async () => {
    if (!apiPort || !confirm('确定要回退到上一步吗？')) return
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${id}/pipeline/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'admin' })
      })
      const result = await response.json() as ApiResponse<{ needsApproval?: boolean; approvalIds?: string[] }>
      if (!response.ok || !result.success) {
        throw new Error(result.success ? '回退失败' : result.error)
      }
      alert('Pipeline 回退成功')
      fetchPipelineState(apiPort)
      fetchTicket(apiPort)
    } catch (error) {
      console.error('Failed to rollback pipeline:', error)
      alert('回退失败')
    }
  }
  const handleRetryJob = async (jobId: string) => {
    if (!apiPort) return
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/jobs/${jobId}/retry`, {
        method: 'POST'
      })
      const result = await response.json() as ApiResponse<Job>
      if (!response.ok || !result.success) {
        throw new Error(result.success ? '重试失败' : result.error)
      }
      alert('Job 重试已提交')
      fetchJobs(apiPort)
    } catch (error) {
      console.error('Failed to retry job:', error)
      alert('重试失败')
    }
  }
  const getPipelineStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-blue-100 text-blue-800'
      case 'PAUSED': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'FAILED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-100 text-gray-800'
      case 'RUNNING': return 'bg-blue-100 text-blue-800'
      case 'SUCCEEDED': return 'bg-green-100 text-green-800'
      case 'FAILED': return 'bg-red-100 text-red-800'
      case 'CANCELED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  const handleAddTag = async () => {
    if (!apiPort || !selectedTagId) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: selectedTagId })
      })
      setSelectedTagId('')
      fetchTicket(apiPort)
    } catch (error) {
      console.error('Failed to add tag:', error)
    }
  }
  const handleRemoveTag = async (tagId: string) => {
    if (!apiPort) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${id}/tags/${tagId}`, {
        method: 'DELETE'
      })
      fetchTicket(apiPort)
    } catch (error) {
      console.error('Failed to remove tag:', error)
    }
  }
  const handleAddArtifact = async () => {
    if (!apiPort || !newArtifactContent.trim()) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: id,
          type: newArtifactType,
          content: newArtifactContent,
          version: 1
        })
      })
      setNewArtifactContent('')
      fetchTicket(apiPort)
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

  const selectedContact = contacts.find(contact => contact.id === selectedContactId)
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId)
  const selectedContactTarget = selectedContact?.contactTargets.find(item => item.commsTargetId === selectedTargetId)

  const handleBindContactToTicket = async (contactId: string) => {
    if (!apiPort || !ticket) return
    const selected = contacts.find(contact => contact.id === contactId)
    const primary = selected?.contactTargets.find(target => target.isPrimary)

    await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${ticket.id}/contact`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
    await fetchTicket(apiPort)
  }

  const handleRenderTemplateDraft = async () => {
    if (!apiPort || !ticket || !selectedTemplateId) return

    const target = selectedContactTarget?.commsTarget
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/template-runs/render-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        ticketId: ticket.id,
        variables: templateVariables,
        channel: target?.channel || outboundDraft.channel,
        to: target?.to || outboundDraft.to
      })
    })
    const result = await response.json()

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
    if (!apiPort || !ticket || !outboundDraft.to.trim() || !outboundDraft.body.trim()) return

    if (!ticket.contactId) {
      const confirmed = window.confirm('当前工单未绑定联系人，发送前请确认目标无误。是否继续？')
      if (!confirmed) return
    }

    setSendingOutbound(true)
    try {
      const draftId = renderedDraftId || (await (async () => {
        const createDraftRes = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: ticket.id,
            channel: outboundDraft.channel,
            to: outboundDraft.to.trim(),
            subject: outboundDraft.subject.trim() || null,
            body: outboundDraft.body,
            status: 'DRAFT'
          })
        })
        const created = await createDraftRes.json()
        return created.id as string
      })())

      const sendRes = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages/${draftId}/send`, {
        method: 'POST'
      })
      const sendResult = await sendRes.json()

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
      await fetchTicket(apiPort)
    } catch (error) {
      console.error('Failed to send outbound draft:', error)
    } finally {
      setSendingOutbound(false)
    }
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }
  if (!ticket) {
    return (
      <div>
        <div className="text-center py-12">
          <p className="text-[hsl(var(--muted-foreground))] mb-4">工单不存在</p>
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
  // 状态徽章样式
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      INBOX: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
      SPEC: 'bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]',
      DEV: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]',
      TEST: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
      DELIVERY: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
      DONE: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
    }
    return statusMap[status] || statusMap.INBOX
  }
  // 优先级徽章样式
  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, string> = {
      LOW: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
      MEDIUM: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]',
      HIGH: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
    }
    return priorityMap[priority] || priorityMap.MEDIUM
  }
  // 审批状态徽章样式
  const getApprovalBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      APPROVED: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
      REJECTED: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
      PENDING: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]'
    }
    return statusMap[status] || statusMap.PENDING
  }
  return (
    <div>
      <PageHeader
        title={ticket.title}
        description={`工单 ID: ${ticket.id}`}
        actions={
          <button
            onClick={() => navigate('/tickets')}
            className="px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))]
                     hover:text-[hsl(var(--foreground))] transition-colors"
          >
            ← 返回看板
          </button>
        }
      />
      {/* 工单基本信息 */}
      <SectionCard className="mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[hsl(var(--muted-foreground))]">状态：</span>
            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(ticket.status)}`}>
              {ticket.status}
            </span>
          </div>
          <div>
            <span className="text-[hsl(var(--muted-foreground))]">优先级：</span>
            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadge(ticket.priority)}`}>
              {ticket.priority}
            </span>
          </div>
          <div>
            <span className="text-[hsl(var(--muted-foreground))]">来源：</span>
            <span className="ml-2 font-medium text-[hsl(var(--foreground))]">{ticket.source}</span>
          </div>
          <div>
            <span className="text-[hsl(var(--muted-foreground))]">负责人：</span>
            <span className="ml-2 font-medium text-[hsl(var(--foreground))]">{ticket.assignee?.name || '未分配'}</span>
          </div>
        </div>
        {/* 标签显示 */}
        <div className="mt-6 pt-6 border-t border-[hsl(var(--border))]">
          <span className="text-[hsl(var(--muted-foreground))] text-sm font-medium">标签：</span>
          <div className="flex flex-wrap gap-2 mt-3">
            {ticket.tags && ticket.tags.length > 0 ? (
              ticket.tags.map(tt => (
                <span
                  key={tt.id}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
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
            <select
              value={selectedTagId}
              onChange={e => setSelectedTagId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-workshop-md
                       bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                       border border-[hsl(var(--border))]
                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="">选择标签...</option>
              {availableTags
                .filter(tag => !ticket.tags?.some(tt => tt.tag.id === tag.id))
                .map(tag => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
            </select>
            <button
              onClick={handleAddTag}
              disabled={!selectedTagId}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                       rounded-workshop-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
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
        <SectionCard title="交付物">
          <div className="space-y-3 mb-6">
            {ticket.artifacts?.map(artifact => (
              <div key={artifact.id} className="p-4 border border-[hsl(var(--border))] rounded-workshop-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{artifact.type}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono">v{artifact.version}</span>
                </div>
                <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap leading-relaxed">{artifact.content}</p>
                {(artifact.type === 'CLIENT_MSG' || artifact.type === 'DELIVERY_LIST') && (
                  <button
                    onClick={() => handleCreateOutboundDraftFromArtifact(artifact)}
                    className="mt-3 px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                  >
                    用此交付物生成外发草稿
                  </button>
                )}
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                  {new Date(artifact.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            ))}
            {(!ticket.artifacts || ticket.artifacts.length === 0) && (
              <p className="text-[hsl(var(--muted-foreground))] text-sm">暂无交付物</p>
            )}
          </div>
          <div className="pt-4 border-t border-[hsl(var(--border))]">
            <h3 className="font-medium mb-3 text-sm text-[hsl(var(--foreground))]">添加交付物</h3>
            <select
              value={newArtifactType}
              onChange={e => setNewArtifactType(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm rounded-workshop-md
                       bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                       border border-[hsl(var(--border))]
                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="PRD">PRD</option>
              <option value="PLAN">方案</option>
              <option value="CODE_CHANGE">代码改动</option>
              <option value="TEST_CASES">测试用例</option>
              <option value="DEPLOY">部署</option>
              <option value="ROLLBACK">回滚</option>
              <option value="DELIVERY_LIST">交付清单</option>
              <option value="CLIENT_MSG">客户沟通</option>
            </select>
            <textarea
              value={newArtifactContent}
              onChange={e => setNewArtifactContent(e.target.value)}
              placeholder="内容（支持 Markdown）"
              className="w-full px-3 py-2 text-sm rounded-workshop-md mb-3
                       bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                       border border-[hsl(var(--border))]
                       placeholder:text-[hsl(var(--muted-foreground))]
                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              rows={4}
            />
            <button
              onClick={handleAddArtifact}
              className="w-full px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                       rounded-workshop-md hover:opacity-90 transition-opacity
                       text-sm font-medium"
            >
              添加
            </button>
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))] mt-4">
            <h3 className="font-medium mb-3 text-sm text-[hsl(var(--foreground))]">Compose & Send（模板外发）</h3>
            <div className="grid grid-cols-1 gap-3 mb-3">
              <select
                value={selectedContactId}
                onChange={e => {
                  const nextId = e.target.value
                  setSelectedContactId(nextId)
                  if (nextId) {
                    handleBindContactToTicket(nextId)
                  }
                }}
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              >
                <option value="">选择联系人（可选）</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}{contact.company ? ` / ${contact.company}` : ''}
                  </option>
                ))}
              </select>

              <select
                value={selectedTargetId}
                onChange={e => {
                  const nextTargetId = e.target.value
                  setSelectedTargetId(nextTargetId)
                  const target = selectedContact?.contactTargets.find(item => item.commsTargetId === nextTargetId)?.commsTarget
                  if (target) {
                    setOutboundDraft(prev => ({ ...prev, channel: target.channel, to: target.to }))
                  }
                }}
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              >
                <option value="">选择联系人目标（可选）</option>
                {(selectedContact?.contactTargets || []).map(target => (
                  <option key={target.id} value={target.commsTargetId}>
                    {target.displayName} / {target.channel} / {target.toMasked}
                  </option>
                ))}
              </select>

              <select
                value={selectedTemplateId}
                onChange={e => {
                  setSelectedTemplateId(e.target.value)
                  setTemplateVariables({})
                }}
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              >
                <option value="">选择模板</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} / {template.scenario}
                  </option>
                ))}
              </select>

              {selectedTemplate && (
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(selectedTemplate.variablesSchema?.properties || {}).map(([key, schema]) => (
                    <input
                      key={key}
                      value={templateVariables[key] || ''}
                      onChange={e => setTemplateVariables(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={schema.title || key}
                      className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
                    />
                  ))}
                </div>
              )}

              <button
                onClick={handleRenderTemplateDraft}
                disabled={!selectedTemplateId}
                className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
              >
                生成草稿（DRAFT）
              </button>

              {composePreview && (
                <div className="p-3 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">模板预览</p>
                  <p className="text-sm font-medium mb-2">主题：{composePreview.subject || '（无）'}</p>
                  <p className="text-sm whitespace-pre-wrap">{composePreview.body}</p>
                </div>
              )}

              <select
                value={outboundDraft.channel}
                onChange={e => setOutboundDraft(prev => ({ ...prev, channel: e.target.value }))}
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              >
                <option value="slack">slack</option>
                <option value="telegram">telegram</option>
                <option value="discord">discord</option>
                <option value="msteams">msteams</option>
                <option value="signal">signal</option>
                <option value="whatsapp">whatsapp</option>
                <option value="imessage">imessage</option>
              </select>
              <input
                value={outboundDraft.to}
                onChange={e => setOutboundDraft(prev => ({ ...prev, to: e.target.value }))}
                placeholder="收件人 / 频道 ID"
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              />
              <input
                value={outboundDraft.subject}
                onChange={e => setOutboundDraft(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="主题（可选）"
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              />
              <textarea
                value={outboundDraft.body}
                onChange={e => setOutboundDraft(prev => ({ ...prev, body: e.target.value }))}
                placeholder="外发正文（支持 Markdown）"
                rows={6}
                className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
              />
            </div>
            <button
              onClick={handleSendOutboundDraft}
              disabled={sendingOutbound || !outboundDraft.to.trim() || !outboundDraft.body.trim()}
              className="w-full px-4 py-2 bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
            >
              {sendingOutbound ? '提交中...' : '发送（创建审批）'}
            </button>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">仅 allowlist 目标允许发送；发送会创建 SEND_EXTERNAL 审批。</p>
          </div>
        </SectionCard>
        {/* 审批记录 */}
        <SectionCard title="审批记录">
          <div className="space-y-3">
            {ticket.approvals?.map(approval => (
              <div key={approval.id} className="p-4 border border-[hsl(var(--border))] rounded-workshop-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{approval.actionType}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${getApprovalBadge(approval.status)}`}>
                    {approval.status}
                  </span>
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
                  {new Date(approval.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            ))}
            {(!ticket.approvals || ticket.approvals.length === 0) && (
              <p className="text-[hsl(var(--muted-foreground))] text-sm">暂无审批记录</p>
            )}
          </div>
        </SectionCard>
        {/* Pipeline 面板 */}
        {pipelineState && (
          <SectionCard title="Pipeline 流程">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    当前步骤：{pipelineState.currentStepOrder}/{pipelineState.pipeline.steps.length} - {pipelineState.pipeline.steps.find(s => s.order === pipelineState.currentStepOrder)?.roleName}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    Pipeline: {pipelineState.pipeline.name}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${getPipelineStatusBadge(pipelineState.status)}`}>
                  {pipelineState.status}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdvancePipeline}
                  disabled={pipelineState.status !== 'RUNNING'}
                  className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
                >
                  推进到下一步
                </button>
                <button
                  onClick={handleRollbackPipeline}
                  disabled={pipelineState.currentStepOrder <= 1}
                  className="px-4 py-2 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50"
                >
                  回退到上一步
                </button>
              </div>
            </div>
          </SectionCard>
        )}
        {/* Jobs 列表 */}
        <SectionCard title="Jobs 执行记录">
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="p-4 border border-[hsl(var(--border))] rounded-workshop-md">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{job.type}</span>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      {new Date(job.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${getJobStatusBadge(job.status)}`}>
                    {job.status}
                  </span>
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
                      <pre className="mt-2 p-2 bg-[hsl(var(--muted))] rounded text-xs overflow-x-auto">
                        {job.logs}
                      </pre>
                    )}
                  </div>
                )}
                {job.status === 'FAILED' && (
                  <button
                    onClick={() => handleRetryJob(job.id)}
                    className="mt-2 px-3 py-1 text-xs bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] rounded-workshop-md hover:opacity-90"
                  >
                    重试
                  </button>
                )}
              </div>
            ))}
            {jobs.length === 0 && (
              <p className="text-[hsl(var(--muted-foreground))] text-sm">暂无 Job 记录</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
