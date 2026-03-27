import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'

interface ConnectionProfile {
  id: string
  name: string
  baseUrl: string
  wsUrl: string
  authMode: string
  lastHealthCheck?: string
  lastHealthStatus?: string
}

interface Credentials {
  token: string
  password: string
  edgeToken: string
  hasToken: boolean
  hasPassword: boolean
  hasEdgeToken: boolean
}

interface FormData {
  name: string
  baseUrl: string
  wsUrl: string
  authMode: string
  token: string
  password: string
  edgeToken: string
}

const emptyForm: FormData = {
  name: '',
  baseUrl: 'http://127.0.0.1:18789',
  wsUrl: 'ws://127.0.0.1:18789',
  authMode: 'token',
  token: '',
  password: '',
  edgeToken: ''
}

export function ConnectionSettings() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [formData, setFormData] = useState<FormData>({ ...emptyForm })
  const [isCreating, setIsCreating] = useState(false)
  const [pingResult, setPingResult] = useState<{ success: boolean; message?: string } | null>(null)
  const [wsStatus, setWsStatus] = useState<{ connected: boolean }>({ connected: false })
  const [saving, setSaving] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchProfiles(port)
    })
  }, [])

  const fetchProfiles = async (port: number) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/profiles`)
      const data = await res.json()
      setProfiles(data)
    } catch (err) {
      console.error('Failed to fetch profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectProfile = async (profile: ConnectionProfile) => {
    setSelectedId(profile.id)
    setIsCreating(false)
    setPingResult(null)
    setError(null)
    setFormData({
      name: profile.name,
      baseUrl: profile.baseUrl,
      wsUrl: profile.wsUrl,
      authMode: profile.authMode,
      token: '',
      password: '',
      edgeToken: ''
    })

    if (!apiPort) return

    try {
      const [credRes, statusRes] = await Promise.all([
        fetch(`http://127.0.0.1:${apiPort}/api/profiles/${profile.id}/credentials`),
        fetch(`http://127.0.0.1:${apiPort}/api/openclaw/${profile.id}/status`)
      ])
      setCredentials(await credRes.json())
      setWsStatus(await statusRes.json())
    } catch (err) {
      console.error('Failed to fetch profile details:', err)
    }
  }

  const handleNewProfile = () => {
    setSelectedId(null)
    setIsCreating(true)
    setCredentials(null)
    setPingResult(null)
    setWsStatus({ connected: false })
    setError(null)
    setFormData({ ...emptyForm })
  }

  const handleSave = async () => {
    if (!apiPort) return
    setSaving(true)
    setError(null)

    try {
      const body = {
        name: formData.name,
        baseUrl: formData.baseUrl,
        wsUrl: formData.wsUrl,
        authMode: formData.authMode,
        ...(formData.token && { token: formData.token }),
        ...(formData.password && { password: formData.password }),
        ...(formData.edgeToken && { edgeToken: formData.edgeToken })
      }

      if (isCreating) {
        const res = await fetch(`http://127.0.0.1:${apiPort}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const created = await res.json()
        setIsCreating(false)
        setSelectedId(created.id)
      } else if (selectedId) {
        await fetch(`http://127.0.0.1:${apiPort}/api/profiles/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      }

      await fetchProfiles(apiPort)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!apiPort || !selectedId || !confirm('确定删除该连接配置？')) return

    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/profiles/${selectedId}`, {
        method: 'DELETE'
      })
      setSelectedId(null)
      setCredentials(null)
      setFormData({ ...emptyForm })
      await fetchProfiles(apiPort)
    } catch (err) {
      console.error('Failed to delete profile:', err)
      setError('删除失败')
    }
  }

  const handlePing = async () => {
    if (!apiPort || !selectedId) return
    setPinging(true)
    setPingResult(null)

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedId })
      })
      const result = await res.json()
      setPingResult(result)
    } catch (err) {
      setPingResult({ success: false, message: String(err) })
    } finally {
      setPinging(false)
    }
  }

  const handleConnect = async () => {
    if (!apiPort || !selectedId) return
    setConnecting(true)

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedId })
      })
      const result = await res.json()
      if (result.success) {
        setWsStatus({ connected: true })
      } else {
        setError(`连接失败: ${result.error}`)
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      setError('连接失败')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!apiPort || !selectedId) return

    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/openclaw/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedId })
      })
      setWsStatus({ connected: false })
    } catch (err) {
      console.error('Failed to disconnect:', err)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[hsl(var(--google-blue))]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card)_/_0.76)] px-6 py-5 shadow-workshop-sm backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">连接管理</h1>
      </div>

      <div className="flex gap-6">
        {/* Left Panel — Profile List */}
        <div className="w-1/3">
          <div className="overflow-hidden rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
            <ul className="divide-y divide-[hsl(var(--border)_/_0.8)]">
              {profiles.map(profile => (
                <li
                  key={profile.id}
                  onClick={() => selectProfile(profile)}
                  className={`cursor-pointer px-4 py-3 transition-colors hover:bg-[hsl(var(--accent)_/_0.56)] ${
                    selectedId === profile.id ? 'border-l-4 border-[hsl(var(--google-blue))] bg-[hsl(var(--google-blue)_/_0.08)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{profile.name}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{profile.baseUrl}</p>
                    </div>
                    <span
                      className={`w-3 h-3 rounded-full ${
                        profile.lastHealthStatus === 'healthy'
                          ? 'bg-[hsl(var(--google-green))]'
                          : profile.lastHealthStatus === 'unhealthy'
                          ? 'bg-[hsl(var(--google-red))]'
                          : 'bg-[hsl(var(--border))]'
                      }`}
                    />
                  </div>
                </li>
              ))}
              {profiles.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  暂无连接配置
                </li>
              )}
            </ul>
            <div className="border-t border-[hsl(var(--border)_/_0.8)] p-3">
              <button
                onClick={handleNewProfile}
                className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
              >
                + 新建连接
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Profile Details */}
        <div className="w-2/3">
          {!selectedId && !isCreating ? (
            <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-12 text-center text-[hsl(var(--muted-foreground))] shadow-workshop-sm">
              请选择或新建一个连接配置
            </div>
          ) : (
            <div className="space-y-6">
              {/* Form */}
              <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
                <h2 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">
                  {isCreating ? '新建连接' : '编辑连接'}
                </h2>

                {error && (
                  <div className="mb-4 rounded-workshop-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-3 text-sm text-[hsl(var(--destructive))] shadow-workshop-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">名称</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                      placeholder="例如: 本地开发"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">认证模式</label>
                    <select
                      value={formData.authMode}
                      onChange={e => setFormData(f => ({ ...f, authMode: e.target.value }))}
                      className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                    >
                      <option value="token">Token</option>
                      <option value="password">Password</option>
                      <option value="trusted-proxy">Trusted Proxy</option>
                      <option value="none">无认证</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">Base URL</label>
                    <input
                      type="text"
                      value={formData.baseUrl}
                      onChange={e => setFormData(f => ({ ...f, baseUrl: e.target.value }))}
                      className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                      placeholder="http://127.0.0.1:18789"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">WebSocket URL</label>
                    <input
                      type="text"
                      value={formData.wsUrl}
                      onChange={e => setFormData(f => ({ ...f, wsUrl: e.target.value }))}
                      className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                      placeholder="ws://127.0.0.1:18789"
                    />
                  </div>

                  {/* Conditional credential fields */}
                  {formData.authMode === 'token' && (
                    <div className="col-span-2">
                        <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                          Token
                          {credentials?.hasToken && (
                            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">已存储: {credentials.token}</span>
                          )}
                        </label>
                      <input
                        type="password"
                        value={formData.token}
                        onChange={e => setFormData(f => ({ ...f, token: e.target.value }))}
                        className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                        placeholder={credentials?.hasToken ? '留空保持不变' : '输入 Token'}
                      />
                    </div>
                  )}
                  {formData.authMode === 'password' && (
                    <div className="col-span-2">
                        <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                          密码
                          {credentials?.hasPassword && (
                            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">已存储: {credentials.password}</span>
                          )}
                        </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                        className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                        placeholder={credentials?.hasPassword ? '留空保持不变' : '输入密码'}
                      />
                    </div>
                  )}
                  {formData.authMode === 'trusted-proxy' && (
                    <div className="col-span-2">
                        <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">
                          Edge Token
                          {credentials?.hasEdgeToken && (
                            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">已存储: {credentials.edgeToken}</span>
                          )}
                        </label>
                      <input
                        type="password"
                        value={formData.edgeToken}
                        onChange={e => setFormData(f => ({ ...f, edgeToken: e.target.value }))}
                        className="w-full rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--google-blue)_/_0.35)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
                        placeholder={credentials?.hasEdgeToken ? '留空保持不变' : '输入 Edge Token'}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || !formData.name}
                      className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                  {selectedId && !isCreating && (
                    <button
                      onClick={handleDelete}
                      className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.08)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.14)]"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {/* Diagnostics — only for existing profiles */}
              {selectedId && !isCreating && (
                <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
                  <h2 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">连接诊断</h2>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">WebSocket 状态:</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        wsStatus.connected
                          ? 'border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
                          : 'border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                      }`}
                    >
                      {wsStatus.connected ? '已连接' : '未连接'}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handlePing}
                      disabled={pinging}
                      className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                    >
                      {pinging ? '测试中...' : 'Ping 测试'}
                    </button>

                    {!wsStatus.connected ? (
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="rounded-full border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--google-green)_/_0.18)] disabled:opacity-50"
                      >
                        {connecting ? '连接中...' : '连接 WebSocket'}
                      </button>
                    ) : (
                      <button
                        onClick={handleDisconnect}
                        className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.18)]"
                      >
                        断开
                      </button>
                    )}
                  </div>

                  {pingResult && (
                    <div
                      className={`mt-4 rounded-workshop-lg border p-3 shadow-workshop-sm ${
                        pingResult.success
                          ? 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
                          : 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
                      }`}
                    >
                      <p className="text-sm font-medium">
                        {pingResult.success ? 'Ping 成功' : 'Ping 失败'}
                      </p>
                      {pingResult.message && (
                        <p className="text-xs mt-1">{pingResult.message}</p>
                      )}
                    </div>
                  )}

                  {/* Credentials Display */}
                  {credentials && (
                      <div className="mt-6 border-t border-[hsl(var(--border)_/_0.8)] pt-4">
                        <h3 className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">已存储凭据</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">Token</p>
                            <p className={`text-sm font-medium ${credentials.hasToken ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasToken ? credentials.token : '未设置'}
                            </p>
                          </div>
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">Password</p>
                            <p className={`text-sm font-medium ${credentials.hasPassword ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasPassword ? credentials.password : '未设置'}
                            </p>
                          </div>
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">Edge Token</p>
                            <p className={`text-sm font-medium ${credentials.hasEdgeToken ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasEdgeToken ? credentials.edgeToken : '未设置'}
                            </p>
                          </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
