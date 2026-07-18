interface LoadingStateProps {
  message?: string
  className?: string
}

export function LoadingState({ message = '加载中...', className = '' }: LoadingStateProps) {
  return (
    <div className={`flex min-h-[16rem] items-center justify-center rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm ${className}`}>
      <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <span>{message}</span>
      </div>
    </div>
  )
}
