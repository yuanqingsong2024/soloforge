/**
 * 统一日志服务
 * 提供结构化日志、日志级别控制、日志持久化
 */

import fs from 'fs'
import path from 'path'

// 检测运行环境，只在 Electron 环境中导入 app
const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron
let electronAppPath: string | null = null

if (isElectron) {
  import('electron').then(({ app }) => {
    electronAppPath = app.getPath('userData')
  }).catch(() => {
    // Electron 导入失败，使用默认路径
  })
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  levelName: string
  message: string
  context?: string
  data?: unknown
  traceId?: string
  error?: {
    message: string
    stack?: string
  }
}

export interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableFile: boolean
  logDir?: string
  maxFileSize?: number // bytes
  maxFiles?: number
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
}

class Logger {
  private config: LoggerConfig
  private currentLogFile: string | null = null
  private writeStream: fs.WriteStream | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    if (this.config.enableFile) {
      this.initLogFile()
    }
  }

  private initLogFile(): void {
    try {
      let logDir: string
      if (isElectron && electronAppPath) {
        logDir = path.join(electronAppPath, 'logs')
      } else {
        // 非 Electron 环境使用当前目录下的 logs 文件夹
        logDir = path.join(process.cwd(), 'logs')
      }

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
      this.currentLogFile = path.join(logDir, `soloforge-${timestamp}.log`)

      this.writeStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' })

      // 清理旧日志文件
      this.cleanupOldLogs(logDir)
    } catch (error) {
      console.error('Failed to initialize log file:', error)
      this.config.enableFile = false
    }
  }

  private cleanupOldLogs(logDir: string): void {
    try {
      const files = fs
        .readdirSync(logDir)
        .filter((f) => f.startsWith('soloforge-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: path.join(logDir, f),
          mtime: fs.statSync(path.join(logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime)

      // 保留最新的 N 个文件
      const maxFiles = this.config.maxFiles || 5
      if (files.length > maxFiles) {
        files.slice(maxFiles).forEach((file) => {
          try {
            fs.unlinkSync(file.path)
          } catch (error) {
            console.error(`Failed to delete old log file ${file.name}:`, error)
          }
        })
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private formatEntry(entry: LogEntry): string {
    const parts = [
      entry.timestamp,
      `[${entry.levelName}]`,
      entry.context ? `[${entry.context}]` : '',
      entry.traceId ? `[trace:${entry.traceId}]` : '',
      entry.message
    ].filter(Boolean)

    let formatted = parts.join(' ')

    if (entry.data) {
      try {
        formatted += '\n  Data: ' + JSON.stringify(entry.data, null, 2)
      } catch {
        formatted += '\n  Data: [Circular or non-serializable]'
      }
    }

    if (entry.error) {
      formatted += '\n  Error: ' + entry.error.message
      if (entry.error.stack) {
        formatted += '\n  Stack: ' + entry.error.stack
      }
    }

    return formatted
  }

  private writeLog(entry: LogEntry): void {
    const formatted = this.formatEntry(entry)

    // Console output
    if (this.config.enableConsole) {
      switch (entry.level) {
        case LogLevel.DEBUG:
        case LogLevel.INFO:
          console.log(formatted)
          break
        case LogLevel.WARN:
          console.warn(formatted)
          break
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(formatted)
          break
      }
    }

    // File output
    if (this.config.enableFile && this.writeStream) {
      this.writeStream.write(formatted + '\n')
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: unknown,
    traceId?: string,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevel[level],
      message,
      context,
      data,
      traceId,
      error: error
        ? {
            message: error.message,
            stack: error.stack
          }
        : undefined
    }

    this.writeLog(entry)
  }

  debug(message: string, context?: string, data?: unknown, traceId?: string): void {
    this.log(LogLevel.DEBUG, message, context, data, traceId)
  }

  info(message: string, context?: string, data?: unknown, traceId?: string): void {
    this.log(LogLevel.INFO, message, context, data, traceId)
  }

  warn(message: string, context?: string, data?: unknown, traceId?: string): void {
    this.log(LogLevel.WARN, message, context, data, traceId)
  }

  error(message: string, context?: string, error?: Error, data?: unknown, traceId?: string): void {
    this.log(LogLevel.ERROR, message, context, data, traceId, error)
  }

  fatal(message: string, context?: string, error?: Error, data?: unknown, traceId?: string): void {
    this.log(LogLevel.FATAL, message, context, data, traceId, error)
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * 获取当前日志文件路径
   */
  getLogFilePath(): string | null {
    return this.currentLogFile
  }

  /**
   * 关闭日志流
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
  }
}

// 全局单例
export const logger = new Logger()

// 便捷导出
export const debug = logger.debug.bind(logger)
export const info = logger.info.bind(logger)
export const warn = logger.warn.bind(logger)
export const error = logger.error.bind(logger)
export const fatal = logger.fatal.bind(logger)
