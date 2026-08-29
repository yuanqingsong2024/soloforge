import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer } from './services/api-server'
import { startUnlockExpiryChecker } from './services/unlock-expiry-checker'
import { DoctorSchedulerService } from './services/doctor-scheduler'
import { HostAgentService } from './services/host-agent-service'
import { OutboxManager } from './services/outbox-manager'
import { initTrayAndNotifications, destroyTray } from './services/tray-service'
import { offlineModeService } from './services/offline-mode-service'
import { getOrCreateLocalApiToken } from './middleware/local-auth'
import { isE2ETestMode } from './runtime-mode'
import { prisma } from './services/db'
import { logger } from './services/logger'

process.env.SOLOFORGE_PACKAGED = app.isPackaged ? '1' : '0'

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 全局 EPIPE 错误处理，防止 Prisma 日志写入在进程终止时报错
process.on('uncaughtException', (error: Error & { code?: string }) => {
  if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
    // 忽略管道断开错误（通常是进程终止时的日志写入失败）
    return
  }
  console.error('Uncaught Exception:', error)
})

let mainWindow: BrowserWindow | null = null
let apiPort: number
let shuttingDown = false

function shouldOpenDevTools(): boolean {
  if (isE2ETestMode()) {
    return false
  }

  return Boolean(process.env.VITE_DEV_SERVER_URL)
}

/** E2E 测试模式：在 migrate deploy 创建的空数据库中补种必要数据 */
async function ensureE2ETestData(): Promise<void> {
  try {
    // 1. 确保默认 Pipeline（支持工单流水线）
    const pipeline = await prisma.pipeline.upsert({
      where: { name: '标准交付流程' },
      update: { enabled: true },
      create: {
        name: '标准交付流程',
        enabled: true,
        steps: {
          create: [
            { order: 1, roleName: 'Support', inputArtifacts: '[]', outputArtifacts: '["CLIENT_MSG"]', requireApprovalActions: '[]', allowRework: false },
            { order: 2, roleName: 'PM&Writer', inputArtifacts: '["CLIENT_MSG"]', outputArtifacts: '["PRD","PLAN"]', requireApprovalActions: '[]', allowRework: true },
            { order: 3, roleName: 'Dev', inputArtifacts: '["PRD","PLAN"]', outputArtifacts: '["CODE_CHANGE"]', requireApprovalActions: '["MERGE_MAIN"]', allowRework: true },
            { order: 4, roleName: 'QA', inputArtifacts: '["CODE_CHANGE"]', outputArtifacts: '["TEST_CASES"]', requireApprovalActions: '[]', allowRework: true },
            { order: 5, roleName: 'Ops', inputArtifacts: '["CODE_CHANGE","TEST_CASES"]', outputArtifacts: '["DEPLOY"]', requireApprovalActions: '["DEPLOY_PROD"]', allowRework: false },
            { order: 6, roleName: 'Support', inputArtifacts: '["DEPLOY"]', outputArtifacts: '["DELIVERY_LIST","CLIENT_MSG"]', requireApprovalActions: '["SEND_EXTERNAL"]', allowRework: false }
          ]
        }
      }
    })

    // 2. 确保 ConnectionProfile（Local）
    const connProfile = await prisma.connectionProfile.upsert({
      where: { name: 'Local' },
      update: {},
      create: {
        name: 'Local',
        baseUrl: 'http://127.0.0.1:18789',
        wsUrl: 'ws://127.0.0.1:18789',
        authMode: 'token'
      }
    })

    // 3. 确保 CommsProfile（provider='claude-code'，dispatchOutboundMessage 需要这个条件）
    const commsProfile = await prisma.commsProfile.upsert({
      where: { name: 'e2e-openclaw' },
      update: { claudeCodeProfileId: connProfile.id, provider: 'claude-code' },
      create: {
        name: 'e2e-openclaw',
        provider: 'claude-code',
        claudeCodeProfileId: connProfile.id
      }
    })

    // 4. 确保 CommsTarget（allowlisted=true，resolveAllowlistedTarget 需要这个条件）
    const existingTarget = await prisma.commsTarget.findFirst({
      where: { channel: 'e2e', to: 'e2e-test-target' }
    })
    if (!existingTarget) {
      await prisma.commsTarget.create({
        data: {
          commsProfileId: commsProfile.id,
          channel: 'e2e',
          to: 'e2e-test-target',
          displayName: 'E2E 测试目标',
          allowlisted: true
        }
      })
    }

    logger.info('[E2E] 测试数据补种完成', 'startup', { pipelineId: pipeline.id, connProfileId: connProfile.id, commsProfileId: commsProfile.id })
  } catch (err) {
    logger.warn('[E2E] 测试数据补种失败（不影响功能）', 'startup', err instanceof Error ? err : new Error(String(err)))
  }
}

async function createWindow() {
  // 启动本地 API 服务器
  apiPort = await startServer()

  // E2E 模式下补种 Pipeline 数据（migrate deploy 不运行 seed）
  if (isE2ETestMode()) {
    await ensureE2ETestData()
  }

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
        // 开发模式：允许 unsafe-eval (Vite HMR) 和 unsafe-inline (Vite 内联脚本)
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'", // Tailwind 需要 unsafe-inline
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* ws://127.0.0.1:*" // 开发模式允许 Vite HMR
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
  
  // 初始化托盘和通知服务
  void initTrayAndNotifications()
  
  // 启动自动解锁到期检查（立即启动，优先级高）
  startUnlockExpiryChecker()
  
  // 延迟启动后台服务，避免阻塞 UI 渲染
  // 关键：这些服务不需要在首帧渲染前完成启动
  setTimeout(() => {
    // 启动 Doctor 调度器
    DoctorSchedulerService.start()
  }, 2000)
  
  setTimeout(() => {
    // 启动 Host Agent 心跳监控
    void HostAgentService.startHeartbeatMonitor()
  }, 3000)
  
  setTimeout(() => {
    // 启动 Outbox 自动重试调度，保障远程不可达后的排队事件可自动恢复
    OutboxManager.startScheduler()
  }, 4000)

  // 初始化离线模式服务（最后启动）
  if (mainWindow) {
    offlineModeService.initialize(mainWindow)
  }
})

app.on('before-quit', () => {
  OutboxManager.stopScheduler()
  destroyTray()
  offlineModeService.destroy()
})

function shutdown() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  OutboxManager.stopScheduler()
  destroyTray()

  if (app.isReady()) {
    app.quit()
    return
  }

  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

app.on('window-all-closed', () => {
  // macOS 保留托盘，Windows/Linux 退出应用
  if (process.platform !== 'darwin') {
    destroyTray()
    app.quit()
  }
})
