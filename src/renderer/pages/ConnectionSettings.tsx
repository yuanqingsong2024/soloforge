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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">连接管理</h1>

      <div className="flex gap-6">
        {/* Left Panel — Profile List */}
        <div className="w-1/3">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {profiles.map(profile => (
                <li
                  key={profile.id}
                  onClick={() => selectProfile(profile)}
                  className={`px-4 py-3 cursor-pointer transition hover:bg-gray-50 ${
                    selectedId === profile.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{profile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{profile.baseUrl}</p>
                    </div>
                    <span
                      className={`w-3 h-3 rounded-full ${
                        profile.lastHealthStatus === 'healthy'
                          ? 'bg-green-500'
                          : profile.lastHealthStatus === 'unhealthy'
                          ? 'bg-red-500'
                          : 'bg-gray-300'
                      }`}
                    />
                  </div>
                </li>
              ))}
              {profiles.length === 0 && (
                <li className="px-4 py-8 text-center text-gray-500 text-sm">
                  暂无连接配置
                </li>
              )}
            </ul>
            <div className="p-3 border-t">
              <button
                onClick={handleNewProfile}
                className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + 新建连接
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Profile Details */}
        <div className="w-2/3">
          {!selectedId && !isCreating ? (
            <div className="bg-white shadow rounded-lg p-12 text-center text-gray-500">
              请选择或新建一个连接配置
            </div>
          ) : (
            <div className="space-y-6">
              {/* Form */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  {isCreating ? '新建连接' : '编辑连接'}
                </h2>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="例如: 本地开发"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">认证模式</label>
                    <select
                      value={formData.authMode}
                      onChange={e => setFormData(f => ({ ...f, authMode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="token">Token</option>
                      <option value="password">Password</option>
                      <option value="trusted-proxy">Trusted Proxy</option>
                      <option value="none">无认证</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={formData.baseUrl}
                      onChange={e => setFormData(f => ({ ...f, baseUrl: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="http://127.0.0.1:18789"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WebSocket URL</label>
                    <input
                      type="text"
                      value={formData.wsUrl}
                      onChange={e => setFormData(f => ({ ...f, wsUrl: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="ws://127.0.0.1:18789"
                    />
                  </div>

                  {/* Conditional credential fields */}
                  {formData.authMode === 'token' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Token
                        {credentials?.hasToken && (
                          <span className="ml-2 text-xs text-gray-400">已存储: {credentials.token}</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={formData.token}
                        onChange={e => setFormData(f => ({ ...f, token: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder={credentials?.hasToken ? '留空保持不变' : '输入 Token'}
                      />
                    </div>
                  )}
                  {formData.authMode === 'password' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        密码
                        {credentials?.hasPassword && (
                          <span className="ml-2 text-xs text-gray-400">已存储: {credentials.password}</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder={credentials?.hasPassword ? '留空保持不变' : '输入密码'}
                      />
                    </div>
                  )}
                  {formData.authMode === 'trusted-proxy' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Edge Token
                        {credentials?.hasEdgeToken && (
                          <span className="ml-2 text-xs text-gray-400">已存储: {credentials.edgeToken}</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={formData.edgeToken}
                        onChange={e => setFormData(f => ({ ...f, edgeToken: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                  {selectedId && !isCreating && (
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {/* Diagnostics — only for existing profiles */}
              {selectedId && !isCreating && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">连接诊断</h2>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-gray-600">WebSocket 状态:</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        wsStatus.connected
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {wsStatus.connected ? '已连接' : '未连接'}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handlePing}
                      disabled={pinging}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {pinging ? '测试中...' : 'Ping 测试'}
                    </button>

                    {!wsStatus.connected ? (
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {connecting ? '连接中...' : '连接 WebSocket'}
                      </button>
                    ) : (
                      <button
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        断开
                      </button>
                    )}
                  </div>

                  {pingResult && (
                    <div
                      className={`mt-4 p-3 rounded border ${
                        pingResult.success
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-red-50 border-red-200 text-red-700'
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
                    <div className="mt-6 border-t pt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">已存储凭据</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Token</p>
                          <p className={`text-sm font-medium ${credentials.hasToken ? 'text-green-600' : 'text-gray-400'}`}>
                            {credentials.hasToken ? credentials.token : '未设置'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Password</p>
                          <p className={`text-sm font-medium ${credentials.hasPassword ? 'text-green-600' : 'text-gray-400'}`}>
                            {credentials.hasPassword ? credentials.password : '未设置'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Edge Token</p>
                          <p className={`text-sm font-medium ${credentials.hasEdgeToken ? 'text-green-600' : 'text-gray-400'}`}>
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
