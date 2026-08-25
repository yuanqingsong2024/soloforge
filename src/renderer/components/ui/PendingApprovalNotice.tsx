interface PendingApprovalNoticeProps {
  title: string
  description: string
  primaryActionLabel: string
  secondaryActionLabel: string
  onPrimaryAction: () => void
  onSecondaryAction: () => void
  className?: string
}

export function PendingApprovalNotice({
  title,
  description,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  className = ''
}: PendingApprovalNoticeProps) {
  return (
    <div className={`rounded-lg border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.14)] p-4 shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-xs font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            {primaryActionLabel}
          </button>
          <button
            type="button"
            onClick={onSecondaryAction}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
          >
            {secondaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
