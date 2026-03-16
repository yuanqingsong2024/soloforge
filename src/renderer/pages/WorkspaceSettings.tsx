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
      DEV: { label: '开发', className: 'bg-blue-100 text-blue-800' },
      STAGING: { label: '预发布', className: 'bg-yellow-100 text-yellow-800' },
      PROD: { label: '生产', className: 'bg-red-100 text-red-800' }
    }[type] || { label: type, className: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-workshop-sm text-xs font-medium ${config.className}`}>
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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Workspace 设置</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          管理 Workspace 环境类型、只读模式和临时解锁
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-workshop-md ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Workspace 信息 */}
      <div className="mb-6 bg-[hsl(var(--card))] rounded-workshop-md shadow-workshop-sm border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">基本信息</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">名称</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">{workspace.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">环境类型</span>
            {getEnvTypeBadge(workspace.envType)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">只读模式</span>
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              {workspace.isReadOnlyDefault ? '已启用' : '已禁用'}
            </span>
          </div>
          {isUnlocked && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">解锁状态</span>
              <span className="text-sm font-medium text-green-600">
                已解锁至 {new Date(workspace.unlockUntil!).toLocaleString('zh-CN')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 环境类型设置 */}
      <div className="mb-6 bg-[hsl(var(--card))] rounded-workshop-md shadow-workshop-sm border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">环境类型</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          选择 Workspace 的环境类型。PROD 环境默认启用只读模式，需要审批才能变更。
        </p>
        <div className="flex items-center gap-4">
          <select
            value={envType}
            onChange={(e) => setEnvType(e.target.value as 'DEV' | 'STAGING' | 'PROD')}
            className="px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          >
            <option value="DEV">开发环境（DEV）</option>
            <option value="STAGING">预发布环境（STAGING）</option>
            <option value="PROD">生产环境（PROD）</option>
          </select>
          <button
            onClick={handleUpdateEnvType}
            disabled={saving || envType === workspace.envType}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 只读模式设置 */}
      <div className="mb-6 bg-[hsl(var(--card))] rounded-workshop-md shadow-workshop-sm border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">只读模式</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          启用只读模式后，禁止执行任何配置变更、策略变更等高危操作。
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isReadOnly}
              onChange={(e) => setIsReadOnly(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-[hsl(var(--foreground))]">启用只读模式</span>
          </label>
          <button
            onClick={handleUpdateReadOnly}
            disabled={saving || isReadOnly === workspace.isReadOnlyDefault}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 临时解锁 */}
      {workspace.isReadOnlyDefault && (
        <div className="bg-[hsl(var(--card))] rounded-workshop-md shadow-workshop-sm border border-[hsl(var(--border))] p-6">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">临时解锁</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            临时解锁只读模式，允许在指定时间内执行变更操作。解锁需要审批。
          </p>
          <div className="flex items-center gap-4">
            <select
              value={unlockDuration}
              onChange={(e) => setUnlockDuration(Number(e.target.value) as 15 | 30 | 60)}
              className="px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
            >
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>60 分钟</option>
            </select>
            <button
              onClick={handleUnlock}
              disabled={unlocking || !!isUnlocked}
              className="px-4 py-2 bg-orange-500 text-white rounded-workshop-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {unlocking ? '申请中...' : isUnlocked ? '已解锁' : '申请解锁'}
            </button>
          </div>
          {isUnlocked && (
            <p className="text-sm text-green-600 mt-2">
              当前已解锁，将于 {new Date(workspace.unlockUntil!).toLocaleString('zh-CN')} 自动恢复只读
            </p>
          )}
        </div>
      )}
    </div>
  )
}
