import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

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

  const channels = Array.from(new Set(messages.map(item => item.channel)))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Outbound Message Center"
        description="管理草稿、审批中、已发送与失败重试消息"
      />

      <SectionCard className="mb-6">
        <div className="flex gap-2 flex-wrap items-center">
          {(['all', 'DRAFT', 'PENDING_APPROVAL', 'SENDING', 'SENT', 'FAILED', 'CANCELED'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs rounded-workshop-md ${statusFilter === status ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}
            >
              {status === 'all' ? '全部' : status}
            </button>
          ))}

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--background))] border border-[hsl(var(--border))]"
          >
            <option value="all">全部渠道</option>
            {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
          </select>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title={`草稿 (${grouped.DRAFT.length})`}>
          <div className="space-y-3">
            {grouped.DRAFT.map(message => (
              <MessageCard key={message.id} message={message} onSend={handleSend} />
            ))}
            {grouped.DRAFT.length === 0 && <EmptyTip text="暂无草稿消息" />}
          </div>
        </SectionCard>

        <SectionCard title={`待审批 (${grouped.PENDING_APPROVAL.length})`}>
          <div className="space-y-3">
            {grouped.PENDING_APPROVAL.map(message => (
              <MessageCard key={message.id} message={message} />
            ))}
            {grouped.PENDING_APPROVAL.length === 0 && <EmptyTip text="暂无待审批消息" />}
          </div>
        </SectionCard>

        <SectionCard title={`发送中 (${grouped.SENDING.length})`}>
          <div className="space-y-3">
            {grouped.SENDING.map(message => (
              <MessageCard key={message.id} message={message} />
            ))}
            {grouped.SENDING.length === 0 && <EmptyTip text="暂无发送中消息" />}
          </div>
        </SectionCard>

        <SectionCard title={`已发送 (${grouped.SENT.length})`}>
          <div className="space-y-3">
            {grouped.SENT.map(message => (
              <MessageCard key={message.id} message={message} />
            ))}
            {grouped.SENT.length === 0 && <EmptyTip text="暂无已发送消息" />}
          </div>
        </SectionCard>

        <SectionCard title={`失败 (${grouped.FAILED.length})`}>
          <div className="space-y-3">
            {grouped.FAILED.map(message => (
              <MessageCard key={message.id} message={message} onRetry={handleRetry} />
            ))}
            {grouped.FAILED.length === 0 && <EmptyTip text="暂无失败消息" />}
          </div>
        </SectionCard>

        <SectionCard title={`已取消 (${grouped.CANCELED.length})`}>
          <div className="space-y-3">
            {grouped.CANCELED.map(message => (
              <MessageCard key={message.id} message={message} />
            ))}
            {grouped.CANCELED.length === 0 && <EmptyTip text="暂无已取消消息" />}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function EmptyTip({ text }: { text: string }) {
  return <p className="text-sm text-[hsl(var(--muted-foreground))]">{text}</p>
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
  return (
    <div className="p-3 border border-[hsl(var(--border))] rounded-workshop-md">
      <div className="flex justify-between items-start mb-2 gap-2">
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {message.subject || '无主题'}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {message.channel} / {message.toMasked || message.to}
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-workshop-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
          {message.status}
        </span>
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
