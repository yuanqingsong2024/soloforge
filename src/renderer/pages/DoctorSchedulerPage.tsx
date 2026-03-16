import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface DoctorSchedule {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  cronExpression: string
  checkTypes: string[]
  enabled: boolean
  lastRunAt?: string | null
  nextRunAt?: string | null
  createdAt: string
  updatedAt: string
}

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function DoctorSchedulerPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<DoctorSchedule | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cronExpression: '0 */6 * * *',
    checkTypes: [] as string[],
    enabled: true
  })

  const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'

  const availableCheckTypes = [
    'OPENCLAW_HEALTH',
    'OPENCLAW_CONFIG',
    'DEPLOYMENT_STATUS',
    'WORKSPACE_POLICY',
    'BACKUP_STATUS',
    'AUDIT_INTEGRITY'
  ]

  const cronPresets = [
    { label: '每小时', value: '0 * * * *' },
    { label: '每 6 小时', value: '0 */6 * * *' },
    { label: '每天凌晨 2 点', value: '0 2 * * *' },
    { label: '每周一凌晨 3 点', value: '0 3 * * 1' },
    { label: '每月 1 号凌晨 4 点', value: '0 4 1 * *' }
  ]

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchSchedules(port)
      setLoading(false)
    })
  }, [])

  const fetchSchedules = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/doctor-schedules?workspaceId=${workspaceId}`)
    const json = await response.json() as ApiResponse<DoctorSchedule[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setSchedules(json.data)
  }

  const handleCreate = () => {
    setEditingSchedule(null)
    setFormData({
      name: '',
      description: '',
      cronExpression: '0 */6 * * *',
      checkTypes: [],
      enabled: true
    })
    setShowForm(true)
  }

  const handleEdit = (schedule: DoctorSchedule) => {
    setEditingSchedule(schedule)
    setFormData({
      name: schedule.name,
      description: schedule.description || '',
      cronExpression: schedule.cronExpression,
      checkTypes: schedule.checkTypes,
      enabled: schedule.enabled
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiPort) return

    if (formData.checkTypes.length === 0) {
      alert('请至少选择一个检查类型')
      return
    }

    try {
      const payload = {
        workspaceId,
        name: formData.name,
        description: formData.description || null,
        cronExpression: formData.cronExpression,
        checkTypes: formData.checkTypes,
        enabled: formData.enabled
      }

      const url = editingSchedule
        ? `http://127.0.0.1:${apiPort}/api/doctor-schedules/${editingSchedule.id}`
        : `http://127.0.0.1:${apiPort}/api/doctor-schedules`

      const method = editingSchedule ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await response.json()
      if (!json.success) {
        alert(`错误: ${json.error}`)
        return
      }

      await fetchSchedules(apiPort)
      setShowForm(false)
      setEditingSchedule(null)
    } catch (err: any) {
      alert(`提交失败: ${err.message}`)
    }
  }

  const handleRunNow = async (scheduleId: string) => {
    if (!apiPort) return

    if (!confirm('确定立即执行此巡检计划？')) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/doctor-schedules/${scheduleId}/run-now`, {
        method: 'POST'
      })

      const json = await response.json()
      if (!json.success) {
        alert(`执行失败: ${json.error}`)
        return
      }

      alert('巡检已触发，请稍后查看 Alerts 页面')
      await fetchSchedules(apiPort)
    } catch (err: any) {
      alert(`执行失败: ${err.message}`)
    }
  }

  const handleToggleEnabled = async (schedule: DoctorSchedule) => {
    if (!apiPort) return

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/doctor-schedules/${schedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...schedule,
          enabled: !schedule.enabled
        })
      })

      const json = await response.json()
      if (!json.success) {
        alert(`错误: ${json.error}`)
        return
      }

      await fetchSchedules(apiPort)
    } catch (err: any) {
      alert(`切换失败: ${err.message}`)
    }
  }

  const handleCheckTypeToggle = (checkType: string) => {
    setFormData(prev => ({
      ...prev,
      checkTypes: prev.checkTypes.includes(checkType)
        ? prev.checkTypes.filter(t => t !== checkType)
        : [...prev.checkTypes, checkType]
    }))
  }

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader title="巡检调度" description="管理自动化健康检查计划" />
        <div className="mt-6 text-center text-slate-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <PageHeader
        title="巡检调度"
        description="管理自动化健康检查计划，支持 Cron 表达式定时执行"
        actions={
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            新建计划
          </button>
        }
      />

      {showForm && (
        <SectionCard title={editingSchedule ? '编辑计划' : '新建计划'} className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">计划名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cron 表达式</label>
              <input
                type="text"
                value={formData.cronExpression}
                onChange={e => setFormData({ ...formData, cronExpression: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {cronPresets.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, cronExpression: preset.value })}
                    className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                格式: 分 时 日 月 周 (例: 0 */6 * * * 表示每 6 小时执行一次)
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">检查类型</label>
              <div className="space-y-2">
                {availableCheckTypes.map(checkType => (
                  <label key={checkType} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.checkTypes.includes(checkType)}
                      onChange={() => handleCheckTypeToggle(checkType)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{checkType}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label className="text-sm font-medium text-slate-700">启用计划</label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingSchedule ? '保存' : '创建'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingSchedule(null)
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard title="计划列表" className="mt-6">
        {schedules.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            暂无计划，点击"新建计划"创建第一个巡检计划
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map(schedule => (
              <div key={schedule.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-slate-900">{schedule.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        schedule.enabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {schedule.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    {schedule.description && (
                      <p className="text-sm text-slate-600 mt-1">{schedule.description}</p>
                    )}
                    <div className="mt-2 text-xs text-slate-500 space-y-1">
                      <div>Cron: <code className="px-1 py-0.5 bg-slate-100 rounded font-mono">{schedule.cronExpression}</code></div>
                      <div>检查类型: {schedule.checkTypes.join(', ')}</div>
                      {schedule.lastRunAt && (
                        <div>上次执行: {new Date(schedule.lastRunAt).toLocaleString('zh-CN')}</div>
                      )}
                      {schedule.nextRunAt && (
                        <div>下次执行: {new Date(schedule.nextRunAt).toLocaleString('zh-CN')}</div>
                      )}
                      <div>创建于: {new Date(schedule.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRunNow(schedule.id)}
                      className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                    >
                      立即执行
                    </button>
                    <button
                      onClick={() => handleToggleEnabled(schedule)}
                      className="px-3 py-1 text-sm bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
                    >
                      {schedule.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleEdit(schedule)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      编辑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
