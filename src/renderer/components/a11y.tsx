// ============================================
// Accessibility Utilities
// 可访问性工具
// ============================================

import type { ReactNode } from 'react'

/**
 * 按钮可访问性属性
 */
export function buttonA11y(label: string): Record<string, string> {
  return {
    'aria-label': label,
  }
}

/**
 * 区域可访问性标签
 */
export function regionA11y(label: string): Record<string, string | number> {
  return {
    'aria-label': label,
    role: 'region',
  }
}

/**
 * 表单字段可访问性 ID 生成
 */
export function fieldId(label: string): string {
  return `field-${label.toLowerCase().replace(/\s+/g, '-')}`
}

/**
 * 列表可访问性
 */
export function listA11y(label: string, count?: number): Record<string, string | number> {
  const result: Record<string, string | number> = {
    'aria-label': label,
    role: 'list',
  }
  if (count !== undefined) {
    result['aria-listcount'] = count
  }
  return result
}

/**
 * 列表项可访问性
 */
export function listItemA11y(): Record<string, string> {
  return { role: 'listitem' }
}

/**
 * 加载状态可访问性
 */
export function loadingA11y(label: string): Record<string, string | boolean> {
  return {
    'aria-label': label,
    'aria-busy': true,
    'aria-live': 'polite',
  }
}

/**
 * 跳过链接
 */
export function SkipLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className="sr-only left-4 top-4 z-[100] rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-[hsl(var(--primary-foreground))] focus:absolute focus:not-sr-only focus:p-4"
    >
      {children}
    </a>
  )
}

/**
 * 视觉隐藏但屏幕阅读器可读
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  )
}

/**
 * 状态区域（用于动态内容更新）
 */
export function LiveRegion({ 
  children, 
  politeness = 'polite' 
}: { 
  children: ReactNode
  politeness?: 'polite' | 'assertive' 
}) {
  return (
    <div aria-live={politeness} className="sr-only">
      {children}
    </div>
  )
}
