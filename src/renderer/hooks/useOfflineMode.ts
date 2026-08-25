/**
 * 离线模式 React Hook
 * 
 * 提供：
 * - isOnline: 当前是否在线
 * - pendingCount: 待处理的离线操作数量
 * - retrySync: 手动触发同步
 * - clearPending: 清空待处理操作
 */

import { useState, useEffect, useCallback } from 'react'

export interface OfflineStatus {
  isOnline: boolean
  pendingOperations: number
  lastOnlineAt: string | null
  lastOfflineAt: string | null
}

declare global {
  interface Window {
    electronAPI: {
      offline: {
        getStatus: () => Promise<OfflineStatus>
        getPendingOperations: () => Promise<unknown[]>
        clearPendingOperations: () => Promise<void>
        retrySync: () => Promise<{ synced: number; failed: number }>
        onStatusChanged: (callback: (status: OfflineStatus) => void) => void
      }
      // 其他 electronAPI 方法...
      ping: () => Promise<string>
      getApiPort: () => Promise<number>
      getLocalApiToken: () => Promise<string>
      minimizeWindow: () => Promise<void>
      toggleMaximizeWindow: () => Promise<boolean>
      closeWindow: () => Promise<void>
      isWindowMaximized: () => Promise<boolean>
      i18n: {
        getSystemLocale: () => Promise<string>
        getTranslations: (lang: string, ns: string) => Promise<Record<string, unknown>>
      }
      getPlatform: () => string
      onApiPort: (callback: (port: number) => void) => void
    }
  }
}

export function useOfflineStatus() {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: true,
    pendingOperations: 0,
    lastOnlineAt: null,
    lastOfflineAt: null
  })

  // 监听状态变化
  useEffect(() => {
    if (!window.electronAPI?.offline?.onStatusChanged) return

    window.electronAPI.offline.onStatusChanged((newStatus: OfflineStatus) => {
      setStatus(newStatus)
    })

    // 初始加载
    window.electronAPI.offline.getStatus().then(setStatus).catch(console.error)
  }, [])

  const retrySync = useCallback(async () => {
    if (!window.electronAPI?.offline?.retrySync) return { synced: 0, failed: 0 }
    return window.electronAPI.offline.retrySync()
  }, [])

  const clearPending = useCallback(async () => {
    if (!window.electronAPI?.offline?.clearPendingOperations) return
    await window.electronAPI.offline.clearPendingOperations()
    // 刷新状态
    const newStatus = await window.electronAPI.offline.getStatus()
    setStatus(newStatus)
  }, [])

  return {
    isOnline: status.isOnline,
    pendingCount: status.pendingOperations,
    lastOnlineAt: status.lastOnlineAt,
    lastOfflineAt: status.lastOfflineAt,
    retrySync,
    clearPending
  }
}

/**
 * 离线操作队列 Hook
 * 用于在离线时缓存操作，网络恢复后自动同步
 */
export function useOfflineQueue<T>(
  _entity: string,
  syncFn: (operation: { type: 'create' | 'update' | 'delete'; data: T }) => Promise<void>
) {
  const { isOnline } = useOfflineStatus()
  const [queue, setQueue] = useState<T[]>([])

  // 添加操作到队列
  const enqueue = useCallback((data: T) => {
    if (isOnline) {
      // 在线时直接同步
      syncFn({ type: 'create', data })
    } else {
      // 离线时加入队列
      setQueue(prev => [...prev, data])
    }
  }, [isOnline, syncFn])

  // 网络恢复时自动同步
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      const processQueue = async () => {
        for (const item of queue) {
          try {
            await syncFn({ type: 'create', data: item })
          } catch (error) {
            console.error('离线队列同步失败:', error)
          }
        }
        setQueue([])
      }
      processQueue()
    }
  }, [isOnline, queue, syncFn])

  return {
    enqueue,
    queueLength: queue.length
  }
}
