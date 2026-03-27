import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer } from './services/api-server'
import { startUnlockExpiryChecker } from './services/unlock-expiry-checker'
import { DoctorSchedulerService } from './services/doctor-scheduler'
import { HostAgentService } from './services/host-agent-service'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let apiPort: number

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
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: isE2ETestMode() ? undefined : preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
