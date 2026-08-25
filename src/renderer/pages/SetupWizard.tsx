import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

type WizardStep = 1 | 2 | 3

interface FormData {
  name: string
  baseUrl: string
  wsUrl: string
  authMode: 'token' | 'password' | 'trusted-proxy'
  token: string
  password: string
  edgeToken: string
}

interface PingResult {
  success: boolean
  error?: string
}

export function SetupWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>('00000000-0000-0000-0000-000000000001')

  const [formData, setFormData] = useState<FormData>({
    name: '',
    baseUrl: 'http://127.0.0.1:18789',
    wsUrl: 'ws://127.0.0.1:18789',
    authMode: 'token',
    token: '',
    password: '',
    edgeToken: ''
  })

  const [pingResult, setPingResult] = useState<PingResult | null>(null)
  const [bindingSuccess, setBindingSuccess] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const storedWorkspaceId = readWorkspaceId()
    if (storedWorkspaceId) {
      setWorkspaceId(storedWorkspaceId)
    }
  }, [])

  const handleNext = async () => {
    if (currentStep === 1) {
      await handleCreateProfile()
    } else if (currentStep === 2) {
      await handleSaveCredentials()
    }
  }

  const handleBack = () => {
    if (currentStep > 1 && currentStep < 3) {
      setCurrentStep((prev) => (prev - 1) as WizardStep)
      setError(null)
    }
  }

  const handleCreateProfile = async () => {
    if (!formData.name.trim()) {
      setError('连接名称不能为空')
      return
    }
    if (!formData.baseUrl.trim()) {
      setError('Claude Code 地址不能为空')
      return
    }
    if (!formData.wsUrl.trim()) {
      setError('WebSocket 地址不能为空')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const profile = await apiFetch<{ id: string }>('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name.trim(),
          baseUrl: formData.baseUrl.trim(),
          wsUrl: formData.wsUrl.trim(),
          authMode: formData.authMode
        })
      })

      setProfileId(profile.id)
      setCurrentStep(2)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCredentials = async () => {
    if (!profileId) return

    if (formData.authMode === 'token' && !formData.token.trim()) {
      setError('Token 不能为空')
      return
    }
    if (formData.authMode === 'password' && !formData.password.trim()) {
      setError('Password 不能为空')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const body: Record<string, string> = {}
      if (formData.token.trim()) body.token = formData.token.trim()
      if (formData.password.trim()) body.password = formData.password.trim()
      if (formData.edgeToken.trim()) body.edgeToken = formData.edgeToken.trim()

      await apiFetch(`/api/profiles/${profileId}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })

      setCurrentStep(3)
      await handleAutoTestAndBind()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleAutoTestAndBind = async () => {
    if (!profileId) {
      setError(`缺少必要参数：profileId=${profileId}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('[SetupWizard] 开始健康检查')
      
      // 先测试本地 API 服务器是否可用
      let apiHealthy = false
      let lastError = ''
      for (let i = 0; i < 3; i++) {
        try {
          console.log(`[SetupWizard] 健康检查尝试 ${i + 1}/3`)
          const healthCheck = await apiFetch<{ status: string }>('/api/health', {
            method: 'GET'
          })
          console.log('[SetupWizard] 健康检查响应:', healthCheck)
          apiHealthy = true
          console.log('[SetupWizard] 健康检查成功')
          break
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          console.error(`[SetupWizard] 健康检查失败 (尝试 ${i + 1}/3):`, lastError)
          if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000)) // 等待 1 秒后重试
          }
        }
      }

      if (!apiHealthy) {
        throw new Error(`本地 API 服务器未响应。最后错误: ${lastError}`)
      }

      console.log('[SetupWizard] 开始 Claude Code ping 测试')
      const pingData = await apiFetch<PingResult>('/api/openclaw/ping', {
        method: 'POST',
        body: JSON.stringify({ profileId })
      })

      console.log('[SetupWizard] Ping 结果:', pingData)
      setPingResult(pingData)

      if (!pingData.success) {
        setError(`连接测试失败：${pingData.error || '未知错误'}`)
        return
      }

      await apiFetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: 'POST',
        body: JSON.stringify({
          profileId,
          isDefault: true
        })
      })

      setBindingSuccess(true)

      await apiFetch('/api/setup/complete', {
        method: 'POST',
        body: JSON.stringify({ workspaceId })
      })

      setSetupComplete(true)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[SetupWizard] 错误:', errMsg)
      setError(errMsg)
      setPingResult({ success: false, error: errMsg })
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (currentStep === 1) {
      return formData.name.trim() && formData.baseUrl.trim() && formData.wsUrl.trim()
    }
    if (currentStep === 2) {
      if (formData.authMode === 'token') return formData.token.trim()
      if (formData.authMode === 'password') return formData.password.trim()
      return true
    }
    return false
  }

  const handleUseLocalTemplate = () => {
    setFormData({
      ...formData,
      name: 'Local OpenClaw',
      baseUrl: 'http://127.0.0.1:18789',
      wsUrl: 'ws://127.0.0.1:18789'
    })
  }

  const handleGoToDashboard = () => {
    navigate('/')
  }

  const handleGoToConfigCenter = () => {
    navigate('/openclaw-config')
  }

  const generateToken = () => {
    // 生成安全的随机 token（sk- 前缀 + 32 字符）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let token = 'sk-'
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setFormData({ ...formData, token })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="快速配置向导"
        description="按步骤完成 OpenClaw 连接配置"
        actions={
          currentStep < 3 && (
            <button
              onClick={() => navigate('/')}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              稍后配置
            </button>
          )
        }
      />

      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          {[
            { step: 1, label: '连接配置' },
            { step: 2, label: '凭证配置' },
            { step: 3, label: '测试与绑定' }
          ].map((item, index) => (
            <div key={item.step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-medium shadow-sm ${
                    currentStep >= item.step
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  {item.step}
                </div>
                <span className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  {item.label}
                </span>
              </div>
              {index < 2 && (
                <div
                  className={`h-1 flex-1 mx-4 ${
                    currentStep > item.step
                      ? 'bg-[hsl(var(--primary))]'
                      : 'bg-[hsl(var(--muted))]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-4 shadow-sm">
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {currentStep === 1 && (
        <SectionCard title="连接配置" description="配置 OpenClaw 连接信息">
          <div className="space-y-4">
            <div className="flex gap-3 mb-4">
              <button
                onClick={handleUseLocalTemplate}
                className="rounded-full border border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.08)] px-4 py-2 text-sm text-[hsl(var(--google-blue))] hover:bg-[hsl(var(--google-blue)_/_0.14)]"
              >
                使用本地模板
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                连接名称
              </label>
              <ThemeInput
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                fieldSize="lg"
                fieldShape="pill"
                placeholder="例如：Local OpenClaw"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                OpenClaw 地址
              </label>
              <ThemeInput
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                fieldSize="lg"
                fieldShape="pill"
                placeholder="http://127.0.0.1:18789"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                WebSocket 地址
              </label>
              <ThemeInput
                type="text"
                value={formData.wsUrl}
                onChange={(e) => setFormData({ ...formData, wsUrl: e.target.value })}
                fieldSize="lg"
                fieldShape="pill"
                placeholder="ws://127.0.0.1:18789"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                认证模式
              </label>
              <ThemeSelect
                value={formData.authMode}
                onChange={(e) => setFormData({ ...formData, authMode: e.target.value as 'token' | 'password' | 'trusted-proxy' })}
                fieldSize="lg"
                fieldShape="pill"
              >
                <option value="token">Token</option>
                <option value="password">Password</option>
                <option value="trusted-proxy">Trusted Proxy</option>
              </ThemeSelect>
            </div>
          </div>
        </SectionCard>
      )}

      {currentStep === 2 && (
        <SectionCard title="凭证配置" description="配置认证凭证">
          <div className="space-y-4">
            {formData.authMode === 'token' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                  Token
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ThemeInput
                      type={showToken ? 'text' : 'password'}
                      value={formData.token}
                      onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                      fieldSize="lg"
                      fieldShape="pill"
                      className="pr-10"
                      placeholder="输入 Token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      {showToken ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateToken}
                    className="rounded-full border border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.08)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--google-blue))] hover:bg-[hsl(var(--google-blue)_/_0.14)] whitespace-nowrap"
                  >
                    生成 Token
                  </button>
                </div>
              </div>
            )}

            {formData.authMode === 'password' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                  Password
                </label>
                <div className="relative">
                  <ThemeInput
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    fieldSize="lg"
                    fieldShape="pill"
                    className="pr-10"
                    placeholder="输入 Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                X-Edge-Token（可选）
              </label>
              <ThemeInput
                type="password"
                value={formData.edgeToken}
                onChange={(e) => setFormData({ ...formData, edgeToken: e.target.value })}
                fieldSize="lg"
                fieldShape="pill"
                placeholder="留空表示不设置"
              />
            </div>
          </div>
        </SectionCard>
      )}

      {currentStep === 3 && (
        <SectionCard title="测试与绑定" description="自动测试连接并绑定到当前 Workspace">
          <div className="space-y-4">
            {loading && (
          <LoadingState message="正在测试连接..." />
            )}

            {!loading && pingResult && (
              <div>
                {pingResult.success ? (
                  <div className="rounded-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] p-4 shadow-sm">
                    <p className="text-sm text-[hsl(var(--success))]">✓ 连接测试成功</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-4 shadow-sm">
                    <p className="text-sm text-[hsl(var(--destructive))]">✗ 连接测试失败</p>
                    {pingResult.error && (
                      <p className="mt-2 text-sm text-[hsl(var(--destructive))]">{pingResult.error}</p>
                    )}
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-[hsl(var(--destructive))]">可能原因：</p>
                      <ul className="list-disc list-inside text-sm text-[hsl(var(--destructive))]">
                        <li>OpenClaw 服务未启动（检查 {formData.baseUrl}）</li>
                        <li>凭证错误（检查 token/password）</li>
                        <li>网络不可达（检查防火墙/代理）</li>
                      </ul>
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => setCurrentStep(1)}
                          className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                        >
                          返回修改连接配置
                        </button>
                        <button
                          onClick={() => setCurrentStep(2)}
                          className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                        >
                          返回修改凭证
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && bindingSuccess && (
              <div className="rounded-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] p-4 shadow-sm">
                <p className="text-sm text-[hsl(var(--success))]">✓ Workspace 绑定成功</p>
              </div>
            )}

            {!loading && setupComplete && (
              <div className="space-y-4">
                <div className="rounded-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[hsl(var(--success))] mb-4">✓ 配置完成！</h3>
                  <div className="space-y-2 text-sm text-[hsl(var(--success))]">
                    <p><strong>连接名称：</strong>{formData.name}</p>
                    <p><strong>连接地址：</strong>{formData.baseUrl}</p>
                    <p><strong>认证模式：</strong>{formData.authMode}</p>
                    <p><strong>连接状态：</strong>健康</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleGoToDashboard}
                    className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  >
                    进入工单看板
                  </button>
                  <button
                    onClick={handleGoToConfigCenter}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    进入配置中心
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {currentStep < 3 && (
        <div className="flex justify-between mt-8 pt-6 border-t border-[hsl(var(--border))]">
          <button
            onClick={handleBack}
            disabled={currentStep === 1 || loading}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-6 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一步
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition-opacity"
          >
            {loading ? '处理中...' : '下一步'}
          </button>
        </div>
      )}
    </div>
  )
}
