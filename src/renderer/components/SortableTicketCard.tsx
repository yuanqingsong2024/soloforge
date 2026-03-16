import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TicketCard } from './TicketCard'

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
}

export function SortableTicketCard({ ticket, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: ticket.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard ticket={ticket} onClick={onClick} />
    </div>
  )
}
