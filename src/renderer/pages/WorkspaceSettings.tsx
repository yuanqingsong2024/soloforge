import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { apiFetch } from '../lib/api'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ThemeCheckbox, ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

interface Workspace {
  id: string
  name: string
  description: string
  envType: string
  isReadOnlyDefault: boolean
  unlockUntil: string | null
  createdAt: string
  updatedAt: string
}

interface ActionResult {
  success?: boolean
  status?: string
  approvalId?: string
  message?: string
  error?: string
}

function getActionErrorMessage(result: ActionResult, fallback: string) {
  return result.error || result.message || fallback
}

export function WorkspaceSettings() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表单状态
  const [envType, setEnvType] = useState<'DEV' | 'STAGING' | 'PROD'>('DEV')
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [unlockDuration, setUnlockDuration] = useState<15 | 30 | 60>(15)
  const actionButtonClass = 'inline-flex w-full shrink-0 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-opacity disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[5.5rem]'
  const actionRowClass = 'flex flex-col gap-3 sm:flex-row sm:items-center'
  const selectControlClass = 'w-full rounded-full px-4 py-2.5 text-sm sm:w-80'

  useEffect(() => {
    void (async () => {
      await fetchWorkspace()
    })()
  }, [])

  const fetchWorkspace = async () => {
    try {
      setLoading(true)
      const workspaceId = readWorkspaceId()
      const data = await apiFetch<Workspace>(`/api/workspaces/${workspaceId}`)
      setWorkspace(data)
      setEnvType((data.envType || 'DEV') as 'DEV' | 'STAGING' | 'PROD')
      setIsReadOnly(data.isReadOnlyDefault || false)
    } catch (error) {
      console.error('获取 Workspace 失败:', error)
      setMessage({ type: 'error', text: '获取 Workspace 失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEnvType = async () => {
    if (!workspace) return
    try {
      setSaving(true)
      setMessage(null)
      const result = await apiFetch<ActionResult>(`/api/workspaces/${workspace.id}/env-type`, {
        method: 'PUT',
        body: JSON.stringify({ envType })
      })
      if (result.status === 'pending_approval') {
        setMessage({ type: 'success', text: `环境类型变更已提交审批（审批 ID: ${result.approvalId}）` })
      } else if (result.success) {
        setMessage({ type: 'success', text: '环境类型已更新' })
        await fetchWorkspace()
      } else {
        setMessage({ type: 'error', text: getActionErrorMessage(result, '更新失败') })
      }
    } catch (error) {
      console.error('更新环境类型失败:', error)
      setMessage({ type: 'error', text: '更新环境类型失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateReadOnly = async () => {
    if (!workspace) return
    try {
      setSaving(true)
      setMessage(null)
      const result = await apiFetch<ActionResult>(`/api/workspaces/${workspace.id}/read-only`, {
        method: 'PUT',
        body: JSON.stringify({ isReadOnlyDefault: isReadOnly })
      })
      if (result.success) {
        setMessage({ type: 'success', text: '只读模式已更新' })
        await fetchWorkspace()
      } else {
        setMessage({ type: 'error', text: getActionErrorMessage(result, '更新失败') })
      }
    } catch (error) {
      console.error('更新只读模式失败:', error)
      setMessage({ type: 'error', text: '更新只读模式失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleUnlock = async () => {
    if (!workspace) return
    try {
      setUnlocking(true)
      setMessage(null)
      const result = await apiFetch<ActionResult>(`/api/workspaces/${workspace.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ durationMinutes: unlockDuration })
      })
      if (result.status === 'pending_approval') {
        setMessage({ type: 'success', text: `临时解锁已提交审批（审批 ID: ${result.approvalId}）` })
      } else if (result.success) {
        setMessage({ type: 'success', text: `已解锁 ${unlockDuration} 分钟` })
        await fetchWorkspace()
      } else {
        setMessage({ type: 'error', text: getActionErrorMessage(result, '解锁失败') })
      }
    } catch (error) {
      console.error('临时解锁失败:', error)
      setMessage({ type: 'error', text: '临时解锁失败' })
    } finally {
      setUnlocking(false)
    }
  }

  const isUnlocked = workspace?.unlockUntil && new Date(workspace.unlockUntil) > new Date()

  if (loading) {
    return <LoadingState message="加载 Workspace 设置中..." />
  }

  if (!workspace) {
    return (
      <div className="p-6">
        <EmptyState message="未找到 Workspace" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card)_/_0.76)] px-6 py-5 shadow-sm backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">Workspace 设置</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          管理 Workspace 环境类型、只读模式和临时解锁
        </p>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 shadow-sm ${message.type === 'success' ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]' : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'}`}>
          {message.text}
        </div>
      )}

      {/* Workspace 信息 */}
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">基本信息</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">名称</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">{workspace.name}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">环境类型</span>
            <StatusBadge
              label={workspace.envType === 'DEV' ? '开发' : workspace.envType === 'STAGING' ? '预发布' : workspace.envType === 'PROD' ? '生产' : workspace.envType}
              tone={workspace.envType === 'DEV' ? 'info' : workspace.envType === 'STAGING' ? 'warning' : workspace.envType === 'PROD' ? 'danger' : 'muted'}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">只读模式</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              {workspace.isReadOnlyDefault ? '已启用' : '已禁用'}
            </span>
          </div>
          {isUnlocked && (
            <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] px-4 py-3">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">解锁状态</span>
              <span className="text-sm font-medium text-[hsl(var(--success))]">
                已解锁至 {formatDateTime(workspace.unlockUntil!)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 环境类型设置 */}
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">环境类型</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          选择 Workspace 的环境类型。PROD 环境默认启用只读模式，需要审批才能变更。
        </p>
        <div className={actionRowClass}>
          <ThemeSelect
            value={envType}
            onChange={(e) => setEnvType(e.target.value as 'DEV' | 'STAGING' | 'PROD')}
            className={selectControlClass}
          >
            <option value="DEV">开发环境（DEV）</option>
            <option value="STAGING">预发布环境（STAGING）</option>
            <option value="PROD">生产环境（PROD）</option>
          </ThemeSelect>
          <Button onClick={handleUpdateEnvType} loading={saving} disabled={envType === workspace.envType}>
            保存
          </Button>
        </div>
      </div>

      {/* 只读模式设置 */}
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">只读模式</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          启用只读模式后，禁止执行任何配置变更、策略变更等高危操作。
        </p>
        <div className={actionRowClass}>
          <label className="flex w-full cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2 sm:w-auto">
            <ThemeCheckbox checked={isReadOnly} onChange={(e) => setIsReadOnly(e.target.checked)} />
            <span className="text-sm text-[hsl(var(--foreground))]">启用只读模式</span>
          </label>
          <Button onClick={handleUpdateReadOnly} loading={saving} disabled={isReadOnly === workspace.isReadOnlyDefault}>
            保存
          </Button>
        </div>
      </div>

      {/* 临时解锁 */}
      {workspace.isReadOnlyDefault && (
        <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">临时解锁</h2>
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
            临时解锁只读模式，允许在指定时间内执行变更操作。解锁需要审批。
          </p>
          <div className={actionRowClass}>
            <ThemeSelect
              value={unlockDuration}
              onChange={(e) => setUnlockDuration(Number(e.target.value) as 15 | 30 | 60)}
              className={selectControlClass}
            >
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>60 分钟</option>
            </ThemeSelect>
            <button
              onClick={handleUnlock}
              disabled={unlocking || !!isUnlocked}
              className={`${actionButtonClass} bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] hover:opacity-90`}
            >
              {unlocking ? '申请中...' : isUnlocked ? '已解锁' : '申请解锁'}
            </button>
          </div>
          {isUnlocked && (
            <p className="mt-2 text-sm text-[hsl(var(--success))]">
              当前已解锁，将于 {formatDateTime(workspace.unlockUntil!)} 自动恢复只读
            </p>
          )}
        </div>
      )}
    </div>
  )
}
