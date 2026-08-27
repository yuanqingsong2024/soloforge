/**
 * 离线模式服务
 * 
 * 功能：
 * 1. 检测网络状态（WebSocket 心跳 + Navigator.onLine）
 * 2. 维护离线操作队列
 * 3. 网络恢复后自动同步
 * 4. 提供 IPC 接口供 UI 层查询状态
 */

import { BrowserWindow, ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'

export interface QueuedOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entity: string
  data: unknown
  timestamp: string
  retryCount: number
  maxRetries: number
}

export interface OfflineStatus {
  isOnline: boolean
  pendingOperations: number
  lastOnlineAt: string | null
  lastOfflineAt: string | null
}

export type OfflineSyncHandler = (operation: QueuedOperation) => Promise<void>

class OfflineModeService {
  private isOnline = true
  private syncHandler: OfflineSyncHandler | null = null
  private pendingOperations: Map<string, QueuedOperation> = new Map()
  private lastOnlineAt: string | null = null
  private lastOfflineAt: string | null = null
  private mainWindow: BrowserWindow | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private syncInterval: NodeJS.Timeout | null = null

  constructor() {
    // 在构造函数中注册 IPC handlers，确保 preload 可以调用
    this.registerIpcHandlers()
  }

  /**
   * 初始化离线模式服务
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow

    // 监听浏览器网络状态变化
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline())
      window.addEventListener('offline', () => this.handleOffline())
      
      // 初始化状态
      this.isOnline = navigator.onLine
      if (this.isOnline) {
        this.lastOnlineAt = new Date().toISOString()
      }
    }

    // 注册 IPC 处理器
    this.registerIpcHandlers()

    // 启动心跳检测（每 30 秒检测一次）
    this.startHeartbeat()

    // 启动同步检查（每 60 秒尝试同步一次待处理操作）
    this.startSyncChecker()

    console.log('[OfflineMode] 离线模式服务已初始化')
  }

  /**
   * 销毁离线模式服务
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    // 移除 IPC 处理器
    ipcMain.removeHandler('offline:getStatus')
    ipcMain.removeHandler('offline:getPendingOperations')
    ipcMain.removeHandler('offline:clearPendingOperations')
    ipcMain.removeHandler('offline:retrySync')

    console.log('[OfflineMode] 离线模式服务已销毁')
  }

  /**
   * 获取当前离线状态
   */
  getStatus(): OfflineStatus {
    return {
      isOnline: this.isOnline,
      pendingOperations: this.pendingOperations.size,
      lastOnlineAt: this.lastOnlineAt,
      lastOfflineAt: this.lastOfflineAt
    }
  }

  /**
   * 获取所有待处理的离线操作
   */
  getPendingOperations(): QueuedOperation[] {
    return Array.from(this.pendingOperations.values())
  }

  /**
   * 添加操作到离线队列
   * 返回是否成功加入队列（如果在线则不加入）
   */
  queueOperation(
    type: QueuedOperation['type'],
    entity: string,
    data: unknown
  ): { queued: boolean; operationId?: string } {
    // 如果在线，不需要队列
    if (this.isOnline) {
      return { queued: false }
    }

    const operationId = uuidv4()
    const operation: QueuedOperation = {
      id: operationId,
      type,
      entity,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3
    }

    this.pendingOperations.set(operationId, operation)
    this.notifyRenderer()

    console.log(`[OfflineMode] 操作已加入队列: ${entity} ${type}`, { operationId })
    return { queued: true, operationId }
  }

  /**
   * 从队列中移除已同步的操作
   */
  removeOperation(operationId: string): void {
    if (this.pendingOperations.delete(operationId)) {
      this.notifyRenderer()
      console.log(`[OfflineMode] 操作已从队列移除: ${operationId}`)
    }
  }

  /**
   * 清空所有待处理操作
   */
  clearPendingOperations(): void {
    this.pendingOperations.clear()
    this.notifyRenderer()
    console.log('[OfflineMode] 已清空所有待处理操作')
  }

  /**
   * 手动触发同步
   */
  async retrySync(): Promise<{ synced: number; failed: number }> {
    if (this.pendingOperations.size === 0) {
      return { synced: 0, failed: 0 }
    }

    let synced = 0
    let failed = 0

    const operations = Array.from(this.pendingOperations.entries())
    for (const [operationId, operation] of operations) {
      try {
        // 这里调用实际的同步逻辑
        // 具体实现取决于操作类型和实体
        await this.syncOperation(operation)
        this.pendingOperations.delete(operationId)
        synced++
      } catch (error) {
        operation.retryCount++
        if (operation.retryCount >= operation.maxRetries) {
          console.error(`[OfflineMode] 操作同步失败，已达最大重试次数:`, operation)
          this.pendingOperations.delete(operationId)
          failed++
        } else {
          console.warn(`[OfflineMode] 操作同步失败，将重试:`, operation, error)
        }
      }
    }

    this.notifyRenderer()
    console.log(`[OfflineMode] 同步完成: 成功 ${synced}, 失败 ${failed}`)
    return { synced, failed }
  }

  /**
   * 处理网络上线
   */
  private handleOnline(): void {
    if (!this.isOnline) {
      this.isOnline = true
      this.lastOnlineAt = new Date().toISOString()
      console.log('[OfflineMode] 网络已恢复')
      this.notifyRenderer()

      // 自动触发同步
      this.retrySync()
    }
  }

  /**
   * 处理网络断线
   */
  private handleOffline(): void {
    if (this.isOnline) {
      this.isOnline = false
      this.lastOfflineAt = new Date().toISOString()
      console.log('[OfflineMode] 网络已断开，进入离线模式')
      this.notifyRenderer()
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // 使用 HEAD 请求快速检测网络可达性
        await fetch('http://127.0.0.1:1', {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000)
        })
        // fetch 成功表示网络可达
        if (!this.isOnline) {
          this.handleOnline()
        }
      } catch {
        // 网络不可达
        if (this.isOnline) {
          this.handleOffline()
        }
      }
    }, 30000) // 每 30 秒检测一次
  }

  /**
   * 启动同步检查器
   */
  private startSyncChecker(): void {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.pendingOperations.size > 0) {
        console.log('[OfflineMode] 定时同步检查...')
        this.retrySync()
      }
    }, 60000) // 每 60 秒检查一次
  }

  /**
   * 注册离线操作同步处理器，由主进程 API 层注入真实实现。
   */
  setSyncHandler(handler: OfflineSyncHandler): void {
    this.syncHandler = handler
  }

  /**
   * 同步单个操作
   */
  private async syncOperation(operation: QueuedOperation): Promise<void> {
    if (!this.syncHandler) {
      throw new Error(`离线操作暂不支持同步：${operation.type}/${operation.entity}`)
    }
    await this.syncHandler(operation)
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIpcHandlers(): void {
    ipcMain.handle('offline:getStatus', () => this.getStatus())
    ipcMain.handle('offline:getPendingOperations', () => this.getPendingOperations())
    ipcMain.handle('offline:clearPendingOperations', () => this.clearPendingOperations())
    ipcMain.handle('offline:retrySync', () => this.retrySync())
  }

  /**
   * 通知渲染进程状态变化
   */
  private notifyRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('offline:statusChanged', this.getStatus())
    }
  }
}

// 导出单例
export const offlineModeService = new OfflineModeService()
