import { useTranslation } from 'react-i18next'
import { Button } from './Button'

// ============================================
// SoloForge Design System - ErrorState 组件
// 统一错误状态展示
// ============================================

interface ErrorStateProps {
  title?: string
  message?: string
  error?: Error | string | null
  onRetry?: () => void
  onBack?: () => void
  className?: string
}

export function ErrorState({
  title,
  message,
  error,
  onRetry,
  onBack,
  className = '',
}: ErrorStateProps) {
  const { t } = useTranslation()

  // 从 error 对象提取消息
  const errorMessage = error instanceof Error
    ? error.message
    : error || message || t('common:error.default', '加载失败')

  const displayTitle = title || t('common:error.title', '出错了')
  const displayMessage = errorMessage

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {/* 错误图标 */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--destructive))]/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[hsl(var(--destructive))]"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* 标题 */}
      <h3 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
        {displayTitle}
      </h3>

      {/* 错误消息 */}
      <p className="mb-6 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
        {displayMessage}
      </p>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-1.5"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t('common:back', '返回')}
          </Button>
        )}
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-1.5"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            {t('common:retry', '重试')}
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================
// InlineErrorState - 内联错误状态
// 用于表单内或小区域内的错误展示
// ============================================

interface InlineErrorStateProps {
  message: string
  className?: string
}

export function InlineErrorState({ message, className = '' }: InlineErrorStateProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-[hsl(var(--destructive))] ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
