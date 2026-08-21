// ============================================
// SoloForge Backup/Import Export Wizard
// 备份导入导出向导
// ============================================

import { useState, useCallback, useMemo } from 'react'
import { Wizard, FileUpload, ProgressBar, PreviewTable } from '../components/ui/Wizard'
import { ThemeCheckbox } from '../components/ui/FormFields'
import { Button } from '../components/ui'
import { apiFetch, ApiResponse } from '../lib/api'
import { useTranslation } from 'react-i18next'
import { readWorkspaceId } from '../lib/storage'

interface BackupPack {
  version: string
  workspaceId: string
  workspaceName: string
  exportedAt: string
  exportedBy: string
  config: {
    desired?: unknown
    actual?: unknown
  }
  changeRequests?: unknown[]
  metadata: {
    hash: string
    itemCount: number
  }
}

interface ImportResult {
  success: boolean
  workspaceId?: string
  errors: string[]
  warnings: string[]
  credentialsNeeded: string[]
}

// 导出向导步骤
const EXPORT_STEPS = [
  { id: 'options', title: '选择选项', description: '选择导出内容' },
  { id: 'preview', title: '预览确认', description: '确认导出数据' },
  { id: 'download', title: '下载备份', description: '下载备份文件' },
]

// 导入向导步骤
const IMPORT_STEPS = [
  { id: 'upload', title: '上传文件', description: '上传备份文件' },
  { id: 'preview', title: '预览数据', description: '预览导入内容' },
  { id: 'configure', title: '配置导入', description: '配置导入选项' },
  { id: 'importing', title: '正在导入', description: '执行导入' },
]

/**
 * 导出向导
 */
