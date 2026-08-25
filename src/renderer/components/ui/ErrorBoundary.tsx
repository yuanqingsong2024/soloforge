import React, { Component, ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

// ============================================
// SoloForge Design System - ErrorBoundary 组件
// 全局错误边界，防止页面崩溃导致白屏
// ============================================

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// Class Component 版本（ErrorBoundary 必须是 class）
class ErrorBoundaryComponent extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  handleGoHome = (): void => {
    window.location.hash = '#/'
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} onGoHome={this.handleGoHome} />
    }

    return this.props.children
  }
}

// 错误降级展示组件
function ErrorFallback({ error, onRetry, onGoHome }: { error: Error | null; onRetry: () => void; onGoHome: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center px-4 py-12 text-center">
      {/* 错误图标 */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--destructive))]/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[hsl(var(--destructive))]"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </div>

      {/* 标题 */}
      <h2 className="mb-3 text-xl font-bold text-[hsl(var(--foreground))]">
        {t('common:error.somethingWrong', '页面发生错误')}
      </h2>

      {/* 描述 */}
      <p className="mb-2 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
        {t('common:error.description', '抱歉，页面加载时遇到了问题。请尝试刷新或返回首页。')}
      </p>

      {/* 错误详情（开发环境显示） */}
      {import.meta.env.DEV && error && (
        <div className="mb-6 max-w-2xl overflow-auto rounded-lg bg-[hsl(var(--muted))] p-4 text-left">
          <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
            Error Details (Development Only)
          </p>
          <pre className="whitespace-pre-wrap text-xs text-[hsl(var(--destructive))]">
            {error.name}: {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onGoHome}>
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
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {t('common:goHome', '返回首页')}
        </Button>
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
      </div>
    </div>
  )
}

// 导出的 ErrorBoundary 组件
export const ErrorBoundary = React.memo(ErrorBoundaryComponent)

// ============================================
// withErrorBoundary HOC
// 用于包装组件添加错误边界
// ============================================

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`

  return WrappedComponent
}
