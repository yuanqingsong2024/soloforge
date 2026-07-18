import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { useTranslation } from 'react-i18next'
import { useEnumTranslation } from '../lib/i18n-helpers'
import { ThemeCheckbox, ThemeInput, ThemeNumberInput, ThemeSelect } from '../components/ui/FormFields'

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
  const { t } = useTranslation(['deployment', 'common'])
  const translateType = useEnumTranslation('deploymentTypeMap')
  
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
      label: translateType('LOCAL_HOST'),
      description: t('deployment:wizard.types.localHost.description'),
      icon: '💻'
    },
    {
      id: 'LOCAL_DOCKER' as DeploymentType,
      label: translateType('LOCAL_DOCKER'),
      description: t('deployment:wizard.types.localDocker.description'),
      icon: '🐳'
    },
    {
      id: 'REMOTE_HOST' as DeploymentType,
      label: translateType('REMOTE_HOST'),
      description: t('deployment:wizard.types.remoteHost.description'),
      icon: '🌐'
    },
    {
      id: 'REMOTE_DOCKER' as DeploymentType,
      label: translateType('REMOTE_DOCKER'),
      description: t('deployment:wizard.types.remoteDocker.description'),
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
      setError(t('deployment:wizard.errors.nameRequired'))
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
        throw new Error(errorData.message || t('deployment:wizard.errors.createFailed'))
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
        throw new Error(errorData.message || t('deployment:wizard.errors.precheckFailed'))
      }

      const precheckData = await precheckResponse.json()
      setPrecheckResult(precheckData)
      setCurrentStep(3)
    } catch (err) {
      console.error('Failed to create target:', err)
      setError(err instanceof Error ? err.message : t('deployment:wizard.errors.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleDeploy = async () => {
    if (!apiPort || !targetId) return
    if (!precheckResult?.passed) {
      setError(t('deployment:wizard.errors.precheckNotPassed'))
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
        setDeployResult(t('deployment:wizard.deployPendingApproval', { approvalId: result.approvalId }))
        setCurrentStep(4)
        return
      }

      if (!response.ok) {
        throw new Error(result.message || t('deployment:wizard.errors.deployFailed'))
      }

      setDeployResult(t('deployment:wizard.deploySuccess'))
      setCurrentStep(4)
    } catch (err) {
      console.error('Failed to deploy:', err)
      setError(err instanceof Error ? err.message : t('deployment:wizard.errors.deployFailed'))
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
        title={t('deployment:wizard.title')}
        description={t('deployment:wizard.description')}
        actions={
          <button
            onClick={() => navigate('/deployments')}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
          >
            {t('common:cancel')}
          </button>
        }
      />

      {/* Progress Steps */}
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
        <div className="flex items-center justify-between">
          {[
            { step: 1, label: t('deployment:wizard.steps.selectType') },
            { step: 2, label: t('deployment:wizard.steps.configure') },
            { step: 3, label: t('deployment:wizard.steps.precheck') },
            { step: 4, label: t('deployment:wizard.steps.deploy') }
          ].map((item, index) => (
            <div key={item.step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-medium shadow-workshop-sm ${
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
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
        {/* Step 1: Type Selection */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{t('deployment:wizard.selectDeploymentType')}</h2>
            <div className="grid grid-cols-2 gap-4">
              {deploymentTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`rounded-workshop-lg border-2 p-6 text-left transition-all shadow-workshop-sm ${
                    selectedType === type.id
                      ? 'border-[hsl(var(--google-blue)_/_0.26)] bg-[hsl(var(--google-blue)_/_0.08)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--google-blue)_/_0.22)] hover:bg-[hsl(var(--accent)_/_0.36)]'
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
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{t('deployment:wizard.configureParameters')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  {t('deployment:wizard.fields.name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('deployment:wizard.placeholders.name')}
                  className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                />
              </div>

              {selectedType.startsWith('REMOTE') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                      {t('deployment:wizard.fields.host')}
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder={t('deployment:wizard.placeholders.host')}
                      className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                        {t('deployment:wizard.fields.sshUser')}
                      </label>
                      <ThemeInput type="text" value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder={t('deployment:wizard.placeholders.sshUser')} fieldSize="lg" fieldShape="pill" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                        {t('deployment:wizard.fields.sshPort')}
                      </label>
                      <ThemeNumberInput value={sshPort} onChange={(e) => setSshPort(e.target.value)} fieldSize="lg" fieldShape="pill" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                      {t('deployment:wizard.fields.sshPassword')}
                    </label>
                    <ThemeInput type="password" value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} placeholder={t('deployment:wizard.placeholders.sshPassword')} fieldSize="lg" fieldShape="pill" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  {t('deployment:wizard.fields.openclawPort')}
                </label>
                <ThemeNumberInput value={port} onChange={(e) => setPort(e.target.value)} fieldSize="lg" fieldShape="pill" />
              </div>

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  {t('deployment:wizard.fields.envType')}
                </label>
                <ThemeSelect value={envType} onChange={(e) => setEnvType(e.target.value as EnvType)} fieldSize="lg" fieldShape="pill">
                  <option value="DEV">{t('deployment:envTypes.DEV')}</option>
                  <option value="STAGING">{t('deployment:envTypes.STAGING')}</option>
                  <option value="PROD">{t('deployment:envTypes.PROD')}</option>
                </ThemeSelect>
              </div>

              {!selectedType.includes('DOCKER') && (
                <div className="flex items-center space-x-2">
                  <ThemeCheckbox id="dockerEnabled" checked={dockerEnabled} onChange={(e) => setDockerEnabled(e.target.checked)} />
                  <label htmlFor="dockerEnabled" className="text-sm text-[hsl(var(--foreground))]">
                    {t('deployment:wizard.fields.dockerEnabled')}
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Precheck */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{t('deployment:wizard.precheckResult')}</h2>
            {precheckResult ? (
              <div className="space-y-3">
                {precheckResult.checks.map((check, index) => (
                  <div
                    key={index}
                    className={`rounded-workshop-lg border p-4 shadow-workshop-sm ${
                      check.passed
                        ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.08)]'
                        : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.08)]'
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
                  <div className="rounded-workshop-lg border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.16)] p-4 shadow-workshop-sm">
                    <p className="text-sm text-[hsl(var(--foreground))]">
                      <strong>{t('common:warning')}：</strong>{t('deployment:wizard.precheckWarning')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">{t('deployment:wizard.runningPrecheck')}</p>
            )}
          </div>
        )}

        {/* Step 4: Deploy */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{t('deployment:wizard.deployResult')}</h2>
            {deployResult ? (
              <div className="space-y-4">
                <div className="rounded-workshop-lg border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.1)] p-6 text-center shadow-workshop-sm">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="text-lg text-[hsl(var(--success))] whitespace-pre-line">{deployResult}</p>
                </div>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => navigate(`/deployments/${targetId}`)}
                    className="rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  >
                    {t('deployment:wizard.viewDetail')}
                  </button>
                  <button
                    onClick={() => navigate('/deployments')}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-6 py-3 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    {t('deployment:wizard.backToList')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">{t('deployment:wizard.deploying')}</p>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-6 rounded-workshop-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-4 shadow-workshop-sm">
            <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
          </div>
        )}

        {/* Navigation Buttons */}
        {currentStep < 4 && (
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
              {loading ? '处理中...' : currentStep === 3 ? '开始部署' : '下一步'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