export function ExportWizard({ onComplete: _onComplete }: { onComplete?: () => void }) {
  const { t } = useTranslation()
  const workspaceId = readWorkspaceId()

  const [currentStep, setCurrentStep] = useState(0)
  const [includeChangeRequests, setIncludeChangeRequests] = useState(true)
  const [includeSnapshots, setIncludeSnapshots] = useState(true)
  const [exportedPack, setExportedPack] = useState<BackupPack | null>(null)
  const [loading, setLoading] = useState(false)

  const handleExport = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiFetch<ApiResponse<BackupPack>>('/api/backup/export', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          exportedBy: 'admin',
          includeChangeRequests,
          includeSnapshots
        })
      })
      if (!result.success) {
        throw new Error(result.error)
      }
      setExportedPack(result.data || null)
      setCurrentStep(2) // 跳转到下载步骤
    } catch (error) {
      console.error('Export failed:', error)
      alert(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, includeChangeRequests, includeSnapshots])

  const handleCopyToClipboard = useCallback(async () => {
    if (exportedPack) {
      await navigator.clipboard.writeText(JSON.stringify(exportedPack, null, 2))
      alert('已复制到剪贴板')
    }
  }, [exportedPack])

  const handleDownload = useCallback(() => {
    if (exportedPack) {
      const blob = new Blob([JSON.stringify(exportedPack, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${exportedPack.workspaceName}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [exportedPack])

  const renderStep = () => {
    switch (currentStep) {
      case 0: // 选择选项
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('backup:wizard.exportOptions')}</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                选择要包含在备份中的数据
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] cursor-pointer">
                <ThemeCheckbox
                  checked={includeChangeRequests}
                  onChange={(e) => setIncludeChangeRequests(e.target.checked)}
                />
                <div>
                  <div className="font-medium">包含变更单历史</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    包含所有变更请求记录和审批历史
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] cursor-pointer">
                <ThemeCheckbox
                  checked={includeSnapshots}
                  onChange={(e) => setIncludeSnapshots(e.target.checked)}
                />
                <div>
                  <div className="font-medium">包含最新快照</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    包含 DESIRED 和 ACTUAL 配置快照
                  </div>
                </div>
              </label>
            </div>
          </div>
        )

      case 1: // 预览确认
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">确认导出</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                确认以下选项后点击"开始导出"
              </p>
            </div>

            <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Workspace ID:</span>
                <span className="font-mono text-sm">{workspaceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">包含变更单:</span>
                <span>{includeChangeRequests ? '是' : '否'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">包含快照:</span>
                <span>{includeSnapshots ? '是' : '否'}</span>
              </div>
            </div>
          </div>
        )

      case 2: // 下载备份
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-[hsl(var(--success)_/_0.15)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[hsl(var(--success))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">导出成功</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                备份包已生成，共 {exportedPack?.metadata.itemCount} 条记录
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={handleCopyToClipboard}>
                复制到剪贴板
              </Button>
              <Button onClick={handleDownload}>
                下载备份文件
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Wizard
      steps={EXPORT_STEPS}
      currentStep={currentStep}
      nextLabel="下一步"
      backLabel="上一步"
      completeLabel="开始导出"
      nextDisabled={currentStep === 1}
      loading={loading}
      onNext={currentStep === 1 ? handleExport : undefined}
      onComplete={currentStep === 1 ? handleExport : undefined}
    >
      {renderStep()}
    </Wizard>
  )
}

/**
 * 导入向导
 */
export function ImportWizard({ onComplete }: { onComplete?: () => void }) {
  const { t } = useTranslation()

  const [currentStep, setCurrentStep] = useState(0)
  const [importData, setImportData] = useState<BackupPack | null>(null)
  const [createNewWorkspace, setCreateNewWorkspace] = useState(true)
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        setImportData(data)
      } catch {
        alert('无效的 JSON 文件')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleImport = useCallback(async () => {
    if (!importData) return

    setLoading(true)
    setProgress(0)
    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 10, 90))
      }, 500)

      const result = await apiFetch<ApiResponse<ImportResult>>('/api/backup/import', {
        method: 'POST',
        body: JSON.stringify({
          backupPack: importData,
          importedBy: 'admin',
          createNewWorkspace,
          targetWorkspaceId: createNewWorkspace ? undefined : targetWorkspaceId || undefined
        })
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!result.success) {
        throw new Error(result.error)
      }
      setImportResult(result.data || null)
      setCurrentStep(3) // 跳转到完成步骤
    } catch (error) {
      console.error('Import failed:', error)
      alert(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [importData, createNewWorkspace, targetWorkspaceId])

  const previewData = useMemo(() => {
    if (!importData) return []
    return [
      { key: 'workspaceName', value: importData.workspaceName },
      { key: 'exportedAt', value: importData.exportedAt },
      { key: 'exportedBy', value: importData.exportedBy },
      { key: 'itemCount', value: importData.metadata.itemCount },
      { key: 'version', value: importData.version },
    ]
  }, [importData])

  const renderStep = () => {
    switch (currentStep) {
      case 0: // 上传文件
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('backup:wizard.uploadBackup')}</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                上传之前导出的备份 JSON 文件
              </p>
            </div>

            <FileUpload
              accept=".json"
              onFileSelect={handleFileSelect}
              label="选择备份文件"
            />
          </div>
        )

      case 1: // 预览数据
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">预览备份数据</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                确认备份文件内容
              </p>
            </div>

            {importData && (
              <PreviewTable
                data={previewData}
                columns={[
                  { key: 'key', label: '属性' },
                  { key: 'value', label: '值' }
                ]}
              />
            )}
          </div>
        )

      case 2: // 配置导入
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('backup:wizard.configureImport')}</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                配置导入选项
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] cursor-pointer">
                <ThemeCheckbox
                  checked={createNewWorkspace}
                  onChange={(e) => setCreateNewWorkspace(e.target.checked)}
                />
                <div>
                  <div className="font-medium">导入为新 Workspace</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    推荐：创建新的 Workspace，不会影响现有数据
                  </div>
                </div>
              </label>

              {!createNewWorkspace && (
                <div className="p-4 rounded-lg border border-[hsl(var(--border))]">
                  <label className="block text-sm font-medium mb-2">目标 Workspace ID</label>
                  <input
                    type="text"
                    value={targetWorkspaceId}
                    onChange={(e) => setTargetWorkspaceId(e.target.value)}
                    placeholder="输入现有 Workspace ID"
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
                  />
                </div>
              )}

              <div className="p-4 rounded-lg border border-[hsl(var(--google-yellow)_/_0.3)] bg-[hsl(var(--google-yellow)_/_0.1)]">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[hsl(var(--google-yellow))] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-sm">
                    <div className="font-medium">注意</div>
                    <div className="text-[hsl(var(--muted-foreground))]">
                      导入后如提示缺少凭证，请到连接设置页面重新填写
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 3: // 正在导入/完成
        return (
          <div className="space-y-6">
            {loading ? (
              <>
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">正在导入...</h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    请耐心等待，不要关闭页面
                  </p>
                </div>
                <ProgressBar progress={progress} label="导入进度" />
              </>
            ) : importResult ? (
              <>
                <div className="text-center">
                  <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                    importResult.success
                      ? 'bg-[hsl(var(--success)_/_0.15)]'
                      : 'bg-[hsl(var(--destructive)_/_0.15)]'
                  }`}>
                    {importResult.success ? (
                      <svg className="w-8 h-8 text-[hsl(var(--success))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-[hsl(var(--destructive))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {importResult.success ? '导入成功' : '导入失败'}
                  </h3>
                </div>

                {importResult.workspaceId && (
                  <div className="p-4 rounded-lg border border-[hsl(var(--border))]">
                    <div className="text-sm">
                      <div className="text-[hsl(var(--muted-foreground))]">新 Workspace ID:</div>
                      <div className="font-mono mt-1">{importResult.workspaceId}</div>
                    </div>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="p-4 rounded-lg border border-[hsl(var(--google-yellow)_/_0.3)] bg-[hsl(var(--google-yellow)_/_0.1)]">
                    <div className="text-sm font-medium mb-2">警告</div>
                    <ul className="text-sm space-y-1">
                      {importResult.warnings.map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.credentialsNeeded.length > 0 && (
                  <div className="p-4 rounded-lg border border-[hsl(var(--google-red)_/_0.3)] bg-[hsl(var(--google-red)_/_0.1)]">
                    <div className="text-sm font-medium mb-2">需要重新填写凭证</div>
                    <ul className="text-sm space-y-1">
                      {importResult.credentialsNeeded.map((c, i) => (
                        <li key={i}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-center gap-3">
                  <Button variant="secondary" onClick={onComplete}>
                    返回列表
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Wizard
      steps={IMPORT_STEPS}
      currentStep={currentStep}
      nextLabel="下一步"
      backLabel="上一步"
      completeLabel="开始导入"
      nextDisabled={currentStep === 0 && !importData || currentStep === 2}
      loading={loading}
      onNext={currentStep === 2 ? handleImport : undefined}
      onComplete={currentStep === 2 ? handleImport : undefined}
    >
      {renderStep()}
    </Wizard>
  )
}
