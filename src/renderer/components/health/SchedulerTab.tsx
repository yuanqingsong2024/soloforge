import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getApiPort } from '../../lib/api'
import { getHealthEnabledPillClass, getHealthErrorPanelClass } from '../../lib/health-badge'
import { translateEnum } from '../../lib/i18n-helpers'
import { ThemeCheckbox } from '../ui/FormFields'

interface DoctorSchedule {
  id: string
  workspaceId: string
  targetId: string | null
  enabled: boolean
  intervalMinutes: number
  checkTypes: string[]
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

interface DoctorCheck {
  id: string
  name: string
  category: string
  description: string | null
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  enabled: boolean
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

interface SchedulerTabProps {
  workspaceId: string
}

export function SchedulerTab({ workspaceId }: SchedulerTabProps) {
  const { t } = useTranslation('common')
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([])
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    checkId: '',
    intervalMinutes: 360,
    enabled: true
  })

  useEffect(() => {
    void loadData()
  }, [workspaceId])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const port = await getApiPort()
      const query = `?workspaceId=${encodeURIComponent(workspaceId)}`

      const [schedulesRes, checksRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/doctor-schedules${query}`),
        fetch(`http://127.0.0.1:${port}/api/doctor/checks${query}`)
      ])

      if (!schedulesRes.ok || !checksRes.ok) {
        throw new Error('加载数据失败')
      }

      const schedulesData = await schedulesRes.json() as ApiResponse<DoctorSchedule[]>
      const checksData = await checksRes.json() as ApiResponse<DoctorCheck[]>

      if (!schedulesData.success) {
        throw new Error(schedulesData.error)
      }
      if (!checksData.success) {
        throw new Error(checksData.error)
      }

      setSchedules(schedulesData.data)
      setChecks(checksData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }

  async function createSchedule() {
    try {
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/doctor-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          enabled: formData.enabled,
          intervalMinutes: formData.intervalMinutes,
          checkTypes: formData.checkId ? [formData.checkId] : undefined
        })
      })

      if (!res.ok) {
        throw new Error('创建调度失败')
      }

      setShowCreateForm(false)
      setFormData({ checkId: '', intervalMinutes: 360, enabled: true })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }

  async function runScheduleNow(scheduleId: string) {
    try {
      setError(null)
      const port = await getApiPort()

      const res = await fetch(`http://127.0.0.1:${port}/api/doctor-schedules/${scheduleId}/run-now`, {
        method: 'POST'
      })

      if (!res.ok) {
        throw new Error('执行调度失败')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }

  const availableChecks = checks.filter(
    check => !schedules.some(schedule => schedule.checkTypes.includes(check.id))
  )

  if (loading) {
    return <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">加载中...</div>
  }

  if (error) {
    return (
      <div className={getHealthErrorPanelClass()}>
        <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        <button
          onClick={() => void loadData()}
          className="mt-2 text-sm text-[hsl(var(--destructive))] hover:opacity-80 underline"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">诊断调度</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {schedules.length} 个调度任务，{schedules.filter(schedule => schedule.enabled).length} 个已启用
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--primary))]/90 transition-colors"
        >
          {showCreateForm ? '取消' : '新建调度'}
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4">
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">创建新调度</h4>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              检查项 *
            </label>
            <select
              value={formData.checkId}
              onChange={(e) => setFormData({ ...formData, checkId: e.target.value })}
              className="w-full px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            >
              <option value="">选择检查项</option>
              {availableChecks.map((check) => (
                <option key={check.id} value={check.id}>
                  {check.name} ({check.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              调度间隔（分钟） *
            </label>
            <input
              type="number"
              min={1}
              value={formData.intervalMinutes}
              onChange={(e) => setFormData({ ...formData, intervalMinutes: Math.max(1, Number(e.target.value) || 1) })}
              placeholder="360"
              className="w-full px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              例如 30 表示每 30 分钟执行一次，360 表示每 6 小时执行一次
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeCheckbox id="enabled" checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} />
            <label htmlFor="enabled" className="text-sm text-[hsl(var(--foreground))]">
              启用调度
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void createSchedule()}
              disabled={!formData.checkId || formData.intervalMinutes < 1}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              创建
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setFormData({ checkId: '', intervalMinutes: 360, enabled: true })
              }}
              className="px-4 py-2 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-md hover:bg-[hsl(var(--secondary))]/80 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {schedules.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
            暂无调度任务
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="p-4 rounded-workshop-md border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                        {schedule.checkTypes.map((checkType) => {
                          const matchedCheck = checks.find(check => check.id === checkType)
                          return matchedCheck?.name || checkType
                        }).join(' / ')}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getHealthEnabledPillClass(schedule.enabled)}`}>
                        {schedule.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                      <p>间隔: 每 {schedule.intervalMinutes} 分钟</p>
                      {schedule.lastRunAt && (
                        <p>上次运行: {new Date(schedule.lastRunAt).toLocaleString('zh-CN')}</p>
                      )}
                      {schedule.targetId && <p>目标: {schedule.targetId}</p>}
                      <p>
                        检查分类: {schedule.checkTypes.map((checkType) => {
                          const matchedCheck = checks.find(check => check.id === checkType)
                          return matchedCheck ? translateEnum(t, 'doctorCategoryMap', matchedCheck.category) : checkType
                        }).join(' / ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => void runScheduleNow(schedule.id)}
                      className="px-3 py-1 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-workshop-sm hover:bg-[hsl(var(--secondary))]/80 transition-colors"
                    >
                      立即执行
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
