interface EmptyStateProps {
  message: string
  className?: string
  tone?: 'default' | 'danger'
}

export function EmptyState({ message, className = '', tone = 'default' }: EmptyStateProps) {
  return (
    <div className={`rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] px-6 py-10 text-center text-sm shadow-workshop-sm ${tone === 'danger' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'} ${className}`}>
      {message}
    </div>
  )
}
