import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { EmptyState, Button } from '../components/ui'
import { ThemeInput, ThemeSelect, ThemeTextarea } from '../components/ui/FormFields'

interface CommsTarget {
  id: string
  channel: string
  to: string
  displayName: string
  allowlisted: boolean
}

interface ContactTarget {
  id: string
  commsTargetId: string
  isPrimary: boolean
  channel: string
  toMasked: string
  displayName: string
}

interface Contact {
  id: string
  name: string
  company?: string | null
  tags: string[]
  notes: string
  contactTargets: ContactTarget[]
}

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [targets, setTargets] = useState<CommsTarget[]>([])
  const [selectedContactId, setSelectedContactId] = useState('')
  const [bindTargetId, setBindTargetId] = useState('')

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    void Promise.all([fetchContacts(), fetchTargets()])
  }, [])

  const selectedContact = useMemo(() => contacts.find(item => item.id === selectedContactId), [contacts, selectedContactId])

  const fetchContacts = async () => {
    const data = await apiFetch<Contact[]>('/api/contacts')
    setContacts(data)
  }

  const fetchTargets = async () => {
    const data = await apiFetch<CommsTarget[]>('/api/comms/targets')
    setTargets(data)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    await apiFetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim() || undefined,
        tags: tagsText.split(',').map(item => item.trim()).filter(Boolean),
        notes
      })
    })
    setName('')
    setCompany('')
    setTagsText('')
    setNotes('')
    await fetchContacts()
  }

  const handleBindTarget = async () => {
    if (!selectedContactId || !bindTargetId) return
    await apiFetch(`/api/contacts/${selectedContactId}/targets`, {
      method: 'POST',
      body: JSON.stringify({
        commsTargetId: bindTargetId,
        isPrimary: true
      })
    })
    setBindTargetId('')
    await fetchContacts()
  }

  return (
    <div>
      <PageHeader title="联系人管理" description="管理 Contact 与通讯 Targets 的绑定关系" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="新增联系人">
          <div className="space-y-3">
            <ThemeInput value={name} onChange={e => setName(e.target.value)} placeholder="联系人姓名" />
            <ThemeInput value={company} onChange={e => setCompany(e.target.value)} placeholder="公司（可选）" />
            <ThemeInput value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="标签，逗号分隔" />
            <ThemeTextarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="备注" rows={4} className="resize-y" />
            <Button className="w-full" onClick={handleCreate}>创建联系人</Button>
          </div>
        </SectionCard>

        <SectionCard title="绑定通讯目标">
          <div className="space-y-3">
            <ThemeSelect value={selectedContactId} onChange={e => setSelectedContactId(e.target.value)}>
              <option value="">选择联系人</option>
              {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </ThemeSelect>

            <ThemeSelect value={bindTargetId} onChange={e => setBindTargetId(e.target.value)}>
              <option value="">选择目标</option>
              {targets.map(target => (
                <option key={target.id} value={target.id}>{target.displayName} / {target.channel} / {target.allowlisted ? 'allowlisted' : '未allowlist'}</option>
              ))}
            </ThemeSelect>

            <Button variant="secondary" className="w-full" onClick={handleBindTarget}>绑定为主目标</Button>

            <div className="text-xs text-[hsl(var(--muted-foreground))]">仅 allowlisted 目标允许最终发送。</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="联系人列表">
        <div className="space-y-3">
          {contacts.map(contact => (
            <div key={contact.id} className="p-3 border border-[hsl(var(--border))] rounded-md">
              <p className="font-medium">{contact.name} {contact.company ? ` / ${contact.company}` : ''}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">标签：{contact.tags.join(', ') || '无'}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">备注：{contact.notes || '无'}</p>
              <div className="mt-2 space-y-1">
                {contact.contactTargets.map(target => (
                  <p key={target.id} className="text-xs">{target.isPrimary ? '主目标' : '备选'} / {target.displayName} / {target.channel} / {target.toMasked}</p>
                ))}
              </div>
            </div>
          ))}
          {contacts.length === 0 && <EmptyState message="暂无联系人" />}
          {selectedContact && <p className="text-xs text-[hsl(var(--muted-foreground))]">当前选中：{selectedContact.name}</p>}
        </div>
      </SectionCard>
    </div>
  )
}
