import React, { forwardRef } from 'react'

// ============================================
// SoloForge Design System - Form Fields V2
// 统一表单字段的基础视觉
// ============================================

// 统一表单字段的基础样式：边框、背景、前景色与焦点态
const baseFieldClassName =
  'w-full rounded-xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--background))]/80 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.6)] shadow-[var(--shadow-sm)] transition-all duration-200 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-0 focus:bg-[hsl(var(--background))] focus:shadow-[var(--shadow-soft)]'

// Checkbox 单独维护一套更轻的视觉
const baseCheckboxClassName =
  'h-4 w-4 rounded-lg border-[hsl(var(--border)/0.6)] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:ring-offset-2 focus:ring-offset-[hsl(var(--background))]'

type ThemeFieldProps = React.InputHTMLAttributes<HTMLInputElement>
type ThemeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>
type ThemeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>
type ThemeFieldSize = 'sm' | 'md' | 'lg'
type ThemeTextareaVariant = 'default' | 'code'
type ThemeFieldTone = 'default' | 'primary'
type ThemeFieldShape = 'default' | 'pill' | 'soft'

interface ThemeFieldBaseProps {
  fieldSize?: ThemeFieldSize
  fieldTone?: ThemeFieldTone
  fieldShape?: ThemeFieldShape
  className?: string
}

interface ThemeTextareaBaseProps extends ThemeFieldBaseProps {
  variant?: ThemeTextareaVariant
}

type ThemeInputProps = ThemeFieldProps & ThemeFieldBaseProps
type ThemeTextareaComponentProps = ThemeTextareaProps & ThemeTextareaBaseProps
type ThemeSelectComponentProps = ThemeSelectProps & ThemeFieldBaseProps

interface FormFieldProps {
  children: React.ReactNode
  className?: string
}

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode
}

interface FormHintProps {
  children: React.ReactNode
  className?: string
}

interface FormErrorProps {
  children: React.ReactNode
}

// 合并 className
function mergeClassName(baseClassName: string, className?: string): string {
  return className ? `${baseClassName} ${className}` : baseClassName
}

// 统一字段尺寸档位
function getFieldSizeClassName(size: ThemeFieldSize): string {
  switch (size) {
    case 'sm':
      return 'px-3 py-2 text-xs'
    case 'lg':
      return 'px-4 py-3 text-base'
    case 'md':
    default:
      return 'px-4 py-2.5 text-sm'
  }
}

// tone 只负责交互强调
function getFieldToneClassName(tone: ThemeFieldTone): string {
  switch (tone) {
    case 'primary':
      return 'hover:border-[hsl(var(--primary))] focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.15)]'
    case 'default':
    default:
      return 'focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.1)]'
  }
}

// shape 负责字段外轮廓
function getFieldShapeClassName(shape: ThemeFieldShape): string {
  switch (shape) {
    case 'pill':
      return 'rounded-full'
    case 'soft':
      return 'rounded-2xl'
    case 'default':
    default:
      return 'rounded-xl'
  }
}

// code 变体专门给 JSON / 配置类文本域使用
function getTextareaVariantClassName(variant: ThemeTextareaVariant): string {
  switch (variant) {
    case 'code':
      return 'font-mono text-xs'
    case 'default':
    default:
      return ''
  }
}

// ============================================
// 导出组件
// ============================================

// 通用单行输入
export const ThemeInput = forwardRef<HTMLInputElement, ThemeInputProps>(function ThemeInput(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <input ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)}`, className)} {...props} />
})

// Select 下拉选择
export const ThemeSelect = forwardRef<HTMLSelectElement, ThemeSelectComponentProps>(function ThemeSelect(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <select ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)} appearance-none pr-10`, className)} {...props} />
})

// Textarea 多行文本
export const ThemeTextarea = forwardRef<HTMLTextAreaElement, ThemeTextareaComponentProps>(function ThemeTextarea(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', variant = 'default', ...props },
  ref
) {
  return <textarea ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)} ${getTextareaVariantClassName(variant)}`.trim(), className)} {...props} />
})

// Checkbox 复选框
export const ThemeCheckbox = forwardRef<HTMLInputElement, ThemeFieldProps>(function ThemeCheckbox(
  { className = '', ...props },
  ref
) {
  return <input ref={ref} type="checkbox" className={mergeClassName(baseCheckboxClassName, className)} {...props} />
})

// NumberInput 数字输入
export const ThemeNumberInput = forwardRef<HTMLInputElement, ThemeInputProps>(function ThemeNumberInput(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <ThemeInput ref={ref} type="number" fieldSize={fieldSize} fieldTone={fieldTone} fieldShape={fieldShape} className={className} {...props} />
})

// Select 下拉箭头样式
export function themeSelectArrowClassName(): string {
  return 'appearance-none bg-[image:linear-gradient(45deg,transparent_50%,hsl(var(--muted-foreground))_50%),linear-gradient(135deg,hsl(var(--muted-foreground))_50%,transparent_50%)] bg-[position:calc(100%-1.1rem)_calc(50%-2px),calc(100%-0.8rem)_calc(50%-2px)] bg-[size:0.45rem_0.45rem,0.45rem_0.45rem] bg-no-repeat pr-10'
}

// ============================================
// 表单辅助组件
// ============================================

// 表单组合容器
export function FormField({ children, className = '' }: FormFieldProps) {
  return <div className={mergeClassName('space-y-1.5', className)}>{children}</div>
}

// Label 标签
export function FormLabel({ children, className = '', ...props }: FormLabelProps) {
  return <label className={mergeClassName('flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]', className)} {...props}>{children}</label>
}

// Hint 提示文字
export function FormHint({ children, className = '' }: FormHintProps) {
  return <p className={mergeClassName('text-xs text-[hsl(var(--muted-foreground))]', className)}>{children}</p>
}

// Error 错误提示
export function FormError({ children }: FormErrorProps) {
  return <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--destructive))]">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="m15 9-6 6"/>
      <path d="m9 9 6 6"/>
    </svg>
    {children}
  </p>
}
