import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

interface EventRecordLite {
  id: string
  targetId?: string | null
  sourceType: string
  eventType: string
  createdAt: string
}

interface UseEventDrivenRefreshOptions {
  workspaceId?: string
  targetId: string | undefined
  enabled: boolean
  hasActiveWork?: boolean
  intervalMs?: number
  sourceTypes?: string[]
  onRelevantEvent: () => Promise<void> | void
}

export function useEventDrivenRefresh({
  workspaceId,
  targetId,
  enabled,
  hasActiveWork = true,
  intervalMs = 4000,
  sourceTypes = ['DEPLOYMENT_JOB', 'HOST_AGENT'],
  onRelevantEvent
}: UseEventDrivenRefreshOptions) {
  const [lastEventPollAt, setLastEventPollAt] = useState<string | null>(null)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  )
  const [failureCount, setFailureCount] = useState(0)

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (!enabled || !hasActiveWork || (!targetId && !workspaceId)) {
      return
    }

    const poll = async () => {
      try {
        const baseParams = new URLSearchParams({ limit: '10' })
        if (targetId) {
          baseParams.set('targetId', targetId)
        }
        if (workspaceId) {
          baseParams.set('workspaceId', workspaceId)
        }

        const responses = await Promise.all(
          sourceTypes.map(async (sourceType) => {
            const params = new URLSearchParams(baseParams)
            params.set('sourceType', sourceType)
            const events = await apiFetch<EventRecordLite[]>(`/api/event-records?${params.toString()}`)
            return { sourceType, events }
          })
        )

        setLastEventPollAt(new Date().toISOString())
        if (failureCount !== 0) {
          setFailureCount(0)
        }

        const hasRelevantEvent = responses.some(({ sourceType, events }) => {
          const eventList = Array.isArray(events) ? events : []
          if (eventList.length === 0) return false
          if (sourceType === 'DEPLOYMENT_JOB') {
            return eventList.some(event => event.sourceType === 'DEPLOYMENT_JOB' || event.eventType.includes('DEPLOYMENT'))
          }
          if (sourceType === 'HOST_AGENT') {
            return eventList.some(event => event.eventType.startsWith('HOST_AGENT_ACTION_') || event.eventType === 'HOST_AGENT_HEARTBEAT')
          }
          return eventList.length > 0
        })

        if (hasRelevantEvent) {
          await onRelevantEvent()
        }
      } catch (error) {
        setFailureCount((count) => Math.min(count + 1, 5))
        console.error('Failed to poll event-driven refresh:', error)
      }
    }

    const visibilityAdjustedInterval = isDocumentVisible ? intervalMs : Math.max(intervalMs * 4, 15000)
    const failureAdjustedInterval = visibilityAdjustedInterval * Math.max(1, 2 ** failureCount)
    const effectiveInterval = Math.min(failureAdjustedInterval, 120000)

    const interval = setInterval(() => {
      void poll()
    }, effectiveInterval)

    if (isDocumentVisible) {
      void poll()
    }

    return () => clearInterval(interval)
  }, [enabled, hasActiveWork, targetId, workspaceId, intervalMs, sourceTypes, onRelevantEvent, isDocumentVisible, failureCount])

  return {
    lastEventPollAt,
    failureCount
  }
}
