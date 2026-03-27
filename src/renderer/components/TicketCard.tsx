
interface Ticket {
  id: string
  title: string
  status: string
  priority: string
  assignee?: { name: string }
  tags?: TicketTag[]
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

interface Props {
  ticket: Ticket
  onClick?: () => void
  isDragging?: boolean
}

const PRIORITY_COLORS = {
  LOW: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]',
  MEDIUM: 'bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))] border border-[hsl(var(--google-blue)_/_0.16)]',
  HIGH: 'bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))] border border-[hsl(var(--google-yellow)_/_0.24)]',
  URGENT: 'bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))] border border-[hsl(var(--google-red)_/_0.16)]'
}

export function TicketCard({ ticket, onClick, isDragging }: Props) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-workshop-sm transition-all duration-200 hover:border-[hsl(var(--google-blue)_/_0.16)] hover:shadow-workshop-md ${
        isDragging ? 'rotate-3 scale-105' : ''
      }`}
    >
      <h3 className="mb-2 line-clamp-2 font-medium text-[hsl(var(--foreground))]">{ticket.title}</h3>
      {/* 标签显示 */}
      {ticket.tags && ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ticket.tags.map(tt => (
            <span
              key={tt.id}
              className="rounded-full border px-2 py-0.5 text-xs"
              style={{ backgroundColor: `${tt.tag.color}20`, color: tt.tag.color }}
            >
              {tt.tag.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM
          }`}
        >
          {ticket.priority}
        </span>
        {ticket.assignee && (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{ticket.assignee.name}</span>
        )}
      </div>
    </div>
  )
}
