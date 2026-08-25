/**
 * Hermes Workers 管理页面
 *
 * 功能：
 * - Worker 列表与状态监控
 * - 添加/编辑/删除 Worker
 * - 任务派发
 * - 任务历史查看
 */

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { LoadingState } from '../components/ui'

// ============================================
// 类型定义
// ============================================

interface HermesWorker {
  id: string
  name: string
  description: string
  baseUrl: string
  wsUrl: string | null
  enabled: boolean
  tags: string[]
  capabilities: {
    code?: boolean
    analysis?: boolean
    general?: boolean
    tools?: string[]
    [key: string]: unknown
  }
  lastHealthAt: string | null
  lastHealthStatus: string | null
  createdAt: string
  updatedAt: string
}

interface HermesTask {
  id: string
  workerId: string
  ticketId: string | null
  taskType: string
  prompt: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
  result: Record<string, unknown> | null
  error: string | null
  logs: string | null
  traceId: string
  createdAt: string
  updatedAt: string
  worker?: HermesWorker
}

interface WorkerStats {
  total: number
  byType: Record<string, number>
  byHealth: Record<string, number>
}

// ============================================
// 组件
// ============================================

export default function HermesWorkersPage() {
  const [activeTab, setActiveTab] = useState<'workers' | 'tasks' | 'dispatch'>('workers')
  const [workers, setWorkers] = useState<HermesWorker[]>([])
  const [tasks, setTasks] = useState<HermesTask[]>([])
  const [stats, setStats] = useState<WorkerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Worker 表单状态
  const [showWorkerModal, setShowWorkerModal] = useState(false)
  const [editingWorker, setEditingWorker] = useState<HermesWorker | null>(null)
  const [workerForm, setWorkerForm] = useState<{
    name: string
    description: string
    baseUrl: string
    wsUrl: string
    authToken: string
    tags: string[]
    capabilities: {
      code?: boolean
      analysis?: boolean
      general?: boolean
      tools?: string[]
      [key: string]: unknown
    }
  }>({
    name: '',
    description: '',
    baseUrl: 'http://localhost:8080',
    wsUrl: '',
    authToken: '',
    tags: [],
    capabilities: {
      code: true,
      analysis: true,
      general: true
    }
  })

  // 任务派发表单状态
  const [dispatchForm, setDispatchForm] = useState({
    taskType: 'general',
    prompt: '',
    preferredWorkerId: '',
    requireApproval: false
  })

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [workersRes, tasksRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: HermesWorker[] }>('/api/hermes/workers'),
        apiFetch<{ success: boolean; data: HermesTask[] }>('/api/hermes/tasks'),
        apiFetch<{ success: boolean; data: WorkerStats }>('/api/hermes/stats')
      ])

      if (workersRes.success) setWorkers(workersRes.data || [])
      if (tasksRes.success) setTasks(tasksRes.data || [])
      if (statsRes.success) setStats(statsRes.data || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Worker 健康检查
  const handlePing = async (workerId: string) => {
    try {
      const result = await apiFetch<{ success: boolean; latency: number; error?: string }>(
        `/api/hermes/workers/${workerId}/ping`,
        { method: 'POST' }
      )
      if (result.success) {
        alert(`健康检查成功！延迟: ${result.latency}ms`)
      } else {
        alert(`健康检查失败: ${result.error}`)
      }
      void loadData()
    } catch (err) {
      alert(`健康检查失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 创建/更新 Worker
  const handleSaveWorker = async () => {
    try {
      if (editingWorker) {
        await apiFetch(`/api/hermes/workers/${editingWorker.id}`, {
          method: 'PUT',
          body: JSON.stringify(workerForm)
        })
      } else {
        await apiFetch('/api/hermes/workers', {
          method: 'POST',
          body: JSON.stringify(workerForm)
        })
      }
      setShowWorkerModal(false)
      setEditingWorker(null)
      resetWorkerForm()
      void loadData()
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 删除 Worker
  const handleDeleteWorker = async (workerId: string) => {
    if (!confirm('确定要删除这个 Worker 吗？')) return
    try {
      await apiFetch(`/api/hermes/workers/${workerId}`, { method: 'DELETE' })
      void loadData()
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 派发任务
  const handleDispatch = async () => {
    if (!dispatchForm.prompt.trim()) {
      alert('请输入任务描述')
      return
    }
    try {
      const result = await apiFetch<{
        success: boolean
        data: { taskId: string; workerId: string; workerName: string }
      }>('/api/hermes/tasks', {
        method: 'POST',
        body: JSON.stringify({
          taskType: dispatchForm.taskType,
          prompt: dispatchForm.prompt,
          preferredWorkerId: dispatchForm.preferredWorkerId || undefined,
          requireApproval: dispatchForm.requireApproval
        })
      })
      if (result.success) {
        alert(`任务已派发到 ${result.data.workerName}，任务ID: ${result.data.taskId}`)
        setDispatchForm({ taskType: 'general', prompt: '', preferredWorkerId: '', requireApproval: false })
        setActiveTab('tasks')
        void loadData()
      }
    } catch (err) {
      alert(`派发失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 取消任务
  const handleCancelTask = async (taskId: string) => {
    if (!confirm('确定要取消这个任务吗？')) return
    try {
      await apiFetch(`/api/hermes/tasks/${taskId}/cancel`, { method: 'POST' })
      void loadData()
    } catch (err) {
      alert(`取消失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 重置表单
  const resetWorkerForm = () => {
    setWorkerForm({
      name: '',
      description: '',
      baseUrl: 'http://localhost:8080',
      wsUrl: '',
      authToken: '',
      tags: [],
      capabilities: { code: true, analysis: true, general: true }
    })
  }

  // 打开编辑 Worker 弹窗
  const openEditWorker = (worker: HermesWorker) => {
    setEditingWorker(worker)
    setWorkerForm({
      name: worker.name,
      description: worker.description,
      baseUrl: worker.baseUrl,
      wsUrl: worker.wsUrl || '',
      authToken: '',
      tags: worker.tags,
      capabilities: worker.capabilities
    })
    setShowWorkerModal(true)
  }

  // 渲染状态徽章
  const renderStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      healthy: { bg: 'bg-green-100', text: 'text-green-800' },
      degraded: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      offline: { bg: 'bg-red-100', text: 'text-red-800' },
      unknown: { bg: 'bg-gray-100', text: 'text-gray-800' },
      OK: { bg: 'bg-green-100', text: 'text-green-800' },
      ERROR: { bg: 'bg-red-100', text: 'text-red-800' }
    }
    const style = config[status] || { bg: 'bg-gray-100', text: 'text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {status}
      </span>
    )
  }

  // 渲染任务状态
  const renderTaskStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: 'bg-gray-100', text: 'text-gray-800' },
      RUNNING: { bg: 'bg-blue-100', text: 'text-blue-800' },
      SUCCEEDED: { bg: 'bg-green-100', text: 'text-green-800' },
      FAILED: { bg: 'bg-red-100', text: 'text-red-800' },
      CANCELED: { bg: 'bg-yellow-100', text: 'text-yellow-800' }
    }
    const style = config[status] || { bg: 'bg-gray-100', text: 'text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return <LoadingState message="加载 Hermes Workers 中..." />
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        错误: {error}
        <button onClick={() => void loadData()} className="ml-4 underline">
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hermes Workers</h1>
          <p className="text-gray-500 mt-1">管理 Hermes Agent Worker 和任务派发</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-gray-500 text-sm">总 Worker 数</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{stats.byHealth.healthy || 0}</div>
            <div className="text-gray-500 text-sm">健康</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{stats.byHealth.degraded || 0}</div>
            <div className="text-gray-500 text-sm">降级</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{stats.byHealth.offline || 0}</div>
            <div className="text-gray-500 text-sm">离线</div>
          </div>
        </div>
      )}

      {/* 标签页 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {(['workers', 'tasks', 'dispatch'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'workers' ? 'Workers' : tab === 'tasks' ? '任务' : '派发任务'}
            </button>
          ))}
        </nav>
      </div>

      {/* Workers 列表 */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium">Worker 列表</h2>
            <button
              onClick={() => {
                setEditingWorker(null)
                resetWorkerForm()
                setShowWorkerModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              添加 Worker
            </button>
          </div>

          {workers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无 Worker，点击上方按钮添加
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">地址</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">能力</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后检查</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workers.map((worker) => (
                    <tr key={worker.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{worker.name}</div>
                        <div className="text-sm text-gray-500">{worker.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {worker.baseUrl}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(worker.lastHealthStatus || 'unknown')}
                          {!worker.enabled && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              已禁用
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(worker.capabilities)
                            .filter(([, v]) => v)
                            .map(([k]) => (
                              <span key={k} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                {k}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {worker.lastHealthAt
                          ? new Date(worker.lastHealthAt).toLocaleString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => void handlePing(worker.id)}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          检查
                        </button>
                        <button
                          onClick={() => openEditWorker(worker)}
                          className="text-gray-600 hover:text-gray-900 mr-3"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => void handleDeleteWorker(worker.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">任务历史</h2>

          {tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">暂无任务</div>
          ) : (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                        {task.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                          {task.taskType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {task.prompt}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderTaskStatusBadge(task.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.worker?.name || task.workerId.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(task.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {(task.status === 'PENDING' || task.status === 'RUNNING') && (
                          <button
                            onClick={() => void handleCancelTask(task.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            取消
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 派发任务 */}
      {activeTab === 'dispatch' && (
        <div className="max-w-2xl">
          <h2 className="text-lg font-medium mb-4">派发新任务</h2>
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
              <select
                value={dispatchForm.taskType}
                onChange={(e) => setDispatchForm({ ...dispatchForm, taskType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="code">代码开发</option>
                <option value="analysis">数据分析</option>
                <option value="general">通用任务</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">任务描述</label>
              <textarea
                value={dispatchForm.prompt}
                onChange={(e) => setDispatchForm({ ...dispatchForm, prompt: e.target.value })}
                rows={6}
                placeholder="描述你要完成的任务..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">指定 Worker（可选）</label>
              <select
                value={dispatchForm.preferredWorkerId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, preferredWorkerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">自动选择</option>
                {workers.filter((w) => w.enabled).map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="requireApproval"
                checked={dispatchForm.requireApproval}
                onChange={(e) => setDispatchForm({ ...dispatchForm, requireApproval: e.target.checked })}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="requireApproval" className="ml-2 text-sm text-gray-700">
                需要审批
              </label>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => void handleDispatch()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                派发任务
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worker 编辑弹窗 */}
      {showWorkerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-medium mb-4">
              {editingWorker ? '编辑 Worker' : '添加 Worker'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={workerForm.name}
                  onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <input
                  type="text"
                  value={workerForm.description}
                  onChange={(e) => setWorkerForm({ ...workerForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
                <input
                  type="text"
                  value={workerForm.baseUrl}
                  onChange={(e) => setWorkerForm({ ...workerForm, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WebSocket 地址（可选）</label>
                <input
                  type="text"
                  value={workerForm.wsUrl}
                  onChange={(e) => setWorkerForm({ ...workerForm, wsUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">认证 Token（可选）</label>
                <input
                  type="password"
                  value={workerForm.authToken}
                  onChange={(e) => setWorkerForm({ ...workerForm, authToken: e.target.value })}
                  placeholder={editingWorker ? '留空则不修改' : ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">能力</label>
                <div className="space-y-2">
                  {(['code', 'analysis', 'general'] as const).map((cap) => (
                    <label key={cap} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={workerForm.capabilities[cap] || false}
                        onChange={(e) =>
                          setWorkerForm({
                            ...workerForm,
                            capabilities: { ...workerForm.capabilities, [cap]: e.target.checked }
                          })
                        }
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">{cap}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowWorkerModal(false)
                  setEditingWorker(null)
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => void handleSaveWorker()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
