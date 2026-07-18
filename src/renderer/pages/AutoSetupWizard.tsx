import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { getApiPort } from '../lib/api'
import { readWorkspaceId } from '../lib/storage'

type WizardPhase = 'detect' | 'mode' | 'bootstrap' | 'complete'
type SetupMode = 'auto' | 'manual' | 'skip'
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
type StepKey =
  | 'detect'
  | 'check_image'
  | 'deploy'
  | 'health_check'
  | 'create_profile'
  | 'bind_workspace'
  | 'test_connection'

interface DetectionResult {
  detected: boolean
  method: 'port' | 'docker' | 'none'
  details: {
    port?: {
      available: boolean
      latency?: number
      error?: string
    }
    docker?: {
      available: boolean
      running: boolean
      containerName?: string
      image?: string
      status?: string
      error?: string
    }
    installation?: {
      available: boolean
      executablePath?: string
      error?: string
    }
  }
}

interface DetectionResponse {
  success: boolean
  detection: DetectionResult
  detectionId: string
}

interface BootstrapStepResult {
  step: StepKey
  status: Exclude<StepStatus, 'pending'>
  message?: string
  error?: string
  result?: unknown
}

interface BootstrapResponse {
  success: boolean
  steps: BootstrapStepResult[]
  message?: string
  profileId?: string
}

interface WizardStepItem {
  key: StepKey
  title: string
  description: string
}

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_IMAGE_NAME = 'openclaw/gateway:latest'

const WIZARD_STEPS: WizardStepItem[] = [
  {
    key: 'detect',
    title: '检测本地 OpenClaw',
    description: '检查 18789 端口与本地运行状态'
  },
  {
    key: 'check_image',
    title: '检查 Docker 镜像',
    description: '确认本地存在可用于启动的 Gateway 镜像'
  },
  {
    key: 'deploy',
    title: '自动部署 Gateway',
    description: '在本机拉起 openclaw-gateway 服务'
  },
  {
    key: 'health_check',
    title: '执行健康检查',
    description: '等待服务就绪并确认 health 可访问'
  },
  {
    key: 'create_profile',
    title: '创建连接配置',
    description: '生成 Local OpenClaw 连接档案'
  },
  {
    key: 'bind_workspace',
    title: '绑定当前 Workspace',
    description: '将连接配置关联到当前工作区'
  },
  {
    key: 'test_connection',
    title: '测试最终连接',
    description: '验证连接可用并完成自动引导'
  }
]

function getStatusText(status: StepStatus) {
  switch (status) {
    case 'running':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'skipped':
      return '已跳过'
    default:
      return '等待中'
  }
}

function getStatusClassName(status: StepStatus) {
  switch (status) {
    case 'running':
      return 'border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.08)] text-[hsl(var(--google-blue))]'
    case 'completed':
      return 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
    case 'failed':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    case 'skipped':
      return 'border-[hsl(var(--google-yellow)_/_0.18)] bg-[hsl(var(--google-yellow)_/_0.12)] text-[hsl(var(--warning))]'
    default:
      return 'border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.45)] text-[hsl(var(--muted-foreground))]'
  }
}

function buildInitialStepStatuses(): Record<StepKey, StepStatus> {
  return {
    detect: 'pending',
    check_image: 'pending',
    deploy: 'pending',
    health_check: 'pending',
    create_profile: 'pending',
    bind_workspace: 'pending',
    test_connection: 'pending'
  }
}

function buildBootstrapSeedStatuses(skipDeploy: boolean): Record<StepKey, StepStatus> {
  return {
    detect: 'running',
    check_image: skipDeploy ? 'skipped' : 'pending',
    deploy: skipDeploy ? 'skipped' : 'pending',
    health_check: skipDeploy ? 'skipped' : 'pending',
    create_profile: 'pending',
    bind_workspace: 'pending',
    test_connection: 'pending'
  }
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-0'}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function DockerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="4" height="4" rx="1" />
      <rect x="8" y="7" width="4" height="4" rx="1" />
      <rect x="13" y="7" width="4" height="4" rx="1" />
      <path d="M3 12c0 3.9 2.2 6 6.1 6H14c3.6 0 6-2.3 6-5.7 0-.7-.1-1.4-.3-2.1H3Z" />
      <path d="M17 7.5c.5-.8 1.3-1.3 2.2-1.5" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="8 5 19 12 8 19 8 5" />
    </svg>
  )
}

