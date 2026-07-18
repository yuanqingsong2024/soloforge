import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer } from './services/api-server'
import { startUnlockExpiryChecker } from './services/unlock-expiry-checker'
import { DoctorSchedulerService } from './services/doctor-scheduler'
import { HostAgentService } from './services/host-agent-service'
import { OutboxManager } from './services/outbox-manager'
import { getOrCreateLocalApiToken } from './middleware/local-auth'

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let apiPort: number
let shuttingDown = false

function isE2ETestMode(): boolean {
  return process.env.SOLOFORGE_E2E === '1'
}

function shouldOpenDevTools(): boolean {
  if (process.env.SOLOFORGE_E2E === '1') {
    return false
  }

  return Boolean(process.env.VITE_DEV_SERVER_URL)
}

async function createWindow() {
  // 启动本地 API 服务器
  apiPort = await startServer()

  const preloadPath = path.join(__dirname, '../preload/index.cjs')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#f7f9fc',
    webPreferences: {
      preload: isE2ETestMode() ? undefined : preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 配置内容安全策略（CSP）
  // 防止注入：仅允许本源脚本、样式、字体；禁止 eval/inline script；允许必要 API 连接
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
  const cspPolicy = isDev
    ? [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // Tailwind 需要 unsafe-inline
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:*" // 开发模式允许 Vite HMR
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://127.0.0.1:*" // 生产模式仅允许本地 API
      ].join('; ')

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspPolicy]
      }
    })
  })

  // 将 API 端口传递给 renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('api-port', apiPort)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    const rendererUrl = new URL(process.env.VITE_DEV_SERVER_URL)
    rendererUrl.searchParams.set('apiPort', String(apiPort))
    mainWindow.loadURL(rendererUrl.toString())
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: {
        apiPort: String(apiPort)
      }
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  Menu.setApplicationMenu(null)
}

// IPC Handlers
ipcMain.handle('ping', async () => {
  return 'pong'
})

ipcMain.handle('get-api-port', async () => {
  return apiPort
})

ipcMain.on('system:get-platform', event => {
  event.returnValue = process.platform
})

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-toggle-maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return false
  }
  mainWindow.maximize()
  return true
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

ipcMain.handle('i18n:get-system-locale', async () => {
  return app.getLocale()
})

ipcMain.handle('i18n:get-translations', async (_event, lang: string, ns: string) => {
  const filePath = path.join(app.getAppPath(), 'resources', 'locales', lang, `${ns}.json`)

  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    // 文件不存在或 JSON 解析失败时，降级为空对象
    return {}
  }
})

// IPC: 获取本地 API Token（由 local-auth 中间件统一管理）
ipcMain.handle('get-local-api-token', async () => {
  return await getOrCreateLocalApiToken()
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
  
  // 启动自动解锁到期检查
  startUnlockExpiryChecker()
  
  // 启动 Doctor 调度器
  DoctorSchedulerService.start()

  // 启动 Host Agent 心跳监控
  void HostAgentService.startHeartbeatMonitor()

  // 启动 Outbox 自动重试调度，保障远程不可达后的排队事件可自动恢复
  OutboxManager.startScheduler()
})

app.on('before-quit', () => {
  OutboxManager.stopScheduler()
})

function shutdown() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  OutboxManager.stopScheduler()

  if (app.isReady()) {
    app.quit()
    return
  }

  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
