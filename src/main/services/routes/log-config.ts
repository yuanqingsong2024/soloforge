// ============================================
// SoloForge Log Configuration API
// 日志配置 API
// ============================================

import type { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'

// 日志级别
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

// 日志配置
interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableFile: boolean
  maxFileSize: number
  maxFiles: number
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
}

// 获取配置路径
function getConfigPath(): string {
  const configDir = path.join(os.homedir(), '.soloforge')
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  return path.join(configDir, 'logger-config.json')
}

// 读取配置
function readConfig(): LoggerConfig {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch {
    // 忽略错误
  }
  return DEFAULT_CONFIG
}

// 保存配置
function saveConfig(config: LoggerConfig): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

// 内存中的日志缓冲区（用于查询）
const logBuffer: Array<{
  timestamp: string
  level: string
  levelName: string
  message: string
  context?: string
  data?: unknown
}> = []
const MAX_BUFFER_SIZE = 1000

// 记录日志到缓冲区
export function bufferLog(entry: {
  timestamp: string
  level: number
  levelName: string
  message: string
  context?: string
  data?: unknown
}) {
  logBuffer.push({
    timestamp: entry.timestamp,
    level: entry.levelName,
    levelName: entry.levelName,
    message: entry.message,
    context: entry.context,
    data: entry.data
  })

  // 保持缓冲区大小
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift()
  }
}

/**
 * 注册日志配置路由
 */
export function registerLogConfigRoutes(fastify: FastifyInstance): void {
  // 获取日志配置
  fastify.get('/api/logs/config', async () => {
    const config = readConfig()
    return {
      success: true,
      data: config
    }
  })

  // 更新日志配置
  fastify.put('/api/logs/config', async (request) => {
    const body = request.body as Partial<LoggerConfig>

    // 验证配置
    if (body.level !== undefined && (body.level < 0 || body.level > 4)) {
      return {
        success: false,
        error: '无效的日志级别'
      }
    }

    if (body.maxFileSize !== undefined && body.maxFileSize < 1024) {
      return {
        success: false,
        error: '文件大小必须至少 1KB'
      }
    }

    if (body.maxFiles !== undefined && (body.maxFiles < 1 || body.maxFiles > 100)) {
      return {
        success: false,
        error: '文件数量必须在 1-100 之间'
      }
    }

    // 合并新配置
    const currentConfig = readConfig()
    const newConfig: LoggerConfig = {
      ...currentConfig,
      ...body
    }

    // 保存配置
    saveConfig(newConfig)

    // 更新内存中的日志级别
    if (newConfig.level !== undefined) {
      console.log(`[LogConfig] Log level changed to: ${LogLevel[newConfig.level]}`)
    }

    return {
      success: true,
      data: newConfig
    }
  })

  // 查询日志
  fastify.get('/api/logs/query', async (request) => {
    const query = request.query as {
      level?: string
      context?: string
      search?: string
      start?: string
      end?: string
      limit?: string
    }

    const levelFilter = query.level ? parseInt(query.level, 10) : LogLevel.INFO
    const limit = Math.min(parseInt(query.limit || '100', 10), 1000)

    let logs = logBuffer.filter(log => {
      // 按级别过滤
      const logLevel = LogLevel[log.level as keyof typeof LogLevel] ?? LogLevel.INFO
      if (logLevel < levelFilter) return false

      // 按上下文过滤
      if (query.context && log.context !== query.context) return false

      // 按内容搜索
      if (query.search && !log.message.toLowerCase().includes(query.search.toLowerCase())) return false

      // 按时间范围过滤
      if (query.start && log.timestamp < query.start) return false
      if (query.end && log.timestamp > query.end) return false

      return true
    })

    // 限制返回数量
    logs = logs.slice(-limit)

    return {
      success: true,
      data: {
        logs,
        total: logs.length,
        bufferSize: logBuffer.length
      }
    }
  })

  // 获取日志统计
  fastify.get('/api/logs/stats', async () => {
    const stats = {
      bufferSize: logBuffer.length,
      maxBufferSize: MAX_BUFFER_SIZE,
      byLevel: {} as Record<string, number>,
      byContext: {} as Record<string, number>,
      recentCount: 0
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    for (const log of logBuffer) {
      // 统计级别
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1

      // 统计上下文
      if (log.context) {
        stats.byContext[log.context] = (stats.byContext[log.context] || 0) + 1
      }

      // 统计最近一小时的日志
      if (log.timestamp > oneHourAgo) {
        stats.recentCount++
      }
    }

    return {
      success: true,
      data: stats
    }
  })

  // 清空日志缓冲区
  fastify.delete('/api/logs/buffer', async () => {
    const cleared = logBuffer.length
    logBuffer.length = 0

    return {
      success: true,
      data: { cleared }
    }
  })

  // 导出日志（用于调试）
  fastify.get('/api/logs/export', async (request) => {
    const query = request.query as {
      format?: 'json' | 'text'
      limit?: string
    }

    const format = query.format || 'json'
    const limit = Math.min(parseInt(query.limit || '1000', 10), 10000)

    const logs = logBuffer.slice(-limit)

    if (format === 'text') {
      const text = logs.map(log =>
        `[${log.timestamp}] [${log.level}]${log.context ? ` [${log.context}]` : ''} ${log.message}`
      ).join('\n')

      return {
        success: true,
        contentType: 'text/plain',
        data: text
      }
    }

    return {
      success: true,
      contentType: 'application/json',
      data: {
        exportedAt: new Date().toISOString(),
        count: logs.length,
        logs
      }
    }
  })

  // 获取日志级别选项
  fastify.get('/api/logs/levels', async () => {
    const levels = Object.entries(LogLevel)
      .filter(([key]) => isNaN(parseInt(key, 10)))
      .map(([name, value]) => ({
        name,
        value: value as number,
        description: getLevelDescription(name)
      }))

    return {
      success: true,
      data: levels
    }
  })
}

// 获取级别描述
function getLevelDescription(level: string): string {
  switch (level) {
    case 'DEBUG':
      return '调试信息：详细的开发调试信息'
    case 'INFO':
      return '一般信息：正常运行时的关键事件'
    case 'WARN':
      return '警告：可能存在问题但不影响运行'
    case 'ERROR':
      return '错误：操作失败但应用可继续'
    case 'FATAL':
      return '致命错误：导致应用无法继续运行'
    default:
      return ''
  }
}
