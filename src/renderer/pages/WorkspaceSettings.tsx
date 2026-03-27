import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'

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

export function WorkspaceSettings() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表单状态
  const [envType, setEnvType] = useState<'DEV' | 'STAGING' | 'PROD'>('DEV')
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [unlockDuration, setUnlockDuration] = useState<15 | 30 | 60>(15)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchWorkspace(port)
    })
  }, [])

  const fetchWorkspace = async (port: number) => {
    try {
      setLoading(true)
      const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
      const response = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`)
      if (!response.ok) throw new Error('获取 Workspace 失败')
      const data = await response.json()
      setWorkspace(data)
      setEnvType(data.envType || 'DEV')
      setIsReadOnly(data.isReadOnlyDefault || false)
    } catch (error) {
      console.error('获取 Workspace 失败:', error)
      setMessage({ type: 'error', text: '获取 Workspace 失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEnvType = async () => {
    if (!apiPort || !workspace) return
    try {
      setSaving(true)
      setMessage(null)
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${workspace.id}/env-type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envType })
      })
      const result = await response.json()
      if (result.status === 'pending_approval') {
        setMessage({ type: 'success', text: `环境类型变更已提交审批（审批 ID: ${result.approvalId}）` })
      } else if (result.success) {
        setMessage({ type: 'success', text: '环境类型已更新' })
        fetchWorkspace(apiPort)
      } else {
        setMessage({ type: 'error', text: result.message || '更新失败' })
      }
    } catch (error) {
      console.error('更新环境类型失败:', error)
      setMessage({ type: 'error', text: '更新环境类型失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateReadOnly = async () => {
    if (!apiPort || !workspace) return
    try {
      setSaving(true)
      setMessage(null)
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${workspace.id}/read-only`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReadOnly })
      })
      const result = await response.json()
      if (result.success) {
        setMessage({ type: 'success', text: '只读模式已更新' })
        fetchWorkspace(apiPort)
      } else {
        setMessage({ type: 'error', text: result.message || '更新失败' })
      }
    } catch (error) {
      console.error('更新只读模式失败:', error)
      setMessage({ type: 'error', text: '更新只读模式失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleUnlock = async () => {
    if (!apiPort || !workspace) return
    try {
      setUnlocking(true)
      setMessage(null)
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${workspace.id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: unlockDuration })
      })
      const result = await response.json()
      if (result.status === 'pending_approval') {
        setMessage({ type: 'success', text: `临时解锁已提交审批（审批 ID: ${result.approvalId}）` })
      } else if (result.success) {
        setMessage({ type: 'success', text: `已解锁 ${unlockDuration} 分钟` })
        fetchWorkspace(apiPort)
      } else {
        setMessage({ type: 'error', text: result.message || '解锁失败' })
      }
    } catch (error) {
      console.error('临时解锁失败:', error)
      setMessage({ type: 'error', text: '临时解锁失败' })
    } finally {
      setUnlocking(false)
    }
  }

  const getEnvTypeBadge = (type: string) => {
    const config = {
      DEV: { label: '开发', className: 'border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]' },
      STAGING: { label: '预发布', className: 'border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]' },
      PROD: { label: '生产', className: 'border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]' }
    }[type] || { label: type, className: 'border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' }
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const isUnlocked = workspace?.unlockUntil && new Date(workspace.unlockUntil) > new Date()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="p-6">
        <div className="text-center text-[hsl(var(--muted-foreground))]">
          未找到 Workspace
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card)_/_0.76)] px-6 py-5 shadow-workshop-sm backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">Workspace 设置</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          管理 Workspace 环境类型、只读模式和临时解锁
        </p>
      </div>

      {message && (
        <div className={`rounded-workshop-lg border px-4 py-3 shadow-workshop-sm ${message.type === 'success' ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]' : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'}`}>
          {message.text}
        </div>
      )}

      {/* Workspace 信息 */}
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">基本信息</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">名称</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">{workspace.name}</span>
          </div>
          <div className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">环境类型</span>
            {getEnvTypeBadge(workspace.envType)}
          </div>
          <div className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-4 py-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">只读模式</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              {workspace.isReadOnlyDefault ? '已启用' : '已禁用'}
            </span>
          </div>
          {isUnlocked && (
            <div className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] px-4 py-3">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">解锁状态</span>
              <span className="text-sm font-medium text-[hsl(var(--success))]">
                已解锁至 {new Date(workspace.unlockUntil!).toLocaleString('zh-CN')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 环境类型设置 */}
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">环境类型</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          选择 Workspace 的环境类型。PROD 环境默认启用只读模式，需要审批才能变更。
        </p>
        <div className="flex items-center gap-4">
          <select
            value={envType}
            onChange={(e) => setEnvType(e.target.value as 'DEV' | 'STAGING' | 'PROD')}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
          >
            <option value="DEV">开发环境（DEV）</option>
            <option value="STAGING">预发布环境（STAGING）</option>
            <option value="PROD">生产环境（PROD）</option>
          </select>
          <button
            onClick={handleUpdateEnvType}
            disabled={saving || envType === workspace.envType}
            className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 只读模式设置 */}
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
        <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">只读模式</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          启用只读模式后，禁止执行任何配置变更、策略变更等高危操作。
        </p>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2">
            <input
              type="checkbox"
              checked={isReadOnly}
              onChange={(e) => setIsReadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[hsl(var(--border))]"
            />
            <span className="text-sm text-[hsl(var(--foreground))]">启用只读模式</span>
          </label>
          <button
            onClick={handleUpdateReadOnly}
            disabled={saving || isReadOnly === workspace.isReadOnlyDefault}
            className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 临时解锁 */}
      {workspace.isReadOnlyDefault && (
        <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
          <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">临时解锁</h2>
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
            临时解锁只读模式，允许在指定时间内执行变更操作。解锁需要审批。
          </p>
          <div className="flex items-center gap-4">
            <select
              value={unlockDuration}
              onChange={(e) => setUnlockDuration(Number(e.target.value) as 15 | 30 | 60)}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
            >
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>60 分钟</option>
            </select>
            <button
              onClick={handleUnlock}
              disabled={unlocking || !!isUnlocked}
              className="rounded-full bg-[hsl(var(--warning))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--warning-foreground))] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unlocking ? '申请中...' : isUnlocked ? '已解锁' : '申请解锁'}
            </button>
          </div>
          {isUnlocked && (
            <p className="mt-2 text-sm text-[hsl(var(--success))]">
              当前已解锁，将于 {new Date(workspace.unlockUntil!).toLocaleString('zh-CN')} 自动恢复只读
            </p>
          )}
        </div>
      )}
    </div>
  )
}
