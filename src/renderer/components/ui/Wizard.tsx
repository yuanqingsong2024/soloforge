// ============================================
// SoloForge Import/Export Wizard Components
// 数据导入/导出向导组件
// ============================================

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from './index'
import { LiveRegion } from '../a11y'

interface WizardStep {
  id: string
  title: string
  description: string
}

interface WizardProps {
  steps: WizardStep[]
  currentStep: number
  children: ReactNode
  onNext?: () => void
  onBack?: () => void
  onComplete?: () => void
  nextLabel?: string
  backLabel?: string
  completeLabel?: string
  nextDisabled?: boolean
  loading?: boolean
}

/**
 * 步骤指示器
 */
function StepIndicator({ steps, currentStep }: { steps: WizardStep[]; currentStep: number }) {
  return (
    <nav aria-label="进度指示器" className="mb-6">
      <ol className="flex items-center justify-center gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep

          return (
            <li key={step.id} className="flex items-center">
              <div className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isCompleted
                      ? 'bg-[hsl(var(--success))] text-white'
                      : isCurrent
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isCurrent ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`mx-4 h-0.5 w-12 ${
                  isCompleted ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--muted))]'
                }`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * 向导容器
 */
export function Wizard({
  steps,
  currentStep,
  children,
  onNext,
  onBack,
  onComplete,
  nextLabel = '下一步',
  backLabel = '上一步',
  completeLabel = '完成',
  nextDisabled = false,
  loading = false
}: WizardProps) {
  const [statusMessage, setStatusMessage] = useState('')
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  const handleNext = () => {
    if (onNext) {
      setStatusMessage(`正在进入步骤 ${currentStep + 2}：${steps[currentStep + 1]?.title}`)
      onNext()
    }
  }

  const handleBack = () => {
    if (onBack) {
      setStatusMessage(`正在返回步骤 ${currentStep}：${steps[currentStep - 1]?.title}`)
      onBack()
    }
  }

  const handleComplete = () => {
    if (onComplete) {
      setStatusMessage('操作完成')
      onComplete()
    }
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
      <StepIndicator steps={steps} currentStep={currentStep} />

      <div className="mb-6 min-h-[300px]">
        {children}
      </div>

      {/* 实时状态区域 */}
      <LiveRegion politeness="polite">{statusMessage}</LiveRegion>

      {/* 导航按钮 */}
      <div className="flex justify-between border-t border-[hsl(var(--border))] pt-4">
        <Button
          variant="secondary"
          onClick={handleBack}
          disabled={isFirstStep || loading}
        >
          {backLabel}
        </Button>

        {isLastStep ? (
          <Button
            onClick={handleComplete}
            disabled={nextDisabled}
            loading={loading}
          >
            {completeLabel}
          </Button>
        ) : (
          <Button
            onClick={handleNext}
            disabled={nextDisabled}
            loading={loading}
          >
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * 文件上传组件
 */
interface FileUploadProps {
  accept?: string
  onFileSelect: (file: File) => void
  label?: string
  disabled?: boolean
}

export function FileUpload({ accept = '.json', onFileSelect, label = '选择文件', disabled = false }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.05)]'
          : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={label}
      />

      <div className="pointer-events-none">
        <svg className="mx-auto h-12 w-12 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        {selectedFile ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">{selectedFile.name}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[hsl(var(--foreground))]">
              拖拽文件到此处，或 <span className="text-[hsl(var(--primary))]">点击选择</span>
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              支持 {accept} 格式
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 进度条组件
 */
interface ProgressBarProps {
  progress: number // 0-100
  label?: string
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
          <span className="font-medium text-[hsl(var(--foreground))]">{clampedProgress}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <div
          className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

/**
 * 预览表格组件
 */
interface PreviewTableProps {
  data: Record<string, unknown>[]
  columns: { key: string; label: string }[]
  title?: string
}

export function PreviewTable({ data, columns, title }: PreviewTableProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无数据</p>
  }

  return (
    <div className="overflow-x-auto">
      {title && <h4 className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">{title}</h4>}
      <table className="w-full text-sm" role="grid">
        <thead>
          <tr className="border-b border-[hsl(var(--border))]">
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 5).map((row, index) => (
            <tr key={index} className="border-b border-[hsl(var(--border)_/_0.5)] hover:bg-[hsl(var(--muted)_/_0.3)]">
              {columns.map(col => (
                <td key={col.key} className="px-3 py-2 text-[hsl(var(--foreground))]">
                  {String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 5 && (
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          仅显示前 5 条，共 {data.length} 条记录
        </p>
      )}
    </div>
  )
}
