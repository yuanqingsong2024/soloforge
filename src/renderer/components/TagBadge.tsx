interface TagBadgeProps {
  name: string
  color: string
  onRemove?: () => void
}

export function TagBadge({ name, color, onRemove }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded"
      style={{ backgroundColor: `${color}20`, color: color }}
    >
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:opacity-70 transition"
          aria-label={`移除标签 ${name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
