/**
 * 桌面通知服务
 * 
 * 职责：
 * 1. 管理 Electron 原生通知
 * 2. 处理通知点击事件
 * 3. 支持通知队列和去重
 * 4. 提供通知权限管理
 */

import { Notification, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'

// ============================================
// 类型定义
// ============================================

export type NotificationType = 
  | 'approval'
  | 'alert'
  | 'deployment'
  | 'agent'
  | 'ticket'
  | 'system'
  | 'info'

export interface NotificationOptions {
  title: string
  body: string
  type?: NotificationType
  urgency?: 'low' | 'normal' | 'critical'
  silent?: boolean
  timeout?: number // 毫秒，0 表示不自动关闭
  data?: Record<string, unknown> // 点击时传递的数据
  tag?: string // 用于去重
}

interface QueuedNotification {
  id: string
  options: NotificationOptions
  timestamp: number
}

// ============================================
// 通知服务状态
// ============================================

let notificationPermission: NotificationPermission | 'unknown' = 'unknown'
const notificationQueue: QueuedNotification[] = []
const sentNotifications = new Map<string, number>() // tag -> last shown timestamp
const MAX_QUEUE_SIZE = 50
const DEDUP_WINDOW_MS = 5000 // 5秒内相同 tag 的通知将被去重

// ============================================
// 权限管理
// ============================================

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notification.isSupported()) {
    logger.warn('[Notification] 系统不支持通知')
    return false
  }

  try {
    // Electron Notification.requestPermission 返回 Promise
    const result = await (Notification as unknown as { requestPermission: () => Promise<string> }).requestPermission()
    notificationPermission = result as NotificationPermission
    logger.info(`[Notification] 权限状态: ${result}`)
    return result === 'granted'
  } catch (error) {
    logger.error('[Notification] 请求权限失败:', error instanceof Error ? error.message : String(error))
    return false
  }
}

/**
 * 获取当前通知权限状态
 */
export function getNotificationPermission(): NotificationPermission | 'unknown' {
  return notificationPermission
}

/**
 * 检查是否可以发送通知
 */
export function canSendNotification(): boolean {
  if (!Notification.isSupported()) {
    return false
  }
  return notificationPermission === 'granted'
}

// ============================================
// 通知发送
// ============================================

/**
 * 发送桌面通知
 */
export function sendNotification(options: NotificationOptions): string | null {
  if (!canSendNotification()) {
    logger.warn('[Notification] 无法发送通知：权限不足或系统不支持')
    // 将通知加入队列，稍后重试
    queueNotification(options)
    return null
  }

  const id = uuidv4()
  
  // 去重检查
  if (options.tag) {
    const lastShown = sentNotifications.get(options.tag)
    const now = Date.now()
    if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
      logger.debug(`[Notification] 通知被去重: ${options.tag}`)
      return null
    }
    sentNotifications.set(options.tag, now)
  }

  try {
    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent ?? false,
      urgency: options.urgency ?? 'normal',
      timeoutType: options.timeout === 0 ? 'never' : 'default'
    })

    // 添加自定义数据
    if (options.data) {
      (notification as Notification & { notificationId?: string }).notificationId = id
    }

    notification.on('click', () => {
      logger.debug(`[Notification] 点击通知: ${id}`)
      handleNotificationClick(id, options)
    })

    notification.on('close', () => {
      logger.debug(`[Notification] 通知关闭: ${id}`)
    })

    notification.on('failed', (_event, error) => {
      logger.error(`[Notification] 通知失败: ${id}`, error)
    })

    notification.show()
    logger.info(`[Notification] 发送通知: ${options.title}`)
    
    // 清理过期的去重记录
    cleanupDedupRecords()
    
    return id
  } catch (error) {
    logger.error('[Notification] 创建通知失败:', error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * 处理通知点击
 */
function handleNotificationClick(id: string, options: NotificationOptions): void {
  // 聚焦主窗口
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const mainWindow = windows[0]
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }

  // 根据类型导航到相关页面
  if (options.data) {
    const { action, targetId } = options.data as { action?: string; targetId?: string }
    
    if (action) {
      sendToRenderer('notification:clicked', {
        id,
        action,
        targetId,
        type: options.type
      })
    }
  }
}

/**
 * 向渲染进程发送消息
 */
function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

// ============================================
// 通知队列
// ============================================

/**
 * 将通知加入队列
 */
function queueNotification(options: NotificationOptions): void {
  if (notificationQueue.length >= MAX_QUEUE_SIZE) {
    // 移除最老的通知
    notificationQueue.shift()
  }
  
  notificationQueue.push({
    id: uuidv4(),
    options,
    timestamp: Date.now()
  })
  
  logger.debug(`[Notification] 通知入队，队列长度: ${notificationQueue.length}`)
}

/**
 * 处理队列中的通知
 */
export async function processNotificationQueue(): Promise<void> {
  if (!canSendNotification() || notificationQueue.length === 0) {
    return
  }

  logger.info(`[Notification] 处理通知队列，剩余: ${notificationQueue.length}`)
  
  while (notificationQueue.length > 0 && canSendNotification()) {
    const queued = notificationQueue.shift()
    if (queued) {
      sendNotification(queued.options)
      // 添加小延迟避免通知过于密集
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

/**
 * 清空通知队列
 */
export function clearNotificationQueue(): void {
  notificationQueue.length = 0
  logger.info('[Notification] 通知队列已清空')
}

// ============================================
// 辅助函数
// ============================================

/**
 * 清理过期的去重记录
 */
function cleanupDedupRecords(): void {
  const now = Date.now()
  for (const [tag, timestamp] of sentNotifications.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS * 2) {
      sentNotifications.delete(tag)
    }
  }
}

// ============================================
// 便捷方法
// ============================================

/**
 * 发送审批通知
 */
export function sendApprovalNotification(
  title: string,
  body: string,
  approvalId: string
): string | null {
  return sendNotification({
    title,
    body,
    type: 'approval',
    urgency: 'normal',
    tag: `approval-${approvalId}`,
    data: {
      action: 'navigate',
      targetId: approvalId,
      page: '/approvals'
    }
  })
}

/**
 * 发送告警通知
 */
export function sendAlertNotification(
  title: string,
  body: string,
  alertId: string,
  severity: 'info' | 'warn' | 'error' | 'critical' = 'warn'
): string | null {
  return sendNotification({
    title,
    body,
    type: 'alert',
    urgency: severity === 'critical' ? 'critical' : severity === 'error' ? 'normal' : 'low',
    tag: `alert-${alertId}`,
    data: {
      action: 'navigate',
      targetId: alertId,
      page: '/health-monitoring'
    }
  })
}

/**
 * 发送部署状态通知
 */
export function sendDeploymentNotification(
  title: string,
  body: string,
  deploymentId: string,
  status: 'success' | 'failure' | 'progress' = 'success'
): string | null {
  return sendNotification({
    title,
    body,
    type: 'deployment',
    urgency: status === 'failure' ? 'critical' : 'normal',
    silent: status === 'progress',
    tag: `deployment-${deploymentId}`,
    data: {
      action: 'navigate',
      targetId: deploymentId,
      page: '/deployments'
    }
  })
}

/**
 * 发送系统信息通知
 */
export function sendSystemNotification(
  title: string,
  body: string
): string | null {
  return sendNotification({
    title,
    body,
    type: 'system',
    urgency: 'low',
    silent: true
  })
}
