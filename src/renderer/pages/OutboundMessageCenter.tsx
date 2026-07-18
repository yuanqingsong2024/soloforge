import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useTranslation } from 'react-i18next'
import { translateEnum } from '../lib/i18n-helpers'
import { getToneByStatus } from '../lib/status-badge'

interface OutboundMessage {
  id: string
  ticketId?: string
  artifactId?: string
  channel: string
  to: string
  toMasked?: string
  subject?: string
  body: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELED'
  traceId: string
  approvalId?: string
  templateId?: string
  providerMessageId?: string
  lastError?: string
  attempts: number
  nextRetryAt?: string
  createdAt: string
  lastSentAt?: string
}

export function OutboundMessageCenter() {
  const { t } = useTranslation(['common'])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [messages, setMessages] = useState<OutboundMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | OutboundMessage['status']>('all')
  const [channelFilter, setChannelFilter] = useState('all')

  useEffect(() => {
    getApiPort().then(async (port) => {
      setApiPort(port)
      await fetchMessages(port)
      setLoading(false)
    })
  }, [])

  const fetchMessages = async (port: number) => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (channelFilter !== 'all') params.set('channel', channelFilter)
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetch(`http://127.0.0.1:${port}/api/outbound-messages${query}`)
    const data = await response.json()
    setMessages(data)
  }

  useEffect(() => {
    if (!apiPort) return
    fetchMessages(apiPort)
  }, [statusFilter, channelFilter, apiPort])

  const handleSend = async (messageId: string) => {
    if (!apiPort) return

    const response = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages/${messageId}/send`, {
      method: 'POST'
    })
    const data = await response.json()

    if (data.status === 'blocked_allowlist') {
      alert(data.message)
    } else if (data.status === 'pending_approval') {
      alert(`已提交审批，审批 ID: ${data.approvalId}`)
    } else if (data.status === 'sent') {
      alert('消息发送成功')
    }

    await fetchMessages(apiPort)
  }

  const handleRetry = async (messageId: string) => {
    if (!apiPort) return

    const response = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages/${messageId}/retry`, {
      method: 'POST'
    })
    const data = await response.json()

    if (data.status === 'sent') {
      alert('重试发送成功')
    } else {
      alert(data.message || '重试未执行')
    }

    await fetchMessages(apiPort)
  }

  const grouped = {
    DRAFT: messages.filter(message => message.status === 'DRAFT'),
    PENDING_APPROVAL: messages.filter(message => message.status === 'PENDING_APPROVAL'),
    SENDING: messages.filter(message => message.status === 'SENDING'),
    SENT: messages.filter(message => message.status === 'SENT'),
    FAILED: messages.filter(message => message.status === 'FAILED'),
    CANCELED: messages.filter(message => message.status === 'CANCELED')
  }

  const sections: Array<{
    key: keyof typeof grouped
    title: string
    empty: string
    allowSend?: boolean
    allowRetry?: boolean
  }> = [
    { key: 'DRAFT', title: `草稿 (${grouped.DRAFT.length})`, empty: '暂无草稿消息', allowSend: true },
    { key: 'PENDING_APPROVAL', title: `待审批 (${grouped.PENDING_APPROVAL.length})`, empty: '暂无待审批消息' },
    { key: 'SENDING', title: `发送中 (${grouped.SENDING.length})`, empty: '暂无发送中消息' },
    { key: 'SENT', title: `已发送 (${grouped.SENT.length})`, empty: '暂无已发送消息' },
    { key: 'FAILED', title: `失败 (${grouped.FAILED.length})`, empty: '暂无失败消息', allowRetry: true },
    { key: 'CANCELED', title: `已取消 (${grouped.CANCELED.length})`, empty: '暂无已取消消息' }
  ] as const

  const channels = Array.from(new Set(messages.map(item => item.channel)))

  if (loading) {
    return <LoadingState message="加载外发消息中..." />
  }

  return (
    <div>
      <PageHeader
        title="外发消息中心"
        description="管理草稿、审批中、已发送与失败重试消息"
      />

      <SectionCard className="mb-6" testId="outbound-message-filters">
        <div className="flex gap-2 flex-wrap items-center">
          {(['all', 'DRAFT', 'PENDING_APPROVAL', 'SENDING', 'SENT', 'FAILED', 'CANCELED'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs rounded-workshop-md ${statusFilter === status ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}
            >
              {status === 'all' ? '全部' : translateEnum(t, 'outboundMessageStatusMap', status)}
            </button>
          ))}

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
          >
            <option value="all">全部渠道</option>
            {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
          </select>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {sections.map(section => {
          const messagesInSection = grouped[section.key]
          return (
            <SectionCard key={section.key} title={section.title} testId={`outbound-message-section-${section.key}`}>
              <div className="space-y-3">
                {messagesInSection.map(message => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    onSend={section.allowSend ? handleSend : undefined}
                    onRetry={section.allowRetry ? handleRetry : undefined}
                  />
                ))}
                {messagesInSection.length === 0 && <EmptyState message={section.empty} />}
              </div>
            </SectionCard>
          )
        })}
      </div>
    </div>
  )
}

function MessageCard({
  message,
  onSend,
  onRetry
}: {
  message: OutboundMessage
  onSend?: (id: string) => void
  onRetry?: (id: string) => void
}) {
  const { t } = useTranslation(['common'])
  return (
    <div data-testid={`message-card-${message.id}`} className="p-3 border border-[hsl(var(--border))] rounded-workshop-md">
      <div className="flex justify-between items-start mb-2 gap-2">
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {message.subject || '无主题'}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {message.channel} / {message.toMasked || message.to}
          </p>
        </div>
        <StatusBadge label={translateEnum(t, 'outboundMessageStatusMap', message.status)} tone={getToneByStatus(message.status, { APPROVED: 'success', SENT: 'success', FAILED: 'danger', CANCELED: 'danger', SENDING: 'info', PENDING_APPROVAL: 'warning' })} />
      </div>

      <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap mb-2">{message.body}</p>

      <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1">
        <p>trace_id: {message.traceId}</p>
        <p>创建时间: {new Date(message.createdAt).toLocaleString('zh-CN')}</p>
        {message.lastSentAt && <p>发送时间: {new Date(message.lastSentAt).toLocaleString('zh-CN')}</p>}
        <p>尝试次数: {message.attempts}</p>
        {message.nextRetryAt && <p>下次重试: {new Date(message.nextRetryAt).toLocaleString('zh-CN')}</p>}
        {message.approvalId && <p>approval_id: {message.approvalId}</p>}
        {message.providerMessageId && <p>provider_message_id: {message.providerMessageId}</p>}
        {message.lastError && <p className="text-[hsl(var(--destructive))]">错误: {message.lastError}</p>}
      </div>

      <div className="flex gap-2 mt-3">
        {onSend && message.status === 'DRAFT' && (
          <button
            onClick={() => onSend(message.id)}
            className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          >
            发送（走审批）
          </button>
        )}
        {onRetry && message.status === 'FAILED' && (
          <button
            onClick={() => onRetry(message.id)}
            className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]"
          >
            重试发送
          </button>
        )}
      </div>
    </div>
  )
}
