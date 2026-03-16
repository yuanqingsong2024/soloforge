import { useEffect, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useNavigate } from 'react-router-dom'
import { SortableTicketCard } from '../components/SortableTicketCard'
import { getApiPort } from '../lib/api'
import { TicketCard } from '../components/TicketCard'
import { PageHeader } from '../components/ui/PageHeader'
const STATUSES = [
  { id: 'INBOX', label: '收件箱', color: 'bg-[hsl(var(--muted))]' },
  { id: 'SPEC', label: '需求分析', color: 'bg-[hsl(var(--info)/0.1)]' },
  { id: 'DEV', label: '开发中', color: 'bg-[hsl(var(--warning)/0.1)]' },
  { id: 'TEST', label: '测试中', color: 'bg-[hsl(var(--primary)/0.1)]' },
  { id: 'DELIVERY', label: '待交付', color: 'bg-[hsl(var(--success)/0.1)]' },
  { id: 'DONE', label: '已完成', color: 'bg-[hsl(var(--muted))]' }
]
interface Ticket {
  id: string
  title: string
  status: string
  priority: string
  assigneeAgentId?: string
  assignee?: { name: string }
  createdAt: string
}
export function TicketBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchTickets(port)
    })
  }, [])
  const fetchTickets = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/tickets`)
      const data = await response.json()
      setTickets(data)
    } catch (error) {
      console.error('Failed to fetch tickets:', error)
    } finally {
      setLoading(false)
    }
  }
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || !apiPort) return
    const ticketId = active.id as string
    const newStatus = over.id as string
    // 如果拖到同一列，不做处理
    const ticket = tickets.find(t => t.id === ticketId)
    if (ticket?.status === newStatus) return
    // 乐观更新
    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? { ...t, status: newStatus } : t))
    )
    // 更新服务器
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
    } catch (error) {
      console.error('Failed to update ticket:', error)
      // 回滚
      if (ticket) {
        setTickets(prev =>
          prev.map(t => (t.id === ticketId ? ticket : t))
        )
      }
    }
  }
  const handleCreateTicket = async () => {
    if (!apiPort) return
    const title = prompt('工单标题：')
    if (!title) return
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          source: 'manual',
          status: 'INBOX',
          priority: 'MEDIUM',
          customerMeta: '{}'
        })
      })
      const newTicket = await response.json()
      setTickets(prev => [...prev, newTicket])
    } catch (error) {
      console.error('Failed to create ticket:', error)
    }
  }
  const ticketsByStatus = STATUSES.reduce((acc, status) => {
    acc[status.id] = tickets.filter(t => t.status === status.id)
    return acc
  }, {} as Record<string, Ticket[]>)
  const activeTicket = activeId ? tickets.find(t => t.id === activeId) : null
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }
  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="工单看板"
        description="拖拽工单卡片以更新状态"
        actions={
          <button
            onClick={handleCreateTicket}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                     rounded-workshop-md hover:opacity-90 transition-opacity
                     font-medium text-sm shadow-workshop-sm"
          >
            + 新建工单
          </button>
        }
      />
      <DndContext
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="grid grid-cols-6 gap-4 min-w-max pb-6">
            {STATUSES.map(status => (
              <SortableContext
                key={status.id}
                id={status.id}
                items={ticketsByStatus[status.id]?.map(t => t.id) || []}
                strategy={verticalListSortingStrategy}
              >
                <div className={`${status.color} rounded-workshop-md p-4 min-h-[500px] w-64
                               border border-[hsl(var(--border))]`}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-semibold text-[hsl(var(--foreground))]">{status.label}</h2>
                    <span className="text-sm text-[hsl(var(--muted-foreground))] font-mono">
                      {ticketsByStatus[status.id]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ticketsByStatus[status.id]?.map(ticket => (
                      <SortableTicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                      />
                    ))}
                  </div>
                </div>
              </SortableContext>
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeTicket ? <TicketCard ticket={activeTicket} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
