/// <reference types="vite/client" />

import type { ElectronAPI } from '../preload'

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
