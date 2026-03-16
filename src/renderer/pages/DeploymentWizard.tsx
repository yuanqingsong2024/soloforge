import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'

type DeploymentType = 'LOCAL_HOST' | 'LOCAL_DOCKER' | 'REMOTE_HOST' | 'REMOTE_DOCKER'
type EnvType = 'DEV' | 'STAGING' | 'PROD'
type WizardStep = 1 | 2 | 3 | 4

interface PrecheckResult {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    message: string
  }>
}

export function DeploymentWizard() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Type Selection
  const [selectedType, setSelectedType] = useState<DeploymentType>('LOCAL_HOST')

  // Step 2: Configuration
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('18789')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshPassword, setSshPassword] = useState('')
  const [envType, setEnvType] = useState<EnvType>('DEV')
  const [dockerEnabled, setDockerEnabled] = useState(false)

  // Step 3: Precheck
  const [precheckResult, setPrecheckResult] = useState<PrecheckResult | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)

  // Step 4: Deploy
  const [deployResult, setDeployResult] = useState<string | null>(null)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
    })
  }, [])

  const deploymentTypes = [
    {
      id: 'LOCAL_HOST' as DeploymentType,
      label: '本地原生',
      description: '在本机直接运行 OpenClaw（使用 npm/pm2）',
      icon: '💻'
    },
    {
      id: 'LOCAL_DOCKER' as DeploymentType,
      label: '本地 Docker',
      description: '在本机使用 Docker Compose 运行 OpenClaw',
      icon: '🐳'
    },
    {
      id: 'REMOTE_HOST' as DeploymentType,
      label: '远程原生',
      description: '通过 SSH 在远程服务器运行 OpenClaw（使用 npm/pm2）',
      icon: '🌐'
    },
    {
      id: 'REMOTE_DOCKER' as DeploymentType,
      label: '远程 Docker',
      description: '通过 SSH 在远程服务器使用 Docker Compose 运行 OpenClaw',
      icon: '🚀'
    }
  ]

  const handleNext = async () => {
    if (currentStep === 1) {
      setCurrentStep(2)
    } else if (currentStep === 2) {
      await handleCreateTarget()
    } else if (currentStep === 3) {
      await handleDeploy()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep)
      setError(null)
    }
  }

  const handleCreateTarget = async () => {
    if (!apiPort) return
    if (!name.trim()) {
      setError('请输入部署名称')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Create target
      const createResponse = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          targetType: selectedType,
          connectionMode: selectedType.startsWith('REMOTE') ? 'SSH' : 'LOCAL',
          host: selectedType.startsWith('REMOTE') ? host : undefined,
          port: parseInt(port),
          sshUser: selectedType.startsWith('REMOTE') ? sshUser : undefined,
          sshPort: selectedType.startsWith('REMOTE') ? parseInt(sshPort) : undefined,
          dockerEnabled: selectedType.includes('DOCKER') || dockerEnabled,
          tailscaleEnabled: false,
          envType,
          status: 'UNKNOWN',
          metadata: JSON.stringify({
            sshPassword: selectedType.startsWith('REMOTE') ? sshPassword : undefined
          })
        })
      })

      if (!createResponse.ok) {
        const errorData = await createResponse.json()
        throw new Error(errorData.message || '创建部署目标失败')
      }

      const target = await createResponse.json()
      setTargetId(target.id)

      // Run precheck
      const precheckResponse = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${target.id}/precheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!precheckResponse.ok) {
        const errorData = await precheckResponse.json()
        throw new Error(errorData.message || '预检查失败')
      }

      const precheckData = await precheckResponse.json()
      setPrecheckResult(precheckData)
      setCurrentStep(3)
    } catch (err) {
      console.error('Failed to create target:', err)
      setError(err instanceof Error ? err.message : '创建部署目标失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeploy = async () => {
    if (!apiPort || !targetId) return
    if (!precheckResult?.passed) {
      setError('预检查未通过，无法部署')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${targetId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const result = await response.json()

      if (result.status === 'pending_approval') {
        setDeployResult(`部署请求已提交审批（审批 ID: ${result.approvalId}）\n\n请在审批中心查看并批准`)
        setCurrentStep(4)
        return
      }

      if (!response.ok) {
        throw new Error(result.message || '部署失败')
      }

      setDeployResult('部署成功！OpenClaw 已安装并启动。')
      setCurrentStep(4)
    } catch (err) {
      console.error('Failed to deploy:', err)
      setError(err instanceof Error ? err.message : '部署失败')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (currentStep === 1) return true
    if (currentStep === 2) {
      if (!name.trim()) return false
      if (selectedType.startsWith('REMOTE')) {
        return host.trim() && sshUser.trim() && sshPassword.trim()
      }
      return true
    }
    if (currentStep === 3) {
      return precheckResult?.passed || false
    }
    return false
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="新建部署"
        description="通过向导创建新的 OpenClaw 部署目标"
        actions={
          <button
            onClick={() => navigate('/deployments')}
            className="px-4 py-2 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:bg-[hsl(var(--muted)/0.8)] transition-colors"
          >
            取消
          </button>
        }
      />

      {/* Progress Steps */}
      <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] p-6">
        <div className="flex items-center justify-between">
          {[
            { step: 1, label: '选择类型' },
            { step: 2, label: '配置' },
            { step: 3, label: '预检查' },
            { step: 4, label: '部署' }
          ].map((item, index) => (
            <div key={item.step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                    currentStep >= item.step
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  {item.step}
                </div>
                <span className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{item.label}</span>
              </div>
              {index < 3 && (
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

      {/* Step Content */}
      <div className="bg-[hsl(var(--card))] rounded-workshop-lg border border-[hsl(var(--border))] p-6">
        {/* Step 1: Type Selection */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">选择部署类型</h2>
            <div className="grid grid-cols-2 gap-4">
              {deploymentTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`p-6 rounded-workshop-lg border-2 text-left transition-all ${
                    selectedType === type.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
                  }`}
                >
                  <div className="text-4xl mb-3">{type.icon}</div>
                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">
                    {type.label}
                  </h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {type.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">配置部署参数</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  部署名称 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 生产环境 OpenClaw"
                  className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                />
              </div>

              {selectedType.startsWith('REMOTE') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                      主机地址 *
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="例如: 192.168.1.100"
                      className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                        SSH 用户 *
                      </label>
                      <input
                        type="text"
                        value={sshUser}
                        onChange={(e) => setSshUser(e.target.value)}
                        placeholder="例如: root"
                        className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                        SSH 端口
                      </label>
                      <input
                        type="number"
                        value={sshPort}
                        onChange={(e) => setSshPort(e.target.value)}
                        className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                      SSH 密码 *
                    </label>
                    <input
                      type="password"
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      placeholder="SSH 密码（将安全存储在系统 Keychain）"
                      className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  OpenClaw 端口
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  环境类型
                </label>
                <select
                  value={envType}
                  onChange={(e) => setEnvType(e.target.value as EnvType)}
                  className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                >
                  <option value="DEV">开发环境</option>
                  <option value="STAGING">预发布环境</option>
                  <option value="PROD">生产环境</option>
                </select>
              </div>

              {!selectedType.includes('DOCKER') && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="dockerEnabled"
                    checked={dockerEnabled}
                    onChange={(e) => setDockerEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="dockerEnabled" className="text-sm text-[hsl(var(--foreground))]">
                    启用 Docker 支持（可选）
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Precheck */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">预检查结果</h2>
            {precheckResult ? (
              <div className="space-y-3">
                {precheckResult.checks.map((check, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-workshop-md border ${
                      check.passed
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start">
                      <span className="text-2xl mr-3">
                        {check.passed ? '✅' : '❌'}
                      </span>
                      <div className="flex-1">
                        <h4 className="font-medium text-[hsl(var(--foreground))]">
                          {check.name}
                        </h4>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                          {check.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {!precheckResult.passed && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-workshop-md p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>警告：</strong>预检查未通过，请修复上述问题后重试。
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">正在运行预检查...</p>
            )}
          </div>
        )}

        {/* Step 4: Deploy */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">部署结果</h2>
            {deployResult ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-workshop-md p-6 text-center">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="text-lg text-green-800 whitespace-pre-line">{deployResult}</p>
                </div>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => navigate(`/deployments/${targetId}`)}
                    className="px-6 py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 transition-opacity"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={() => navigate('/deployments')}
                    className="px-6 py-3 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:bg-[hsl(var(--muted)/0.8)] transition-colors"
                  >
                    返回列表
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">正在部署...</p>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-workshop-md p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Navigation Buttons */}
        {currentStep < 4 && (
          <div className="flex justify-between mt-8 pt-6 border-t border-[hsl(var(--border))]">
            <button
              onClick={handleBack}
              disabled={currentStep === 1 || loading}
              className="px-6 py-2 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-workshop-md hover:bg-[hsl(var(--muted)/0.8)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              上一步
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="px-6 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? '处理中...' : currentStep === 3 ? '开始部署' : '下一步'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
