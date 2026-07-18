import React, { forwardRef } from 'react'

// 统一表单字段的基础视觉：边框、背景、前景色与焦点态都从这里继承。
const baseFieldClassName =
  'w-full rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]'

// Checkbox 单独维护一套更轻的视觉，避免复用文本输入的体积和 ring。
const baseCheckboxClassName =
  'h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--google-blue)_/_0.18)]'

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

// 只做最小 className 拼接，避免引入额外依赖。
function mergeClassName(baseClassName: string, className?: string): string {
  return className ? `${baseClassName} ${className}` : baseClassName
}

// 统一字段尺寸档位，页面不要再手写 px/py/text 组合。
function getFieldSizeClassName(size: ThemeFieldSize): string {
  switch (size) {
    case 'sm':
      return 'px-3 py-2 text-xs'
    case 'lg':
      return 'px-4 py-2.5 text-sm'
    case 'md':
    default:
      return 'px-3 py-2 text-sm'
  }
}

// tone 只负责交互强调，不负责尺寸和外形。
function getFieldToneClassName(tone: ThemeFieldTone): string {
  switch (tone) {
    case 'primary':
      return 'hover:border-[hsl(var(--primary))] focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))] focus:ring-offset-1'
    case 'default':
    default:
      return 'focus:border-[hsl(var(--google-blue)_/_0.35)] focus:ring-[hsl(var(--google-blue)_/_0.14)]'
  }
}

// shape 负责字段外轮廓，覆盖默认圆角、胶囊形和更柔和的大圆角文本域场景。
function getFieldShapeClassName(shape: ThemeFieldShape): string {
  switch (shape) {
    case 'pill':
      return 'rounded-full'
    case 'soft':
      return 'rounded-workshop-lg'
    case 'default':
    default:
      return 'rounded-workshop-md'
  }
}

// code 变体专门给 JSON / 配置类文本域使用，统一等宽字体和更紧凑字号。
function getTextareaVariantClassName(variant: ThemeTextareaVariant): string {
  switch (variant) {
    case 'code':
      return 'font-mono text-xs'
    case 'default':
    default:
      return ''
  }
}

// 通用单行输入：尺寸、交互、外形都通过语义参数控制，页面只保留布局类。
export const ThemeInput = forwardRef<HTMLInputElement, ThemeInputProps>(function ThemeInput(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <input ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)}`, className)} {...props} />
})

// Select 与 Input 共用同一套视觉系统，只额外补上下拉箭头空间。
export const ThemeSelect = forwardRef<HTMLSelectElement, ThemeSelectComponentProps>(function ThemeSelect(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <select ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)} appearance-none pr-10`, className)} {...props} />
})

// Textarea 在基础字段之上叠加 code 语义变体，避免页面重复写 font-mono/text-xs。
export const ThemeTextarea = forwardRef<HTMLTextAreaElement, ThemeTextareaComponentProps>(function ThemeTextarea(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', variant = 'default', ...props },
  ref
) {
  return <textarea ref={ref} className={mergeClassName(`${baseFieldClassName} ${getFieldSizeClassName(fieldSize)} ${getFieldToneClassName(fieldTone)} ${getFieldShapeClassName(fieldShape)} ${getTextareaVariantClassName(variant)}`.trim(), className)} {...props} />
})

// Checkbox 保持原生行为，只统一主题色与焦点表现。
export const ThemeCheckbox = forwardRef<HTMLInputElement, ThemeFieldProps>(function ThemeCheckbox(
  { className = '', ...props },
  ref
) {
  return <input ref={ref} type="checkbox" className={mergeClassName(baseCheckboxClassName, className)} {...props} />
})

// NumberInput 只是 ThemeInput 的语义别名，避免页面重复传 type="number"。
export const ThemeNumberInput = forwardRef<HTMLInputElement, ThemeInputProps>(function ThemeNumberInput(
  { className = '', fieldSize = 'md', fieldTone = 'default', fieldShape = 'default', ...props },
  ref
) {
  return <ThemeInput ref={ref} type="number" fieldSize={fieldSize} fieldTone={fieldTone} fieldShape={fieldShape} className={className} {...props} />
})

// 预留给需要单独使用箭头背景的场景，目前 ThemeSelect 内部已经默认带上。
export function themeSelectArrowClassName(): string {
  return 'appearance-none bg-[image:linear-gradient(45deg,transparent_50%,hsl(var(--muted-foreground))_50%),linear-gradient(135deg,hsl(var(--muted-foreground))_50%,transparent_50%)] bg-[position:calc(100%-1.1rem)_calc(50%-2px),calc(100%-0.8rem)_calc(50%-2px)] bg-[size:0.45rem_0.45rem,0.45rem_0.45rem] bg-no-repeat pr-10'
}

// 表单组合容器：统一字段垂直节奏，不参与具体输入视觉。
export function FormField({ children, className = '' }: FormFieldProps) {
  return <div className={mergeClassName('space-y-1.5', className)}>{children}</div>
}

// Label / Hint / Error 统一文本层级，避免页面重复写同一套字号和颜色。
export function FormLabel({ children, className = '', ...props }: FormLabelProps) {
  return <label className={mergeClassName('block text-sm font-medium text-[hsl(var(--foreground))]', className)} {...props}>{children}</label>
}

export function FormHint({ children, className = '' }: FormHintProps) {
  return <p className={mergeClassName('text-xs text-[hsl(var(--muted-foreground))]', className)}>{children}</p>
}

export function FormError({ children }: FormErrorProps) {
  return <p className="text-xs text-[hsl(var(--destructive))]">{children}</p>
}
