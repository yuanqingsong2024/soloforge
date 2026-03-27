import { useEffect, useMemo, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface ConnectionProfile {
  id: string
  name: string
}

interface CommsProfile {
  id: string
  name: string
  provider: 'openclaw' | 'webhook'
  openclawProfileId?: string
  enabled: boolean
}

interface CommsTarget {
  id: string
  commsProfileId: string
  channel: string
  to: string
  displayName: string
  allowlisted: boolean
  notes?: string
}

export function Communications() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [commsProfiles, setCommsProfiles] = useState<CommsProfile[]>([])
  const [targets, setTargets] = useState<CommsTarget[]>([])
  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfile[]>([])
  const [loading, setLoading] = useState(true)

  const [newProfileName, setNewProfileName] = useState('')
  const [newProvider, setNewProvider] = useState<'openclaw' | 'webhook'>('openclaw')
  const [newOpenclawProfileId, setNewOpenclawProfileId] = useState('')

  const [newTargetProfileId, setNewTargetProfileId] = useState('')
  const [newTargetChannel, setNewTargetChannel] = useState('slack')
  const [newTargetTo, setNewTargetTo] = useState('')
  const [newTargetDisplayName, setNewTargetDisplayName] = useState('')
  const [newTargetAllowlisted, setNewTargetAllowlisted] = useState(false)
  const [newTargetNotes, setNewTargetNotes] = useState('')

  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [testMessageBody, setTestMessageBody] = useState('【测试消息】这是来自 SoloForge Communications 的审批测试消息。')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const selectedTarget = useMemo(() => {
    return targets.find(target => target.id === selectedTargetId)
  }, [targets, selectedTargetId])

  useEffect(() => {
    getApiPort().then(async (port) => {
      setApiPort(port)
      await Promise.all([
        fetchCommsProfiles(port),
        fetchTargets(port),
        fetchConnectionProfiles(port)
      ])
      setLoading(false)
    })
  }, [])

  const fetchCommsProfiles = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/comms/profiles`)
    const data = await response.json()
    setCommsProfiles(data)
  }

  const fetchTargets = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/comms/targets`)
    const data = await response.json()
    setTargets(data)
  }

  const fetchConnectionProfiles = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/profiles`)
    const data = await response.json()
    setConnectionProfiles(data)
  }

  const handleCreateCommsProfile = async () => {
    if (!apiPort || !newProfileName.trim()) return

    await fetch(`http://127.0.0.1:${apiPort}/api/comms/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newProfileName,
        provider: newProvider,
        openclawProfileId: newProvider === 'openclaw' && newOpenclawProfileId ? newOpenclawProfileId : undefined,
        enabled: true
      })
    })

    setNewProfileName('')
    setNewOpenclawProfileId('')
    await fetchCommsProfiles(apiPort)
  }

  const handleToggleCommsProfile = async (profile: CommsProfile) => {
    if (!apiPort) return

    await fetch(`http://127.0.0.1:${apiPort}/api/comms/profiles/${profile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !profile.enabled })
    })

    await fetchCommsProfiles(apiPort)
  }

  const handleCreateTarget = async () => {
    if (!apiPort || !newTargetProfileId || !newTargetTo.trim() || !newTargetDisplayName.trim()) return

    const response = await fetch(`http://127.0.0.1:${apiPort}/api/comms/targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commsProfileId: newTargetProfileId,
        channel: newTargetChannel,
        to: newTargetTo,
        displayName: newTargetDisplayName,
        allowlisted: newTargetAllowlisted,
        notes: newTargetNotes || undefined
      })
    })
    const result = await response.json()

    if (result.status === 'pending_approval') {
      setStatusMessage(`目标创建成功，allowlist 已提交审批，审批 ID: ${result.approvalId}`)
    } else if (result.status === 'success') {
      setStatusMessage('目标创建成功')
    } else {
      setStatusMessage(result.message || '创建目标失败')
    }

    setNewTargetTo('')
    setNewTargetDisplayName('')
    setNewTargetNotes('')
    setNewTargetAllowlisted(false)
    await fetchTargets(apiPort)
  }

  const handleRequestAllowlist = async (target: CommsTarget) => {
    if (!apiPort) return

    if (target.allowlisted) {
      setStatusMessage('该目标已在 allowlist 中')
      return
    }

    const response = await fetch(`http://127.0.0.1:${apiPort}/api/comms/targets/${target.id}/request-allowlist`, {
      method: 'POST'
    })
    const result = await response.json()

    if (result.status === 'pending_approval') {
      setStatusMessage(`已提交 allowlist 审批，审批 ID: ${result.approvalId}`)
    } else if (result.status === 'success' || result.status === 'already_allowlisted') {
      setStatusMessage('allowlist 状态已更新')
    } else {
      setStatusMessage(result.message || 'allowlist 提交失败')
    }

    await fetchTargets(apiPort)
  }

  const handleSendTestMessage = async () => {
    if (!apiPort || !selectedTarget) return

    const createDraftResponse = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: selectedTarget.channel,
        to: selectedTarget.to,
        subject: '通讯测试消息',
        body: testMessageBody,
        status: 'DRAFT'
      })
    })

    const draft = await createDraftResponse.json()

    const sendResponse = await fetch(`http://127.0.0.1:${apiPort}/api/outbound-messages/${draft.id}/send`, {
      method: 'POST'
    })
    const sendResult = await sendResponse.json()

    if (sendResult.status === 'blocked_allowlist') {
      alert(sendResult.message)
      return
    }

    if (sendResult.status === 'pending_approval') {
      alert(`测试消息已进入审批流程，审批 ID: ${sendResult.approvalId}`)
      return
    }

    alert('测试消息已发送')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Communications"
        description="管理通讯平台映射、允许目标与受控外发测试"
      />

      {statusMessage && (
        <div className="mb-4 rounded-workshop-lg border border-[hsl(var(--google-blue)_/_0.12)] bg-[hsl(var(--google-blue)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-workshop-sm">
          {statusMessage}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="通讯档案（Comms Profiles）" description="将通讯能力映射到 OpenClaw 连接档案或 webhook provider">
          <div className="space-y-3 mb-4">
            {commsProfiles.map(profile => (
              <div key={profile.id} className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-workshop-sm">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{profile.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">provider: {profile.provider}</p>
                </div>
                <button
                  onClick={() => handleToggleCommsProfile(profile)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${profile.enabled ? 'border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]' : 'border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}
                >
                  {profile.enabled ? '已启用' : '已停用'}
                </button>
              </div>
            ))}
            {commsProfiles.length === 0 && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无通讯档案</p>
            )}
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))] space-y-3">
            <h3 className="text-sm font-medium text-[hsl(var(--foreground))]">新增通讯档案</h3>
            <input
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              placeholder="档案名称"
              className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
            />
            <select
              value={newProvider}
              onChange={e => setNewProvider(e.target.value as 'openclaw' | 'webhook')}
              className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="openclaw">openclaw</option>
              <option value="webhook">webhook</option>
            </select>
            <select
              value={newOpenclawProfileId}
              onChange={e => setNewOpenclawProfileId(e.target.value)}
              className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="">选择 OpenClaw 连接档案（可选）</option>
              {connectionProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <button
              onClick={handleCreateCommsProfile}
              className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
            >
              创建通讯档案
            </button>
          </div>
        </SectionCard>

        <SectionCard title="测试消息（强制走审批）" description="测试发送会先创建草稿，再触发 SEND_EXTERNAL 审批链路">
          <div className="space-y-3">
            <select
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              className="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="">选择目标</option>
              {targets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.displayName} ({target.channel} / {target.to})
                </option>
              ))}
            </select>
            <textarea
              value={testMessageBody}
              onChange={e => setTestMessageBody(e.target.value)}
              className="w-full rounded-workshop-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-[hsl(var(--foreground))]"
              rows={6}
            />
            <button
              onClick={handleSendTestMessage}
              disabled={!selectedTargetId}
              className="w-full rounded-full bg-[hsl(var(--warning))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--warning-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              发送测试消息（走审批）
            </button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="通讯目标（Targets）" description="仅 allowlisted=true 的目标允许发送">
        <div className="space-y-3 mb-4">
          {targets.map(target => (
            <div key={target.id} className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-workshop-sm">
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">{target.displayName}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{target.channel} / {target.to}</p>
                {target.notes && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">备注：{target.notes}</p>}
              </div>
              <button
                onClick={() => handleRequestAllowlist(target)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${target.allowlisted ? 'border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]' : 'border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]'}`}
>
                {target.allowlisted ? '已允许' : '申请加入 allowlist'}
              </button>
            </div>
          ))}
          {targets.length === 0 && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无目标</p>
          )}
        </div>

        <div className="pt-4 border-t border-[hsl(var(--border))] grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={newTargetProfileId}
            onChange={e => setNewTargetProfileId(e.target.value)}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
          >
            <option value="">选择通讯档案</option>
            {commsProfiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <select
            value={newTargetChannel}
            onChange={e => setNewTargetChannel(e.target.value)}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
          >
            <option value="slack">slack</option>
            <option value="telegram">telegram</option>
            <option value="discord">discord</option>
            <option value="msteams">msteams</option>
            <option value="signal">signal</option>
            <option value="whatsapp">whatsapp</option>
            <option value="imessage">imessage</option>
          </select>
          <input
            value={newTargetTo}
            onChange={e => setNewTargetTo(e.target.value)}
            placeholder="收件人/频道 ID"
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
          />
          <input
            value={newTargetDisplayName}
            onChange={e => setNewTargetDisplayName(e.target.value)}
            placeholder="显示名称"
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]"
          />
          <input
            value={newTargetNotes}
            onChange={e => setNewTargetNotes(e.target.value)}
            placeholder="备注（可选）"
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] md:col-span-2"
          />
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={newTargetAllowlisted}
              onChange={e => setNewTargetAllowlisted(e.target.checked)}
            />
            创建时立即加入 allowlist
          </label>
          <button
            onClick={handleCreateTarget}
            className="md:col-span-2 rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            新增目标
          </button>
        </div>
      </SectionCard>
    </div>
  )
}