export function AutoSetupWizard() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [phase, setPhase] = useState<WizardPhase>('detect')
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID)
  const [imageName, setImageName] = useState(DEFAULT_IMAGE_NAME)
  const [selectedMode, setSelectedMode] = useState<SetupMode>('auto')
  const [isDetecting, setIsDetecting] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const [showRunningHint, setShowRunningHint] = useState(false)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [detectionId, setDetectionId] = useState<string | null>(null)
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResponse | null>(null)
  const [stepStatuses, setStepStatuses] = useState<Record<StepKey, StepStatus>>(buildInitialStepStatuses)

  useEffect(() => {
    getApiPort().then((port) => {
      setApiPort(port)
    })

    const storedWorkspaceId = readWorkspaceId()
    if (storedWorkspaceId) {
      setWorkspaceId(storedWorkspaceId)
    }
  }, [])

  const activeStepCount = useMemo(() => {
    return WIZARD_STEPS.filter((item) => stepStatuses[item.key] !== 'skipped').length
  }, [stepStatuses])

  const completedStepCount = useMemo(() => {
    return WIZARD_STEPS.filter((item) => {
      const status = stepStatuses[item.key]
      return status === 'completed' || status === 'skipped'
    }).length
  }, [stepStatuses])

  const isComplete = phase === 'complete' && bootstrapResult?.success
  const isOpenClawRunning = Boolean(detection?.details.port?.available || detection?.details.docker?.running)
  const canStartDocker = Boolean(detection?.details.docker?.available && !detection.details.docker.running)
  const canStartNative = Boolean(detection && !detection.details.port?.available && !detection.details.docker?.running && detection.details.installation?.available)

  const applyBootstrapSteps = (steps: BootstrapStepResult[], currentSkipDeploy: boolean) => {
    const nextStatuses = buildBootstrapSeedStatuses(currentSkipDeploy)

    for (const step of steps) {
      nextStatuses[step.step] = step.status
    }

    setStepStatuses(nextStatuses)
  }

  const handleDetect = async () => {
    if (!apiPort) {
      setError('本地 API 端口尚未就绪，请稍后重试')
      return
    }

    setIsDetecting(true)
    setError(null)
    setDetection(null)
    setDetectionId(null)
    setBootstrapResult(null)
    setStartMessage(null)
    setShowRunningHint(false)
    setPhase('detect')
    setStepStatuses(buildInitialStepStatuses())

    try {
      setStepStatuses((previous) => ({
        ...previous,
        detect: 'running'
      }))

      const response = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      })

      const data = (await response.json()) as DetectionResponse

      if (!response.ok || !data.success) {
        throw new Error('自动检测失败，请检查本地服务状态')
      }

      setDetection(data.detection)
      setDetectionId(data.detectionId)
      setSelectedMode(data.detection.details.port?.available || data.detection.details.docker?.running ? 'skip' : 'auto')
      setPhase('mode')
      setStepStatuses((previous) => ({
        ...previous,
        detect: 'completed'
      }))
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '自动检测失败'
      setError(message)
      setStepStatuses((previous) => ({
        ...previous,
        detect: 'failed'
      }))
    } finally {
      setIsDetecting(false)
    }
  }

  const handleModeChange = (mode: SetupMode) => {
    setSelectedMode(mode)
    setError(null)
  }

  const handleBootstrap = async () => {
    if (!apiPort) {
      setError('本地 API 端口尚未就绪，请稍后重试')
      return
    }

    if (selectedMode === 'manual') {
      navigate('/setup/wizard')
      return
    }

    if (selectedMode === 'skip') {
    }

    const nextSkipDeploy = selectedMode !== 'auto'

    setIsBootstrapping(true)
    setError(null)
    setBootstrapResult(null)
    setPhase('bootstrap')
    setStepStatuses(buildBootstrapSeedStatuses(nextSkipDeploy))

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/auto-bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          imageName,
          skipDeploy: nextSkipDeploy
        })
      })

      const data = (await response.json()) as BootstrapResponse
      applyBootstrapSteps(data.steps || [], nextSkipDeploy)
      setBootstrapResult(data)

      if (!response.ok || !data.success) {
        throw new Error(data.message || '自动引导失败，请根据步骤信息排查')
      }

      setPhase('complete')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '自动引导失败'
      setError(message)
    } finally {
      setIsBootstrapping(false)
    }
  }

  const handleStartOpenClaw = async (mode: 'docker' | 'native') => {
    if (!apiPort || !detectionId) {
      setError('缺少检测记录，无法启动 OpenClaw')
      return
    }

    setIsStarting(true)
    setError(null)
    setStartMessage(null)

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          detectionId,
          port: 18789,
          mode
        })
      })

      const data = await response.json() as { success: boolean; message?: string; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || '启动 OpenClaw 失败')
      }

      setStartMessage('启动命令已提交，正在重新检测状态...')
      await handleDetect()
      setStartMessage('OpenClaw 已启动，状态已刷新。')
      setShowRunningHint(true)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '启动 OpenClaw 失败'
      setError(message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleRestart = () => {
    setPhase('detect')
    setDetection(null)
    setDetectionId(null)
    setBootstrapResult(null)
    setStartMessage(null)
    setShowRunningHint(false)
    setSelectedMode('auto')
    setError(null)
    setStepStatuses(buildInitialStepStatuses())
  }

  const failedStep = bootstrapResult?.steps.find((item) => item.status === 'failed')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Setup Wizard"
        description="7 步引导式 OpenClaw 自动配置向导，适合快速完成本地接入。"
        actions={
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/setup/wizard')}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              手动配置
            </button>
            <button
              onClick={() => navigate('/')}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              返回首页
            </button>
          </div>
        }
      />

      <SectionCard title="向导进度" description="按检测、决策、执行、完成四个阶段推进。">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { key: 'detect', label: '1. 自动检测', active: phase === 'detect' },
            { key: 'mode', label: '2. 选择模式', active: phase === 'mode' },
            { key: 'bootstrap', label: '3. 执行引导', active: phase === 'bootstrap' },
            { key: 'complete', label: '4. 完成接入', active: phase === 'complete' }
          ].map((item) => (
            <div
              key={item.key}
              className={`rounded-workshop-lg border px-4 py-3 shadow-workshop-sm ${
                item.active
                  ? 'border-[hsl(var(--primary)_/_0.24)] bg-[hsl(var(--primary)_/_0.08)]'
                  : 'border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))]'
              }`}
            >
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">{item.label}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-workshop-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-4 shadow-workshop-sm">
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      <SectionCard title="7 步执行轨迹" description="前端会实时显示当前阶段，执行完成后同步后端返回的每一步状态。">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span>已完成 {completedStepCount} / {activeStepCount} 步</span>
          {detectionId && <span>检测记录：{detectionId}</span>}
          {bootstrapResult?.profileId && <span>连接档案：{bootstrapResult.profileId}</span>}
        </div>

        <div className="space-y-3">
          {WIZARD_STEPS.map((item, index) => {
            const status = stepStatuses[item.key]
            const backendStep = bootstrapResult?.steps.find((step) => step.step === item.key)
            const detailText = backendStep?.error || backendStep?.message

            return (
              <div
                key={item.key}
                className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-sm font-semibold text-[hsl(var(--foreground))]">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{item.title}</h3>
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">{item.description}</p>
                      </div>
                    </div>
                    {detailText && (
                      <p className="pl-11 text-sm text-[hsl(var(--muted-foreground))]">{detailText}</p>
                    )}
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClassName(status)}`}>
                    {getStatusText(status)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="检测与模式选择" description="先检测本地环境，再决定是自动部署、手动配置，还是跳过部署直接绑定现有实例。">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDetect}
              disabled={isDetecting || isBootstrapping || apiPort === null}
              className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDetecting ? '检测中...' : '开始自动检测'}
            </button>
            <button
              onClick={handleRestart}
              disabled={isDetecting || isBootstrapping}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              重置向导
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] p-4">
              <p className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">运行参数</p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                    Workspace ID
                  </label>
                  <input
                    type="text"
                    value={workspaceId}
                    onChange={(event) => setWorkspaceId(event.target.value)}
                    className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                    placeholder="输入当前工作区 ID"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                    Docker 镜像
                  </label>
                  <input
                    type="text"
                    value={imageName}
                    onChange={(event) => setImageName(event.target.value)}
                    className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                    placeholder="openclaw/gateway:latest"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] p-4">
              <p className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">检测结果</p>
              {!detection ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">尚未执行检测。点击“开始自动检测”后，这里会显示端口与 Docker 环境情况。</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-[hsl(var(--border)_/_0.6)] pb-2">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">状态</p>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">检测信息</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-[hsl(var(--foreground))]">发现状态：</span>
                        {detection.detected
                          ? '已检测到可用 OpenClaw'
                          : detection.details.installation?.available
                            ? '已发现 OpenClaw 安装痕迹，但服务未启动'
                            : '未发现 OpenClaw 安装痕迹'}
                      </p>
                      <p>
                        <span className="font-medium text-[hsl(var(--foreground))]">检测方式：</span>
                        {detection.method}
                      </p>
                      <p>
                        <span className="font-medium text-[hsl(var(--foreground))]">端口检测：</span>
                        {detection.details.port?.available ? '18789 可访问' : detection.details.port?.error || '不可访问'}
                      </p>
                      <p>
                        <span className="font-medium text-[hsl(var(--foreground))]">Docker 检测：</span>
                        {detection.details.docker?.available
                          ? detection.details.docker.running
                            ? `${detection.details.docker.containerName || '容器已运行'} · ${detection.details.docker.image || '镜像未知'}`
                            : `${detection.details.docker.containerName || '容器已停止'} · ${detection.details.docker.status || '已停止'}`
                          : detection.details.docker?.error || '未发现 openclaw-gateway 容器'}
                      </p>
                    </div>
                    <p className="mt-3">
                      <span className="font-medium text-[hsl(var(--foreground))]">安装痕迹：</span>
                      {detection.details.installation?.available
                        ? detection.details.installation.executablePath
                          ? `已找到 ${detection.details.installation.executablePath}`
                          : '已找到安装痕迹'
                        : detection.details.installation?.error || '未找到安装痕迹'}
                    </p>
                  </div>

                  <div className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--background))] p-3 space-y-2 lg:min-w-0 lg:justify-self-end">
                    <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border)_/_0.6)] pb-2">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">操作</p>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">启动控制</span>
                    </div>
                    {(canStartDocker || canStartNative) && (
                      <div className="flex flex-wrap gap-2">
                        {canStartDocker && (
                          <button
                            onClick={() => handleStartOpenClaw('docker')}
                            disabled={isStarting || isDetecting || isBootstrapping}
                            aria-label="启动 Docker 容器"
                            title="启动 Docker 容器"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isStarting ? <span className="text-xs">…</span> : <DockerIcon />}
                          </button>
                        )}
                        {canStartNative && (
                          <button
                            onClick={() => handleStartOpenClaw('native')}
                            disabled={isStarting || isDetecting || isBootstrapping}
                            aria-label="启动本机进程"
                            title="启动本机进程"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isStarting ? <span className="text-xs">…</span> : <PlayIcon />}
                          </button>
                        )}
                      </div>
                    )}
                    {startMessage && !error && (
                      <div className="inline-flex rounded-full border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.08)] px-3 py-1 text-xs font-medium text-[hsl(var(--success))]">
                        {startMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                mode: 'auto' as SetupMode,
                title: '自动部署并绑定',
                description: '适用于本机尚未运行 OpenClaw，需要完整执行 7 步引导。'
              },
              {
                mode: 'manual' as SetupMode,
                title: '切换到手动配置',
                description: '适用于需要自定义地址、认证方式或远程连接参数。'
              },
              {
                mode: 'skip' as SetupMode,
                title: '跳过部署直接绑定',
                description: '适用于本机已经有可用实例，只需创建连接并绑定工作区。'
              }
            ].map((option) => {
              const selected = selectedMode === option.mode

              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => handleModeChange(option.mode)}
                  className={`rounded-workshop-lg border p-4 text-left shadow-workshop-sm transition-colors ${
                    selected
                      ? 'border-[hsl(var(--primary)_/_0.24)] bg-[hsl(var(--primary)_/_0.08)]'
                      : 'border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] hover:bg-[hsl(var(--accent)_/_0.35)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{option.title}</h3>
                    {selected && (
                      <span className="rounded-full bg-[hsl(var(--primary))] px-2 py-1 text-xs font-medium text-[hsl(var(--primary-foreground))]">
                        当前模式
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{option.description}</p>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleBootstrap}
              disabled={isDetecting || isBootstrapping || phase === 'detect'}
              className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBootstrapping
                ? '执行中...'
                : selectedMode === 'manual'
                  ? '前往手动向导'
                  : selectedMode === 'skip'
                    ? '跳过部署并完成绑定'
                    : '开始自动引导'}
            </button>
            {failedStep && (
              <button
                onClick={handleBootstrap}
                disabled={isBootstrapping}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
              >
                重试自动引导
              </button>
            )}
          </div>
          {isOpenClawRunning && (
            <button
              type="button"
              onClick={() => setShowRunningHint((previous) => !previous)}
              className="flex w-full items-start justify-between gap-3 rounded-full border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.08)] px-4 py-2 text-left text-sm text-[hsl(var(--success))] transition-colors hover:bg-[hsl(var(--google-green)_/_0.12)]"
            >
              <span className="min-w-0">
                <span className="font-medium">当前 OpenClaw 已运行</span>
                <span className="ml-2 text-[hsl(var(--muted-foreground))]">
                  {showRunningHint ? '点击收起提示' : '点击查看说明'}
                </span>
                {showRunningHint && (
                  <span className="block pt-1 text-[hsl(var(--success))]">
                    若需要重新启动，请先点击“重置向导”并重新检测。
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[hsl(var(--muted-foreground))]">
                <ChevronIcon expanded={showRunningHint} />
              </span>
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="完成状态" description="成功后可直接进入首页或配置中心继续操作。">
        {isComplete ? (
          <div className="space-y-4">
            <div className="rounded-workshop-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] p-6 shadow-workshop-sm">
              <h3 className="mb-3 text-lg font-semibold text-[hsl(var(--success))]">✓ 自动配置完成</h3>
              <div className="space-y-2 text-sm text-[hsl(var(--success))]">
                <p>连接档案已创建并绑定到当前 Workspace。</p>
                <p>默认地址：http://127.0.0.1:18789 / ws://127.0.0.1:18789</p>
                <p>执行模式：{selectedMode === 'skip' ? '跳过部署，直接绑定现有实例' : '自动部署并完成绑定'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
              >
                进入首页
              </button>
              <button
                onClick={() => navigate('/openclaw-config')}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
              >
                打开配置中心
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {phase === 'complete' && !bootstrapResult?.success
                ? '自动引导未完成，请查看上方失败步骤并重试。'
                : '完成结果会在这里展示。当前你可以先执行自动检测，再选择合适的引导模式。'}
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
