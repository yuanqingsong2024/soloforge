import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getApiPort } from '../lib/api'
import { useEnumTranslation } from '../lib/i18n-helpers'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, FormLabel, FormHint, ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { StatusBadge } from '../components/ui/StatusBadge'

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

const PAGE_SIZE = 6

export function ConnectionSettings() {
  const { t } = useTranslation(['config', 'common'])
  const translateStatus = useEnumTranslation('commonStatusMap')
  
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
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE))
  const paginatedProfiles = profiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pageStart = profiles.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(currentPage * PAGE_SIZE, profiles.length)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchProfiles(port)
    })
  }, [])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!selectedId) return

    const selectedIndex = profiles.findIndex(profile => profile.id === selectedId)
    if (selectedIndex === -1) return

    const targetPage = Math.floor(selectedIndex / PAGE_SIZE) + 1
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage)
    }
  }, [currentPage, profiles, selectedId])

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
        setCurrentPage(Math.max(1, Math.ceil((profiles.length + 1) / PAGE_SIZE)))
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
      setError(t('common:errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!apiPort || !selectedId || !confirm(t('config:connection.confirmDelete'))) return

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
      setError(t('common:errors.deleteFailed'))
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
        setError(t('config:connection.connectFailed', { error: result.error || '' }))
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      setError(t('config:connection.connectFailed', { error: '' }))
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
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t('config:connection.pageTitle')}</h1>
      </div>

      <div className="flex gap-6">
        <div className="w-1/3">
          <div className="overflow-hidden rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
            <ul className="divide-y divide-[hsl(var(--border)_/_0.8)]">
              {paginatedProfiles.map(profile => (
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
                <li className="px-4 py-4">
                  <EmptyState message={t('config:connection.noProfiles')} className="py-4" />
                </li>
              )}
            </ul>
            <div className="border-t border-[hsl(var(--border)_/_0.8)] space-y-3 p-3">
              {profiles.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                  <span>显示 {pageStart}-{pageEnd} / 共 {profiles.length} 条</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <span>{currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={handleNewProfile}
                className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
              >
                {t('config:connection.newProfile')}
              </button>
            </div>
          </div>
        </div>

        <div className="w-2/3">
          {!selectedId && !isCreating ? (
            <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-12 shadow-workshop-sm">
              <EmptyState message={t('config:connection.selectOrCreate')} />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
                <h2 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">
                  {isCreating ? t('config:connection.createTitle') : t('config:connection.editTitle')}
                </h2>

                {error && (
                  <div className="mb-4 rounded-workshop-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] p-3 text-sm text-[hsl(var(--destructive))] shadow-workshop-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField>
                    <FormLabel>{t('config:connection.name')}</FormLabel>
                    <ThemeInput
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="rounded-full px-4 py-2.5 text-sm"
                      placeholder={t('config:connection.namePlaceholder')}
                    />
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:connection.authMode')}</FormLabel>
                    <ThemeSelect
                      value={formData.authMode}
                      onChange={e => setFormData(f => ({ ...f, authMode: e.target.value }))}
                      className="rounded-full px-4 py-2.5 text-sm"
                    >
                      <option value="token">{t('config:connection.authModes.token')}</option>
                      <option value="password">{t('config:connection.authModes.password')}</option>
                      <option value="trusted-proxy">{t('config:connection.authModes.trustedProxy')}</option>
                      <option value="none">{t('config:connection.authModes.none')}</option>
                    </ThemeSelect>
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:connection.baseUrl')}</FormLabel>
                    <ThemeInput
                      type="text"
                      value={formData.baseUrl}
                      onChange={e => setFormData(f => ({ ...f, baseUrl: e.target.value }))}
                      className="rounded-full px-4 py-2.5 text-sm"
                      placeholder="http://127.0.0.1:18789"
                    />
                  </FormField>
                  <FormField>
                    <FormLabel>{t('config:connection.wsUrl')}</FormLabel>
                    <ThemeInput
                      type="text"
                      value={formData.wsUrl}
                      onChange={e => setFormData(f => ({ ...f, wsUrl: e.target.value }))}
                      className="rounded-full px-4 py-2.5 text-sm"
                      placeholder="ws://127.0.0.1:18789"
                    />
                  </FormField>

                  {formData.authMode === 'token' && (
                    <FormField className="col-span-2">
                      <FormLabel>{t('config:connection.token')}</FormLabel>
                      {credentials?.hasToken && <FormHint>{t('config:connection.stored')}: {credentials.token}</FormHint>}
                      <ThemeInput
                        type="password"
                        value={formData.token}
                        onChange={e => setFormData(f => ({ ...f, token: e.target.value }))}
                        className="rounded-full px-4 py-2.5 text-sm"
                        placeholder={credentials?.hasToken ? t('config:connection.keepUnchanged') : t('config:connection.enterToken')}
                      />
                    </FormField>
                  )}
                  {formData.authMode === 'password' && (
                    <FormField className="col-span-2">
                      <FormLabel>{t('config:connection.password')}</FormLabel>
                      {credentials?.hasPassword && <FormHint>{t('config:connection.stored')}: {credentials.password}</FormHint>}
                      <ThemeInput
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                        className="rounded-full px-4 py-2.5 text-sm"
                        placeholder={credentials?.hasPassword ? t('config:connection.keepUnchanged') : t('config:connection.enterPassword')}
                      />
                    </FormField>
                  )}
                  {formData.authMode === 'trusted-proxy' && (
                    <FormField className="col-span-2">
                      <FormLabel>{t('config:connection.edgeToken')}</FormLabel>
                      {credentials?.hasEdgeToken && <FormHint>{t('config:connection.stored')}: {credentials.edgeToken}</FormHint>}
                      <ThemeInput
                        type="password"
                        value={formData.edgeToken}
                        onChange={e => setFormData(f => ({ ...f, edgeToken: e.target.value }))}
                        className="rounded-full px-4 py-2.5 text-sm"
                        placeholder={credentials?.hasEdgeToken ? t('config:connection.keepUnchanged') : t('config:connection.enterEdgeToken')}
                      />
                    </FormField>
                  )}
                </div>

                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || !formData.name}
                      className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? t('config:connection.saving') : t('common:buttons.save')}
                    </button>
                  </div>
                  {selectedId && !isCreating && (
                    <button
                      onClick={handleDelete}
                      className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.08)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.14)]"
                    >
                      {t('common:buttons.delete')}
                    </button>
                  )}
                </div>
              </div>

              {selectedId && !isCreating && (
                <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
                  <h2 className="mb-4 text-lg font-medium text-[hsl(var(--foreground))]">{t('config:connection.diagnostics')}</h2>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">{t('config:connection.wsStatus')}:</span>
                    <StatusBadge
                      label={wsStatus.connected ? translateStatus('CONNECTED') : translateStatus('DISCONNECTED')}
                      tone={wsStatus.connected ? 'success' : 'muted'}
                      className="px-2.5 py-1"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handlePing}
                      disabled={pinging}
                      className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                    >
                      {pinging ? t('config:connection.pinging') : t('config:connection.ping')}
                    </button>

                    {!wsStatus.connected ? (
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="rounded-full border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--google-green)_/_0.18)] disabled:opacity-50"
                      >
                        {connecting ? t('config:connection.connecting') : t('config:connection.connect')}
                      </button>
                    ) : (
                      <button
                        onClick={handleDisconnect}
                        className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.18)]"
                      >
                        {t('config:connection.disconnect')}
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
                        {pingResult.success ? t('config:connection.pingSuccess') : t('config:connection.pingFailed')}
                      </p>
                      {pingResult.message && (
                        <p className="text-xs mt-1">{pingResult.message}</p>
                      )}
                    </div>
                  )}

                  {credentials && (
                      <div className="mt-6 border-t border-[hsl(var(--border)_/_0.8)] pt-4">
                        <h3 className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">{t('config:connection.storedCredentials')}</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('config:connection.token')}</p>
                            <p className={`text-sm font-medium ${credentials.hasToken ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasToken ? credentials.token : t('config:connection.notSet')}
                            </p>
                          </div>
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('config:connection.password')}</p>
                            <p className={`text-sm font-medium ${credentials.hasPassword ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasPassword ? credentials.password : t('config:connection.notSet')}
                            </p>
                          </div>
                          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] px-3 py-4 text-center">
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('config:connection.edgeToken')}</p>
                            <p className={`text-sm font-medium ${credentials.hasEdgeToken ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                              {credentials.hasEdgeToken ? credentials.edgeToken : t('config:connection.notSet')}
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
