import React, { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { apiFetch } from '../lib/api'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LoadingState, Button } from '../components/ui'
import { EmptyState } from '../components/ui/EmptyState'
import { PendingApprovalNotice } from '../components/ui/PendingApprovalNotice'
import { FormField, FormHint, FormLabel, ThemeCheckbox, ThemeInput, ThemeSelect, ThemeTextarea } from '../components/ui/FormFields'
import { readLocalStorage } from '../lib/storage'

interface ConnectionProfile {
  id: string
  name: string
  baseUrl: string
  wsUrl: string
  authMode: string
}

interface ConfigSnapshot {
  id: string
  profileId: string
  configHash: string
  configJson: string
  createdAt: string
}

interface RateLimitInfo {
  allowed: boolean
  remaining: number
  resetIn: number
}

interface ApplyStatus {
  type: 'success' | 'error' | 'pending' | 'rate_limited'
  message: string
}

interface PendingApprovalState {
  action: 'apply' | 'rollback'
  approvalId: string
}

type DisplayMode = 'basic' | 'advanced' | 'expert'

function resolveDisplayMode(): DisplayMode {
  const stored = readLocalStorage('soloforge-display-mode')
  return stored === 'advanced' || stored === 'expert' ? stored : 'basic'
}

export function ConfigCenter() {
  const { t } = useTranslation(['config', 'common'])
  const navigate = useNavigate()
  const displayMode = resolveDisplayMode()
  const canUseRawJson = displayMode !== 'basic'
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [currentConfig, setCurrentConfig] = useState<Record<string, unknown> | null>(null)
  const [editedConfig, setEditedConfig] = useState<Record<string, unknown> | null>(null)
  const [rawJson, setRawJson] = useState<string>('')
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([])
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'form' | 'json' | 'diff' | 'snapshots'>('form')
  const [applyStatus, setApplyStatus] = useState<ApplyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null)
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  // Form state
  const [formDefaultModel, setFormDefaultModel] = useState('')
  const [formFallbacks, setFormFallbacks] = useState('')
  const [formAllowlist, setFormAllowlist] = useState('')
  const [formHooksEnabled, setFormHooksEnabled] = useState(false)
  const [formHooksToken, setFormHooksToken] = useState('')
  const [formHooksPath, setFormHooksPath] = useState('')
  const [formToolsPolicy, setFormToolsPolicy] = useState('deny')
  const [formToolsBlocklist, setFormToolsBlocklist] = useState('')
  const [formAuthMode, setFormAuthMode] = useState('token')
  const [formTrustedProxies, setFormTrustedProxies] = useState('')
  const [formChannelsEnabled, setFormChannelsEnabled] = useState(false)
  const [formChannelsMappings, setFormChannelsMappings] = useState('')

  useEffect(() => {
    if (!canUseRawJson && activeTab === 'json') {
      setActiveTab('form')
    }
  }, [activeTab, canUseRawJson])

  useEffect(() => {
    void fetchProfiles()
  }, [])

  // Countdown timer for rate limiting
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Refresh rate limit when countdown expires
          if (selectedProfileId) {
            void fetchRateLimit(selectedProfileId)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown, selectedProfileId])

  const fetchProfiles = async () => {
    try {
      const data = await apiFetch<ConnectionProfile[]>('/api/profiles')
      setProfiles(data)
    } catch (err) {
      console.error('Failed to fetch profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchConfig = async (profileId: string) => {
    setConfigLoading(true)
    setApplyStatus(null)

    try {
      const [configData, snapshotsData] = await Promise.all([
        apiFetch<Record<string, unknown>>(`/api/openclaw/${profileId}/config`),
        apiFetch<ConfigSnapshot[]>(`/api/config/snapshots?profileId=${profileId}`)
      ])

      setCurrentConfig(configData)
      setEditedConfig(JSON.parse(JSON.stringify(configData)))
      setRawJson(JSON.stringify(configData, null, 2))
      populateForm(configData)

      setSnapshots(snapshotsData)
      await fetchRateLimit(profileId)
    } catch (err) {
      console.error('Failed to fetch config:', err)
      setApplyStatus({ type: 'error', message: t('config:status.connectFirst') })
    } finally {
      setConfigLoading(false)
    }
  }

  const fetchRateLimit = async (profileId: string) => {
    try {
      const data = await apiFetch<RateLimitInfo>(`/api/config/rate-limit?profileId=${profileId}`)
      setRateLimit(data)
      if (!data.allowed && data.resetIn > 0) {
        setCountdown(Math.ceil(data.resetIn / 1000))
      }
    } catch (err) {
      console.error('Failed to fetch rate limit:', err)
    }
  }

  const populateForm = (config: Record<string, unknown>) => {
    setFormDefaultModel((config.defaultModel as string) || '')
    const fallbacks = config.fallbacks
    setFormFallbacks(Array.isArray(fallbacks) ? fallbacks.join(', ') : '')
    const allowlist = config.allowlist
    setFormAllowlist(Array.isArray(allowlist) ? allowlist.join(', ') : '')

    const hooks = config.hooks as Record<string, unknown> | undefined
    setFormHooksEnabled(!!hooks?.enabled)
    setFormHooksToken((hooks?.token as string) || '')
    setFormHooksPath((hooks?.path as string) || '')

    const tools = config.tools as Record<string, unknown> | undefined
    setFormToolsPolicy((tools?.defaultPolicy as string) || 'deny')
    const blocklist = tools?.blocklist
    setFormToolsBlocklist(Array.isArray(blocklist) ? blocklist.join('\n') : '')

    const gateway = config.gateway as Record<string, unknown> | undefined
    const auth = gateway?.auth as Record<string, unknown> | undefined
    setFormAuthMode((auth?.mode as string) || 'token')
    const proxies = gateway?.trustedProxies
    setFormTrustedProxies(Array.isArray(proxies) ? proxies.join('\n') : '')

    const channels = config.channels as Record<string, unknown> | undefined
    setFormChannelsEnabled(!!channels?.enabled)
    const mappings = channels?.mappings
    if (Array.isArray(mappings)) {
      setFormChannelsMappings(
        mappings
          .filter(item => typeof item === 'object' && item !== null)
          .map(item => {
            const mapping = item as Record<string, unknown>
            const channel = typeof mapping.channel === 'string' ? mapping.channel : ''
            const target = typeof mapping.target === 'string' ? mapping.target : ''
            return `${channel}:${target}`
          })
          .filter(Boolean)
          .join('\n')
      )
    } else {
      setFormChannelsMappings('')
    }
  }
  const buildConfigFromForm = (): Record<string, unknown> => {
    const base = editedConfig ? { ...editedConfig } : {}
    return {
      ...base,
      defaultModel: formDefaultModel,
      fallbacks: formFallbacks.split(',').map(s => s.trim()).filter(Boolean),
      allowlist: formAllowlist.split(',').map(s => s.trim()).filter(Boolean),
      hooks: {
        enabled: formHooksEnabled,
        token: formHooksToken,
        path: formHooksPath
      },
      tools: {
        defaultPolicy: formToolsPolicy,
        blocklist: formToolsBlocklist.split('\n').map(s => s.trim()).filter(Boolean)
      },
      gateway: {
        auth: { mode: formAuthMode },
        trustedProxies: formTrustedProxies.split('\n').map(s => s.trim()).filter(Boolean)
      },
      channels: {
        enabled: formChannelsEnabled,
        mappings: formChannelsMappings
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const [channelPart, ...targetParts] = line.split(':')
            return {
              channel: channelPart?.trim() || '',
              target: targetParts.join(':').trim()
            }
          })
          .filter(item => item.channel && item.target)
      }
    }
  }

  const handleApply = async (configToApply?: Record<string, unknown>) => {
    if (!selectedProfileId) return
    setApplying(true)
    setApplyStatus(null)
    setPendingApproval(null)

    const config = configToApply || (activeTab === 'json' ? JSON.parse(rawJson) : buildConfigFromForm())

    try {
      const result = await apiFetch<{ status: string; approvalId?: string; message?: string; errors?: string[]; resetIn?: number }>('/api/config/apply', {
        method: 'POST',
        body: JSON.stringify({ profileId: selectedProfileId, config })
      })

      if (result.status === 'success') {
        setApplyStatus({ type: 'success', message: t('config:status.success') })
        setCurrentConfig(config)
        setEditedConfig(JSON.parse(JSON.stringify(config)))
        setRawJson(JSON.stringify(config, null, 2))
        populateForm(config as Record<string, unknown>)
        // Refresh snapshots and rate limit
        const snapshotsData = await apiFetch<ConfigSnapshot[]>(`/api/config/snapshots?profileId=${selectedProfileId}`)
        setSnapshots(snapshotsData)
        await fetchRateLimit(selectedProfileId)
      } else if (result.status === 'pending_approval') {
        setApplyStatus({ type: 'pending', message: `配置变更需要审批，审批ID: ${result.approvalId}` })
        setPendingApproval({ action: 'apply', approvalId: result.approvalId || '' })
      } else if (result.status === 'rate_limited') {
        setApplyStatus({ type: 'rate_limited', message: result.message ?? '' })
        if (result.resetIn) {
          setCountdown(Math.ceil(result.resetIn / 1000))
        }
      } else if (result.status === 'validation_error') {
        setApplyStatus({ type: 'error', message: `校验失败: ${result.errors?.join('; ')}` })
      } else {
        setApplyStatus({ type: 'error', message: t('config:status.applyFailed') })
      }
    } catch (err) {
      console.error('Failed to apply config:', err)
      setApplyStatus({ type: 'error', message: `应用失败: ${String(err)}` })
    } finally {
      setApplying(false)
    }
  }

  const handleRollback = async (snapshotId: string) => {
    if (!selectedProfileId || !confirm(t('config:confirm.rollback'))) return
    setApplying(true)
    setApplyStatus(null)
    setPendingApproval(null)

    try {
      const result = await apiFetch<{ status: string; approvalId?: string; message?: string }>('/api/config/rollback', {
        method: 'POST',
        body: JSON.stringify({ profileId: selectedProfileId, snapshotId })
      })

      if (result.status === 'success') {
        setApplyStatus({ type: 'success', message: t('config:status.rollbackSuccess') })
        await fetchConfig(selectedProfileId)
      } else if (result.status === 'pending_approval') {
        setApplyStatus({ type: 'pending', message: `配置回滚需要审批，审批ID: ${result.approvalId}` })
        setPendingApproval({ action: 'rollback', approvalId: result.approvalId || '' })
      } else if (result.status === 'rate_limited') {
        setApplyStatus({ type: 'rate_limited', message: result.message ?? '' })
      } else {
        setApplyStatus({ type: 'error', message: t('config:status.rollbackFailed') })
      }
    } catch (err) {
      console.error('Failed to rollback:', err)
      setApplyStatus({ type: 'error', message: t('config:status.rollbackFailed') })
    } finally {
      setApplying(false)
    }
  }

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId)
    setApplyStatus(null)
    setPendingApproval(null)
    setCurrentConfig(null)
    setEditedConfig(null)
    setRawJson('')
    setSnapshots([])
    if (profileId) {
      void fetchConfig(profileId)
    }
  }

  if (loading) {
    return (
      <LoadingState message={t('config:status.loading')} />
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card)_/_0.76)] px-6 py-5 shadow-sm backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t('config:pageTitle')}</h1>
      </div>

      {/* Profile Selector */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
        <label className="text-sm font-medium text-[hsl(var(--foreground))]">{t('config:connection.profileLabel')}</label>
        <select
          value={selectedProfileId}
          onChange={e => handleProfileChange(e.target.value)}
          className="min-w-64 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
        >
          <option value="">{t('config:selectProfile')}</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.baseUrl})</option>
          ))}
        </select>

        {rateLimit && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-3 py-2 text-sm shadow-sm">
            <span className="text-[hsl(var(--muted-foreground))]">{t('config:rateLimit.remaining')}:</span>
            <span className={`font-medium ${rateLimit.remaining > 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}`}>
              {rateLimit.remaining}/3
            </span>
            {countdown > 0 && (
              <span className="text-[hsl(var(--destructive))]">({countdown}s)</span>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('config:quickMode.title')}</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t(`config:quickMode.${displayMode}Desc`)}</div>
          </div>
          {!canUseRawJson && (
            <div className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.16)] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
              {t('config:quickMode.rawJsonHidden')}
            </div>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {applyStatus && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 shadow-sm ${
            applyStatus.type === 'success'
              ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
              : applyStatus.type === 'pending'
              ? 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]'
              : applyStatus.type === 'rate_limited'
              ? 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.14)] text-[hsl(var(--foreground))]'
              : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
          }`}
        >
          <p className="text-sm">{applyStatus.message}</p>
        </div>
      )}

      {pendingApproval && (
        <PendingApprovalNotice
          title={t('config:approval.inlineTitle')}
          description={t(`config:approval.${pendingApproval.action}Pending`, { approvalId: pendingApproval.approvalId })}
          primaryActionLabel={t('config:approval.goToApprovals')}
          secondaryActionLabel={t('config:approval.dismiss')}
          onPrimaryAction={() => navigate('/approvals')}
          onSecondaryAction={() => setPendingApproval(null)}
        />
      )}

      {!selectedProfileId ? (
        <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-12 shadow-sm">
          <EmptyState message={t('config:selectProfileToManage')} />
        </div>
      ) : configLoading ? (
        <LoadingState message={t('config:status.loadingConfig')} />
      ) : (
        <>
          {/* Tabs */}
          <div className="mb-6 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-2 shadow-sm">
            <nav className="flex flex-wrap gap-2">
              {([
                { key: 'form' as const, label: t('config:tabs.form') },
                ...(canUseRawJson ? [{ key: 'json' as const, label: t('config:tabs.json') }] : []),
                { key: 'diff' as const, label: t('config:tabs.diff') },
                { key: 'snapshots' as const, label: t('config:tabs.snapshots') }
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))] shadow-sm'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'form' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.08)] p-5 shadow-sm">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('config:quickMode.quickConfigTitle')}</div>
                <div className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t('config:quickMode.quickConfigDesc')}</div>
              </div>

              {/* 模型与路由 */}
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:models.title')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField>
                    <FormLabel>{t('config:models.defaultModel')}</FormLabel>
                    <ThemeInput type="text" value={formDefaultModel} onChange={e => setFormDefaultModel(e.target.value)} fieldSize="lg" fieldShape="pill" placeholder="gpt-4" />
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:models.fallbacks')}</FormLabel>
                    <ThemeTextarea value={formFallbacks} onChange={e => setFormFallbacks(e.target.value)} fieldSize="lg" fieldShape="soft" rows={2} placeholder="gpt-3.5-turbo, claude-3-sonnet" />
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:models.allowlist')}</FormLabel>
                    <ThemeTextarea value={formAllowlist} onChange={e => setFormAllowlist(e.target.value)} fieldSize="lg" fieldShape="soft" rows={2} placeholder="gpt-4, gpt-3.5-turbo, claude-3-sonnet" />
                  </FormField>
                </div>
              </div>

              {/* Hooks */}
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:hooks.title')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center">
                    <ThemeCheckbox checked={formHooksEnabled} onChange={e => setFormHooksEnabled(e.target.checked)} />
                    <label className="ml-2 text-sm font-medium text-[hsl(var(--foreground))]">{t('config:hooks.enabled')}</label>
                  </div>
                  <FormField>
                    <FormLabel>{t('config:hooks.token')}</FormLabel>
                    <ThemeInput type="text" value={formHooksToken} onChange={e => setFormHooksToken(e.target.value)} fieldSize="lg" fieldShape="pill" />
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:hooks.path')}</FormLabel>
                    <ThemeInput type="text" value={formHooksPath} onChange={e => setFormHooksPath(e.target.value)} fieldSize="lg" fieldShape="pill" placeholder="/hooks" />
                  </FormField>
                </div>
              </div>

              {/* Tools 策略 */}
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:tools.title')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField>
                    <FormLabel>{t('config:tools.defaultPolicy')}</FormLabel>
                    <ThemeSelect
                      value={formToolsPolicy}
                      onChange={e => setFormToolsPolicy(e.target.value)}
                      fieldSize="lg"
                      className="rounded-full"
                    >
                      <option value="allow">{t('config:tools.allow')}</option>
                      <option value="deny">{t('config:tools.deny')}</option>
                    </ThemeSelect>
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:tools.blocklist')}</FormLabel>
                    <ThemeTextarea value={formToolsBlocklist} onChange={e => setFormToolsBlocklist(e.target.value)} fieldSize="lg" fieldShape="soft" rows={3} placeholder="dangerous_tool&#10;risky_command" />
                  </FormField>
                </div>
              </div>

              {/* Gateway 安全 */}
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:gateway.title')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField>
                    <FormLabel>{t('config:gateway.authMode')}</FormLabel>
                    <ThemeSelect
                      value={formAuthMode}
                      onChange={e => setFormAuthMode(e.target.value)}
                      fieldSize="lg"
                      className="rounded-full"
                    >
                      <option value="token">{t('config:connection.authModes.token')}</option>
                      <option value="password">{t('config:connection.authModes.password')}</option>
                      <option value="trusted-proxy">{t('config:connection.authModes.trustedProxy')}</option>
                      <option value="none">{t('config:connection.authModes.none')}</option>
                    </ThemeSelect>
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:gateway.trustedProxies')}</FormLabel>
                    <ThemeTextarea value={formTrustedProxies} onChange={e => setFormTrustedProxies(e.target.value)} fieldSize="lg" fieldShape="soft" rows={3} placeholder="10.0.0.1&#10;192.168.1.0/24" />
                  </FormField>
                </div>
              </div>

              {/* Channels 配置 */}
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:channels.title')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center">
                    <ThemeCheckbox checked={formChannelsEnabled} onChange={e => setFormChannelsEnabled(e.target.checked)} />
                    <label className="ml-2 text-sm font-medium text-[hsl(var(--foreground))]">{t('config:channels.enabled')}</label>
                  </div>
                  <FormField>
                    <FormLabel>{t('config:channels.mappings')}</FormLabel>
                    <ThemeTextarea value={formChannelsMappings} onChange={e => setFormChannelsMappings(e.target.value)} fieldSize="lg" fieldShape="soft" rows={4} placeholder="slack:#support\ntelegram:@ops_channel" />
                    <FormHint>{t('config:channels.hint')}</FormHint>
                  </FormField>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => handleApply()} loading={applying} disabled={!currentConfig}>
                  {t('config:actions.apply')}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
                <FormField>
                  <FormLabel>{t('config:rawJson.title')}</FormLabel>
                  <ThemeTextarea value={rawJson} onChange={e => setRawJson(e.target.value)} fieldSize="lg" fieldShape="soft" className="font-mono text-sm" style={{ minHeight: '400px' }} spellCheck={false} />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(rawJson)
                      handleApply(parsed)
                    } catch {
                      setApplyStatus({ type: 'error', message: t('config:status.jsonError') })
                    }
                  }}
                  loading={applying}
                  disabled={!currentConfig}
                >
                  {t('config:actions.apply')}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">{t('config:diff.current')}</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.42)] p-4 text-xs font-mono text-[hsl(var(--foreground))]">
                    {currentConfig ? JSON.stringify(currentConfig, null, 2) : t('config:diff.noConfig')}
                  </pre>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">{t('config:diff.modified')}</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.08)] p-4 text-xs font-mono text-[hsl(var(--foreground))]">
                    {activeTab === 'diff'
                      ? JSON.stringify(buildConfigFromForm(), null, 2)
                      : rawJson || t('config:diff.noConfig')
                    }
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'snapshots' && (
            <div className="overflow-hidden rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-sm">
              {snapshots.length === 0 ? (
                <div className="py-12 text-center text-[hsl(var(--muted-foreground))]">
                  {t('config:snapshots.noSnapshots')}
                </div>
              ) : (
                <table className="min-w-full divide-y divide-[hsl(var(--border)_/_0.8)]">
                  <thead className="bg-[hsl(var(--muted)_/_0.56)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('config:snapshots.sequence')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('config:snapshots.hash')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('config:snapshots.createdAt')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('common:form.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))]">
                    {snapshots.map((snapshot, index) => (
                      <React.Fragment key={snapshot.id}>
                        <tr>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-[hsl(var(--foreground))]">
                            #{snapshots.length - index}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-[hsl(var(--muted-foreground))]">
                            {snapshot.configHash.substring(0, 12)}...
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-[hsl(var(--muted-foreground))]">
                            {formatDateTime(snapshot.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <button
                              onClick={() => setExpandedSnapshotId(
                                expandedSnapshotId === snapshot.id ? null : snapshot.id
                              )}
                              className="mr-2 rounded-full border border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.08)] px-3 py-1.5 text-[hsl(var(--google-blue))] hover:bg-[hsl(var(--google-blue)_/_0.14)]"
                            >
                              {expandedSnapshotId === snapshot.id ? t('config:actions.collapse') : t('config:actions.view')}
                            </button>
                            <button
                              onClick={() => handleRollback(snapshot.id)}
                              disabled={applying}
                              className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.14)] px-3 py-1.5 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--google-yellow)_/_0.22)] disabled:opacity-50"
                            >
                              回滚
                            </button>
                          </td>
                        </tr>
                        {expandedSnapshotId === snapshot.id && (
                          <tr>
                            <td colSpan={4} className="bg-[hsl(var(--muted)_/_0.46)] px-6 py-4">
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--background))] p-4 text-xs font-mono text-[hsl(var(--foreground))]">
                                {JSON.stringify(JSON.parse(snapshot.configJson), null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
