import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { EmptyState, Button } from '../components/ui'
import { LoadingState } from '../components/ui/LoadingState'
import { ThemeCheckbox, ThemeInput, ThemeSelect, ThemeTextarea } from '../components/ui/FormFields'

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
    void Promise.all([
      fetchCommsProfiles(),
      fetchTargets(),
      fetchConnectionProfiles()
    ]).finally(() => setLoading(false))
  }, [])

  const fetchCommsProfiles = async () => {
    const data = await apiFetch<CommsProfile[]>('/api/comms/profiles')
    setCommsProfiles(data)
  }

  const fetchTargets = async () => {
    const data = await apiFetch<CommsTarget[]>('/api/comms/targets')
    setTargets(data)
  }

  const fetchConnectionProfiles = async () => {
    const data = await apiFetch<ConnectionProfile[]>('/api/profiles')
    setConnectionProfiles(data)
  }

  const handleCreateCommsProfile = async () => {
    if (!newProfileName.trim()) return

    await apiFetch('/api/comms/profiles', {
      method: 'POST',
      body: JSON.stringify({
        name: newProfileName,
        provider: newProvider,
        enabled: true
      })
    })

    setNewProfileName('')
    setNewOpenclawProfileId('')
    await fetchCommsProfiles()
  }

  const handleToggleCommsProfile = async (profile: CommsProfile) => {
    await apiFetch(`/api/comms/profiles/${profile.id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !profile.enabled })
    })

    await fetchCommsProfiles()
  }

  const handleCreateTarget = async () => {
    if (!newTargetProfileId || !newTargetTo.trim() || !newTargetDisplayName.trim()) return

    const result = await apiFetch<ApiResponse<{ status: string; approvalId?: string; message?: string }>>('/api/comms/targets', {
      method: 'POST',
      body: JSON.stringify({
        commsProfileId: newTargetProfileId,
        channel: newTargetChannel,
        to: newTargetTo,
        displayName: newTargetDisplayName,
        allowlisted: newTargetAllowlisted,
        notes: newTargetNotes || undefined
      })
    })

    if (result.success && result.data) {
      if (result.data.status === 'pending_approval') {
        setStatusMessage(`目标创建成功，allowlist 已提交审批，审批 ID: ${result.data.approvalId}`)
      } else if (result.data.status === 'success') {
        setStatusMessage('目标创建成功')
      } else {
        setStatusMessage(result.data.message || '创建目标失败')
      }
    }

    setNewTargetTo('')
    setNewTargetDisplayName('')
    setNewTargetNotes('')
    setNewTargetAllowlisted(false)
    await fetchTargets()
  }

  const handleRequestAllowlist = async (target: CommsTarget) => {
    if (target.allowlisted) {
      setStatusMessage('该目标已在 allowlist 中')
      return
    }

    const result = await apiFetch<ApiResponse<{ status: string; approvalId?: string; message?: string }>>(`/api/comms/targets/${target.id}/request-allowlist`, {
      method: 'POST'
    })

    if (result.success && result.data) {
      if (result.data.status === 'pending_approval') {
        setStatusMessage(`已提交 allowlist 审批，审批 ID: ${result.data.approvalId}`)
      } else if (result.data.status === 'success' || result.data.status === 'already_allowlisted') {
        setStatusMessage('allowlist 状态已更新')
      } else {
        setStatusMessage(result.data.message || 'allowlist 提交失败')
      }
    }

    await fetchTargets()
  }

  const handleSendTestMessage = async () => {
    if (!selectedTarget) return

    const draft = await apiFetch<{ id: string }>('/api/outbound-messages', {
      method: 'POST',
      body: JSON.stringify({
        channel: selectedTarget.channel,
        to: selectedTarget.to,
        subject: '通讯测试消息',
        body: testMessageBody,
        status: 'DRAFT'
      })
    })

    const sendResult = await apiFetch<ApiResponse<{ status: string; approvalId?: string; message?: string }>>(`/api/outbound-messages/${draft.id}/send`, {
      method: 'POST'
    })

    if (sendResult.success && sendResult.data) {
      if (sendResult.data.status === 'blocked_allowlist') {
        alert(sendResult.data.message)
        return
      }

      if (sendResult.data.status === 'pending_approval') {
        alert(`测试消息已进入审批流程，审批 ID: ${sendResult.data.approvalId}`)
        return
      }

      alert('测试消息已发送')
    }
  }

  if (loading) {
    return <LoadingState message="加载通讯设置中..." />
  }

  return (
    <div>
      <PageHeader
        title="通讯设置"
        description="管理通讯平台映射、允许目标与受控外发测试"
      />

      {statusMessage && (
        <div className="mb-4 rounded-lg border border-[hsl(var(--google-blue)_/_0.12)] bg-[hsl(var(--google-blue)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-sm">
          {statusMessage}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="通讯档案（Comms Profiles）" description="将通讯能力映射到 OpenClaw 连接档案或 webhook provider">
          <div className="space-y-3 mb-4">
            {commsProfiles.map(profile => (
              <div key={profile.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-sm">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{profile.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">provider: {profile.provider}</p>
                </div>
                <Button variant={profile.enabled ? 'secondary' : 'secondary'} size="sm" onClick={() => handleToggleCommsProfile(profile)}>
                  {profile.enabled ? '已启用' : '已停用'}
                </Button>
              </div>
            ))}
            {commsProfiles.length === 0 && (
              <EmptyState message="暂无通讯档案" />
            )}
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))] space-y-3">
            <h3 className="text-sm font-medium text-[hsl(var(--foreground))]">新增通讯档案</h3>
            <ThemeInput
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              placeholder="档案名称"
              fieldSize="lg"
              fieldShape="pill"
            />
            <ThemeSelect
              value={newProvider}
              onChange={e => setNewProvider(e.target.value as 'openclaw' | 'webhook')}
              fieldSize="lg"
              fieldShape="pill"
            >
              <option value="openclaw">openclaw</option>
              <option value="webhook">webhook</option>
            </ThemeSelect>
            <ThemeSelect
              value={newOpenclawProfileId}
              onChange={e => setNewOpenclawProfileId(e.target.value)}
              fieldSize="lg"
              fieldShape="pill"
            >
              <option value="">选择 OpenClaw 连接档案（可选）</option>
              {connectionProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </ThemeSelect>
            <Button className="w-full" onClick={handleCreateCommsProfile}>
              创建通讯档案
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="测试消息（强制走审批）" description="测试发送会先创建草稿，再触发 SEND_EXTERNAL 审批链路">
          <div className="space-y-3">
            <ThemeSelect
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              fieldSize="lg"
              fieldShape="pill"
            >
              <option value="">选择目标</option>
              {targets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.displayName} ({target.channel} / {target.to})
                </option>
              ))}
            </ThemeSelect>
            <ThemeTextarea value={testMessageBody} onChange={e => setTestMessageBody(e.target.value)} fieldSize="lg" fieldShape="soft" rows={6} />
            <Button variant="secondary" className="w-full" onClick={handleSendTestMessage} disabled={!selectedTargetId}>
              发送测试消息（走审批）
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="通讯目标（Targets）" description="仅 allowlisted=true 的目标允许发送">
        <div className="space-y-3 mb-4">
          {targets.map(target => (
            <div key={target.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-sm">
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">{target.displayName}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{target.channel} / {target.to}</p>
                {target.notes && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">备注：{target.notes}</p>}
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleRequestAllowlist(target)}>
                {target.allowlisted ? '已允许' : '申请加入 allowlist'}
              </Button>
            </div>
          ))}
          {targets.length === 0 && (
            <EmptyState message="暂无目标" />
          )}
        </div>

        <div className="pt-4 border-t border-[hsl(var(--border))] grid grid-cols-1 md:grid-cols-2 gap-3">
          <ThemeSelect value={newTargetProfileId} onChange={e => setNewTargetProfileId(e.target.value)} fieldSize="lg" fieldShape="pill">
            <option value="">选择通讯档案</option>
            {commsProfiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </ThemeSelect>
          <ThemeSelect
            value={newTargetChannel}
            onChange={e => setNewTargetChannel(e.target.value)}
            className="rounded-full px-4 py-2.5 text-sm"
          >
            <option value="slack">slack</option>
            <option value="telegram">telegram</option>
            <option value="discord">discord</option>
            <option value="msteams">msteams</option>
            <option value="signal">signal</option>
            <option value="whatsapp">whatsapp</option>
            <option value="imessage">imessage</option>
          </ThemeSelect>
          <ThemeInput
            value={newTargetTo}
            onChange={e => setNewTargetTo(e.target.value)}
            placeholder="收件人/频道 ID"
            className="rounded-full px-4 py-2.5 text-sm"
          />
          <ThemeInput
            value={newTargetDisplayName}
            onChange={e => setNewTargetDisplayName(e.target.value)}
            placeholder="显示名称"
            className="rounded-full px-4 py-2.5 text-sm"
          />
          <ThemeInput
            value={newTargetNotes}
            onChange={e => setNewTargetNotes(e.target.value)}
            placeholder="备注（可选）"
            className="rounded-full px-4 py-2.5 text-sm md:col-span-2"
          />
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <ThemeCheckbox checked={newTargetAllowlisted} onChange={e => setNewTargetAllowlisted(e.target.checked)} />
            创建时立即加入 allowlist
          </label>
          <Button className="md:col-span-2" onClick={handleCreateTarget}>
            新增目标
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
