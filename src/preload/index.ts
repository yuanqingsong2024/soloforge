import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  onApiPort: (callback: (port: number) => void) => {
    ipcRenderer.on('api-port', (_event, port) => callback(port))
  }
})

export type ElectronAPI = {
  ping: () => Promise<string>
  getApiPort: () => Promise<number>
  onApiPort: (callback: (port: number) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
