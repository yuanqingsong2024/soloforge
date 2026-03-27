import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  getPlatform: () => os.platform(),
  onApiPort: (callback: (port: number) => void) => {
    ipcRenderer.on('api-port', (_event, port) => callback(port))
  }
})

export type ElectronAPI = {
  ping: () => Promise<string>
  getApiPort: () => Promise<number>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  getPlatform: () => NodeJS.Platform
  onApiPort: (callback: (port: number) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
