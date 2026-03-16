import React, { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'

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

export function ConfigCenter() {
  const [apiPort, setApiPort] = useState<number | null>(null)
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
    getApiPort().then(port => {
      setApiPort(port)
      fetchProfiles(port)
    })
  }, [])

  // Countdown timer for rate limiting
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Refresh rate limit when countdown expires
          if (apiPort && selectedProfileId) {
            fetchRateLimit(apiPort, selectedProfileId)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown, apiPort, selectedProfileId])

  const fetchProfiles = async (port: number) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/profiles`)
      setProfiles(await res.json())
    } catch (err) {
      console.error('Failed to fetch profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchConfig = async (port: number, profileId: string) => {
    setConfigLoading(true)
    setApplyStatus(null)

    try {
      const [configRes, snapshotsRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/openclaw/${profileId}/config`),
        fetch(`http://127.0.0.1:${port}/api/config/snapshots?profileId=${profileId}`)
      ])

      if (!configRes.ok) {
        const err = await configRes.json()
        setApplyStatus({ type: 'error', message: err.message || '获取配置失败，请先连接到 OpenClaw' })
        setCurrentConfig(null)
        setEditedConfig(null)
        setRawJson('')
      } else {
        const config = await configRes.json()
        setCurrentConfig(config)
        setEditedConfig(JSON.parse(JSON.stringify(config)))
        setRawJson(JSON.stringify(config, null, 2))
        populateForm(config)
      }

      setSnapshots(await snapshotsRes.json())
      await fetchRateLimit(port, profileId)
    } catch (err) {
      console.error('Failed to fetch config:', err)
      setApplyStatus({ type: 'error', message: '请先在连接管理页面连接到 OpenClaw' })
    } finally {
      setConfigLoading(false)
    }
  }

  const fetchRateLimit = async (port: number, profileId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config/rate-limit?profileId=${profileId}`)
      const data = await res.json()
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
    if (!apiPort || !selectedProfileId) return
    setApplying(true)
    setApplyStatus(null)

    const config = configToApply || (activeTab === 'json' ? JSON.parse(rawJson) : buildConfigFromForm())

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/config/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedProfileId, config })
      })
      const result = await res.json()

      if (result.status === 'success') {
        setApplyStatus({ type: 'success', message: '配置已应用' })
        setCurrentConfig(config)
        setEditedConfig(JSON.parse(JSON.stringify(config)))
        setRawJson(JSON.stringify(config, null, 2))
        populateForm(config as Record<string, unknown>)
        // Refresh snapshots and rate limit
        const [snapRes] = await Promise.all([
          fetch(`http://127.0.0.1:${apiPort}/api/config/snapshots?profileId=${selectedProfileId}`),
          fetchRateLimit(apiPort, selectedProfileId)
        ])
        setSnapshots(await snapRes.json())
      } else if (result.status === 'pending_approval') {
        setApplyStatus({ type: 'pending', message: `配置变更需要审批，审批ID: ${result.approvalId}` })
      } else if (result.status === 'rate_limited') {
        setApplyStatus({ type: 'rate_limited', message: result.message })
        if (result.resetIn) {
          setCountdown(Math.ceil(result.resetIn / 1000))
        }
      } else if (result.status === 'validation_error') {
        setApplyStatus({ type: 'error', message: `校验失败: ${result.errors?.join('; ')}` })
      } else {
        setApplyStatus({ type: 'error', message: '应用失败' })
      }
    } catch (err) {
      console.error('Failed to apply config:', err)
      setApplyStatus({ type: 'error', message: `应用失败: ${String(err)}` })
    } finally {
      setApplying(false)
    }
  }

  const handleRollback = async (snapshotId: string) => {
    if (!apiPort || !selectedProfileId || !confirm('确定回滚到此快照？')) return
    setApplying(true)
    setApplyStatus(null)

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/config/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedProfileId, snapshotId })
      })
      const result = await res.json()

      if (result.status === 'success') {
        setApplyStatus({ type: 'success', message: '配置已回滚' })
        await fetchConfig(apiPort, selectedProfileId)
      } else if (result.status === 'pending_approval') {
        setApplyStatus({ type: 'pending', message: `配置回滚需要审批，审批ID: ${result.approvalId}` })
      } else if (result.status === 'rate_limited') {
        setApplyStatus({ type: 'rate_limited', message: result.message })
      } else {
        setApplyStatus({ type: 'error', message: '回滚失败' })
      }
    } catch (err) {
      console.error('Failed to rollback:', err)
      setApplyStatus({ type: 'error', message: '回滚失败' })
    } finally {
      setApplying(false)
    }
  }

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId)
    setApplyStatus(null)
    setCurrentConfig(null)
    setEditedConfig(null)
    setRawJson('')
    setSnapshots([])
    if (apiPort && profileId) {
      fetchConfig(apiPort, profileId)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">配置中心</h1>

      {/* Profile Selector */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">连接配置:</label>
        <select
          value={selectedProfileId}
          onChange={e => handleProfileChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-w-64"
        >
          <option value="">请选择连接配置</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.baseUrl})</option>
          ))}
        </select>

        {rateLimit && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">剩余写入:</span>
            <span className={`font-medium ${rateLimit.remaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rateLimit.remaining}/3
            </span>
            {countdown > 0 && (
              <span className="text-red-500">({countdown}s)</span>
            )}
          </div>
        )}
      </div>

      {/* Status Banner */}
      {applyStatus && (
        <div
          className={`mb-4 p-3 rounded border ${
            applyStatus.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : applyStatus.type === 'pending'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
              : applyStatus.type === 'rate_limited'
              ? 'bg-orange-50 border-orange-200 text-orange-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <p className="text-sm">{applyStatus.message}</p>
        </div>
      )}

      {!selectedProfileId ? (
        <div className="bg-white shadow rounded-lg p-12 text-center text-gray-500">
          请选择一个连接配置以管理 OpenClaw 配置
        </div>
      ) : configLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {([
                { key: 'form' as const, label: '表单编辑' },
                { key: 'json' as const, label: 'Raw JSON' },
                { key: 'diff' as const, label: 'Diff 对比' },
                { key: 'snapshots' as const, label: '历史快照' }
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
              {/* 模型与路由 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">模型与路由</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认模型</label>
                    <input
                      type="text"
                      value={formDefaultModel}
                      onChange={e => setFormDefaultModel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="gpt-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fallbacks (逗号分隔)</label>
                    <textarea
                      value={formFallbacks}
                      onChange={e => setFormFallbacks(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      placeholder="gpt-3.5-turbo, claude-3-sonnet"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allowlist (逗号分隔)</label>
                    <textarea
                      value={formAllowlist}
                      onChange={e => setFormAllowlist(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      placeholder="gpt-4, gpt-3.5-turbo, claude-3-sonnet"
                    />
                  </div>
                </div>
              </div>

              {/* Hooks */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Hooks</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formHooksEnabled}
                      onChange={e => setFormHooksEnabled(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm font-medium text-gray-700">启用 Hooks</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hooks Token</label>
                    <input
                      type="text"
                      value={formHooksToken}
                      onChange={e => setFormHooksToken(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hooks Path</label>
                    <input
                      type="text"
                      value={formHooksPath}
                      onChange={e => setFormHooksPath(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="/hooks"
                    />
                  </div>
                </div>
              </div>

              {/* Tools 策略 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tools 策略</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认策略</label>
                    <select
                      value={formToolsPolicy}
                      onChange={e => setFormToolsPolicy(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Blocklist (每行一个)</label>
                    <textarea
                      value={formToolsBlocklist}
                      onChange={e => setFormToolsBlocklist(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="dangerous_tool&#10;risky_command"
                    />
                  </div>
                </div>
              </div>

              {/* Gateway 安全 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Gateway 安全</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Auth Mode</label>
                    <select
                      value={formAuthMode}
                      onChange={e => setFormAuthMode(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="token">Token</option>
                      <option value="password">Password</option>
                      <option value="trusted-proxy">Trusted Proxy</option>
                      <option value="none">无认证</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Trusted Proxies (每行一个，精确 IP 或 /24+ 网段)
                    </label>
                    <textarea
                      value={formTrustedProxies}
                      onChange={e => setFormTrustedProxies(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="10.0.0.1&#10;192.168.1.0/24"
                    />
                  </div>
                </div>
              </div>

              {/* Channels 配置 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Channels</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formChannelsEnabled}
                      onChange={e => setFormChannelsEnabled(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm font-medium text-gray-700">启用 Channels</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Targets 映射 (每行: channel:target)</label>
                    <textarea
                      value={formChannelsMappings}
                      onChange={e => setFormChannelsMappings(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={4}
                      placeholder="slack:#support\ntelegram:@ops_channel"
                    />
                    <p className="mt-1 text-xs text-gray-500">用于说明 channel 与通讯目标映射，仅写入配置，不含敏感凭证。</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => handleApply()}
                  disabled={applying || !currentConfig}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying ? '应用中...' : '应用配置'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="bg-white shadow rounded-lg p-6">
                <textarea
                  value={rawJson}
                  onChange={e => setRawJson(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-blue-500 focus:border-blue-500"
                  style={{ minHeight: '400px' }}
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(rawJson)
                      handleApply(parsed)
                    } catch {
                      setApplyStatus({ type: 'error', message: 'JSON 格式错误' })
                    }
                  }}
                  disabled={applying || !currentConfig}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying ? '应用中...' : '应用配置'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">当前配置 (远程)</h3>
                  <pre className="p-4 bg-gray-50 border rounded-md text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                    {currentConfig ? JSON.stringify(currentConfig, null, 2) : '无配置'}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">修改后配置 (本地)</h3>
                  <pre className="p-4 bg-blue-50 border border-blue-200 rounded-md text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                    {activeTab === 'diff'
                      ? JSON.stringify(buildConfigFromForm(), null, 2)
                      : rawJson || '无配置'
                    }
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'snapshots' && (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              {snapshots.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  暂无配置快照
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">序号</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置哈希</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {snapshots.map((snapshot, index) => (
                      <React.Fragment key={snapshot.id}>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            #{snapshots.length - index}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                            {snapshot.configHash.substring(0, 12)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(snapshot.createdAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <button
                              onClick={() => setExpandedSnapshotId(
                                expandedSnapshotId === snapshot.id ? null : snapshot.id
                              )}
                              className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 mr-2"
                            >
                              {expandedSnapshotId === snapshot.id ? '收起' : '查看'}
                            </button>
                            <button
                              onClick={() => handleRollback(snapshot.id)}
                              disabled={applying}
                              className="px-3 py-1 text-orange-600 border border-orange-600 rounded hover:bg-orange-50 disabled:opacity-50"
                            >
                              回滚
                            </button>
                          </td>
                        </tr>
                        {expandedSnapshotId === snapshot.id && (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 bg-gray-50">
                              <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
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
