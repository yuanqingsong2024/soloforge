/**
 * 系统托盘服务
 * 
 * 职责：
 * 1. 管理 Electron 系统托盘图标
 * 2. 提供托盘菜单
 * 3. 处理托盘交互事件
 * 4. 支持托盘通知角标
 */

import { 
  Tray, 
  Menu, 
  nativeImage, 
  app, 
  BrowserWindow
} from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from './logger'
import { 
  requestNotificationPermission,
  processNotificationQueue 
} from './notification-service'

// ============================================
// 类型定义
// ============================================

interface TrayStatus {
  label: string
  color: string
}

interface TrayConfig {
  iconPath?: string
  toolTip?: string
  showMenu?: boolean
}

// ============================================
// 托盘状态
// ============================================

let tray: Tray | null = null
let currentStatus: TrayStatus | null = null
const statusListeners = new Set<(status: TrayStatus | null) => void>()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================
// 托盘初始化
// ============================================

/**
 * 创建系统托盘
 */
export function createTray(config: TrayConfig = {}): Tray {
  if (tray) {
    logger.warn('[Tray] 托盘已存在')
    return tray
  }

  const iconPath = config.iconPath || getDefaultIconPath()
  const toolTip = config.toolTip || 'SoloForge - Workshop OS'

  try {
    // 创建托盘图标
    let icon: Electron.NativeImage
    try {
      icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        // 如果图标文件不存在，创建默认图标
        icon = createDefaultIcon()
      }
    } catch {
      icon = createDefaultIcon()
    }

    tray = new Tray(icon)
    tray.setToolTip(toolTip)

    // 设置上下文菜单
    if (config.showMenu !== false) {
      updateTrayMenu()
    }

    // 双击打开主窗口
    tray.on('double-click', () => {
      showMainWindow()
    })

    // 单击聚焦窗口
    tray.on('click', () => {
      showMainWindow()
    })

    logger.info('[Tray] 系统托盘已创建')
    return tray
  } catch (error) {
    logger.error('[Tray] 创建托盘失败:', error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * 获取默认图标路径
 */
function getDefaultIconPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(__dirname, '../../resources/icons/tray-icon.png')
  }
  return path.join(process.resourcesPath, 'icons', 'tray-icon.png')
}

/**
 * 创建默认图标（纯色圆点）
 */
function createDefaultIcon(): Electron.NativeImage {
  // 创建一个 16x16 的简单图标
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  
  // 填充蓝色
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4
    canvas[offset] = 66     // R
    canvas[offset + 1] = 135 // G  
    canvas[offset + 2] = 250 // B
    canvas[offset + 3] = 255 // A
  }
  
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

/**
 * 销毁系统托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    currentStatus = null
    logger.info('[Tray] 系统托盘已销毁')
  }
}

/**
 * 获取当前托盘实例
 */
export function getTray(): Tray | null {
  return tray
}

// ============================================
// 托盘菜单
// ============================================

/**
 * 更新托盘菜单
 */
export function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 SoloForge',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: '状态',
      submenu: [
        {
          label: '运行健康',
          type: 'radio',
          checked: currentStatus?.label === 'healthy',
          click: () => setTrayStatus({ label: 'healthy', color: '#22c55e' })
        },
        {
          label: '需要关注',
          type: 'radio',
          checked: currentStatus?.label === 'attention',
          click: () => setTrayStatus({ label: 'attention', color: '#f59e0b' })
        },
        {
          label: '空闲',
          type: 'radio',
          checked: currentStatus?.label === 'idle',
          click: () => setTrayStatus({ label: 'idle', color: '#6b7280' })
        }
      ]
    },
    { type: 'separator' },
    {
      label: '通知设置',
      click: () => {
        showMainWindow()
        sendToRenderer('navigate', '/settings/notifications')
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

// ============================================
// 托盘状态
// ============================================

/**
 * 设置托盘状态
 */
export function setTrayStatus(status: TrayStatus): void {
  currentStatus = status
  updateTrayMenu()
  
  // 通知所有监听器
  for (const listener of statusListeners) {
    listener(status)
  }
  
  logger.debug(`[Tray] 状态更新: ${status.label}`)
}

/**
 * 获取当前托盘状态
 */
export function getTrayStatus(): TrayStatus | null {
  return currentStatus
}

/**
 * 添加状态监听器
 */
export function addStatusListener(listener: (status: TrayStatus | null) => void): void {
  statusListeners.add(listener)
}

/**
 * 移除状态监听器
 */
export function removeStatusListener(listener: (status: TrayStatus | null) => void): void {
  statusListeners.delete(listener)
}

// ============================================
// 窗口管理
// ============================================

/**
 * 显示主窗口
 */
function showMainWindow(): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const mainWindow = windows[0]
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

// ============================================
// 托盘通知角标
// ============================================

/**
 * 设置托盘通知数量角标（macOS）
 */
export function setTrayBadge(count: number): void {
  if (process.platform === 'darwin') {
    app.dock?.setBadge(count > 0 ? String(count) : '')
  }
  logger.debug(`[Tray] 角标数量: ${count}`)
}

/**
 * 清除托盘通知角标
 */
export function clearTrayBadge(): void {
  setTrayBadge(0)
}

// ============================================
// 辅助函数
// ============================================

function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

// ============================================
// 初始化
// ============================================

/**
 * 初始化系统托盘和通知服务
 */
export async function initTrayAndNotifications(): Promise<void> {
  // 请求通知权限
  const hasPermission = await requestNotificationPermission()
  if (hasPermission) {
    // 处理队列中的通知
    await processNotificationQueue()
  }

  // 创建托盘
  createTray({
    toolTip: 'SoloForge - Workshop OS'
  })

  // 设置默认状态
  setTrayStatus({ label: 'idle', color: '#6b7280' })

  logger.info('[Tray] 托盘和通知服务初始化完成')
}
