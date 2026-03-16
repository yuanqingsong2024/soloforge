
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
  LOW: 'bg-gray-200 text-gray-700',
  MEDIUM: 'bg-blue-200 text-blue-700',
  HIGH: 'bg-orange-200 text-orange-700',
  URGENT: 'bg-red-200 text-red-700'
}

export function TicketCard({ ticket, onClick, isDragging }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-md transition ${
        isDragging ? 'rotate-3 scale-105' : ''
      }`}
    >
      <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{ticket.title}</h3>
      {/* 标签显示 */}
      {ticket.tags && ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ticket.tags.map(tt => (
            <span
              key={tt.id}
              className="text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: `${tt.tag.color}20`, color: tt.tag.color }}
            >
              {tt.tag.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM
          }`}
        >
          {ticket.priority}
        </span>
        {ticket.assignee && (
          <span className="text-xs text-gray-500">{ticket.assignee.name}</span>
        )}
      </div>
    </div>
  )
}
