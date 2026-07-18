// Preload 暴露的 electronAPI 类型声明；此文件不参与运行时代码构建。
export type ElectronAPI = {
  ping: () => Promise<string>
  getApiPort: () => Promise<number>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  i18n: {
    getSystemLocale: () => Promise<string>
    getTranslations: (lang: string, ns: string) => Promise<Record<string, unknown>>
  }
  getPlatform: () => NodeJS.Platform
  onApiPort: (callback: (port: number) => void) => void
}
