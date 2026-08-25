/**
 * 数据库统一入口模块
 *
 * 职责：
 * 1. 提供全局唯一的 PrismaClient 实例（消除各服务文件重复 new PrismaClient() 的问题）
 * 2. 在 Prisma 初始化后应用 SQLite PRAGMA 优化，提升读写并发能力
 *
 * 设计约束（AGENTS.md §6 数据库操作）：
 * - 所有服务统一从此文件导入 prisma，禁止再 new PrismaClient()
 * - AuditLog 禁止 update/delete（append-only）
 * - 所有关键操作写入审计日志
 */

import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

/**
 * 全局唯一 PrismaClient 实例
 *
 * 日志策略：
 * - 开发模式：仅 warn/error，避免过多日志导致 EPIPE 错误
 * - 生产模式：仅 error
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['warn', 'error']
    : ['error']
})

/**
 * SQLite PRAGMA 优化标记，避免重复执行
 */
let pragmaOptimized = false

/**
 * 应用 SQLite PRAGMA 优化
 *
 * - WAL 模式：读写并发，写不阻塞读
 * - synchronous=NORMAL：平衡安全与性能（WAL 模式下足够安全）
 * - cache_size：64MB 内存缓存
 * - temp_store=MEMORY：临时表走内存
 * - mmap_size：256MB 内存映射，减少 I/O
 * - busy_timeout=30000：30秒超时（网络驱动器必需）
 *
 * 幂等：多次调用安全，仅首次执行
 */
export async function optimizeSqlite(): Promise<void> {
  if (pragmaOptimized) return
  pragmaOptimized = true

  try {
    // 等待 Prisma 连接就绪（处理网络驱动器延迟）
    await prisma.$connect()
    await prisma.$executeRaw`PRAGMA journal_mode = WAL`
    await prisma.$executeRaw`PRAGMA synchronous = NORMAL`
    await prisma.$executeRaw`PRAGMA cache_size = -64000`
    await prisma.$executeRaw`PRAGMA temp_store = MEMORY`
    await prisma.$executeRaw`PRAGMA mmap_size = 268435456`
    await prisma.$executeRaw`PRAGMA busy_timeout = 30000`
    logger.info('[DB] SQLite PRAGMA 优化已应用: WAL/NORMAL/64MB-cache/256MB-mmap/30s-timeout')
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[DB] SQLite PRAGMA 优化失败: ${errMsg}`)
    // 不抛异常：PRAGMA 失败不应阻断应用启动，SQLite 仍可用默认配置运行
  }
}

export { prisma }
