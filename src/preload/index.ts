// 注意：preload 在 sandbox 环境下以 CommonJS 方式执行。
// 为避免打包产物残留 ESM import 导致 preload 加载失败，这里使用 require 写法。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')
// 注意：sandbox preload 中无法 require Node 内置模块（如 os）。
// 如需平台信息，改走 IPC。

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  /** 获取本地 API 认证 Token（由 main process 管理，存储在 Keychain） */
  getLocalApiToken: () => ipcRenderer.invoke('get-local-api-token'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  i18n: {
    getSystemLocale: () => ipcRenderer.invoke('i18n:get-system-locale'),
    getTranslations: (lang: string, ns: string) =>
      ipcRenderer.invoke('i18n:get-translations', lang, ns)
  },
  getPlatform: () => ipcRenderer.sendSync('system:get-platform'),
  onApiPort: (callback: (port: number) => void) => {
    ipcRenderer.on('api-port', (_event, port) => callback(port))
  }
})
