/**
 * 服务层依赖注入容器
 *
 * 职责：
 * 1. 定义核心服务的依赖接口（ServiceDeps）
 * 2. 提供默认实现（使用全局 prisma 实例）
 * 3. 支持自定义注入（便于单元测试 mock）
 *
 * 设计原则（AGENTS.md §6 数据库操作）：
 * - 所有服务统一从此文件获取依赖
 * - 默认使用全局 prisma 实例（保持向后兼容）
 * - 单元测试时可注入 mock 实现
 */

import type { PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from './db'
import { logger } from './logger'

// ==================== 依赖接口定义 ====================

/**
 * Prisma 数据库客户端接口
 * 用于抽象数据库操作，便于 mock
 */
export interface IDatabaseClient {
  approval: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    create: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
    delete: (args: unknown) => Promise<unknown>
  }
  workspace: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    create: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
  }
  auditLog: {
    create: (args: unknown) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
  }
  commsTarget: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
  }
  outboundMessage: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
  }
  ticket: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    create: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
  }
  deploymentTarget: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    update: (args: unknown) => Promise<unknown>
  }
  hostAgent: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    findMany: (args?: unknown) => Promise<unknown[]>
    update: (args: unknown) => Promise<unknown>
  }
  alert: {
    findMany: (args?: unknown) => Promise<unknown[]>
    count: (args?: unknown) => Promise<number>
  }
  snapshotDiff: {
    findMany: (args?: unknown) => Promise<unknown[]>
    count: (args?: unknown) => Promise<number>
  }
  job: {
    findMany: (args?: unknown) => Promise<unknown[]>
    count: (args?: unknown) => Promise<number>
  }
  model: {
    findMany: (args?: unknown) => Promise<unknown[]>
  }
}

/**
 * 日志接口
 */
export interface ILogger {
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug?: (message: string, ...args: unknown[]) => void
}

/**
 * 核心服务依赖接口
 *
 * 使用场景：
 * 1. 单元测试：注入 mock 实现
 * 2. 集成测试：注入真实实现
 * 3. 生产：使用默认实现
 */
export interface ServiceDeps {
  /** 数据库客户端 */
  db: IDatabaseClient
  /** 日志记录器 */
  logger: ILogger
}

// ==================== 默认依赖实现 ====================

/**
 * 将 PrismaClient 转换为 IDatabaseClient
 * 实际使用时只用到部分方法，这里做类型适配
 */
function adaptPrismaToIDatabaseClient(prisma: PrismaClient): IDatabaseClient {
  return prisma as unknown as IDatabaseClient
}

/**
 * 将 logger 适配为 ILogger
 */
function adaptLoggerToILogger(loggerInstance: typeof logger): ILogger {
  return {
    info: (message: string, ...args: unknown[]) => {
      // info(message, context?, data?, traceId?)
      if (args.length === 0) loggerInstance.info(message)
      else if (args.length === 1) loggerInstance.info(message, args[0] as string)
      else if (args.length === 2) loggerInstance.info(message, args[0] as string, args[1])
      else loggerInstance.info(message, args[0] as string, args[1], args[2] as string)
    },
    warn: (message: string, ...args: unknown[]) => {
      // warn(message, context?, data?, traceId?)
      if (args.length === 0) loggerInstance.warn(message)
      else if (args.length === 1) loggerInstance.warn(message, args[0] as string)
      else if (args.length === 2) loggerInstance.warn(message, args[0] as string, args[1])
      else loggerInstance.warn(message, args[0] as string, args[1], args[2] as string)
    },
    error: (message: string, ...args: unknown[]) => {
      // error(message, context?, error?, data?, traceId?)
      if (args.length === 0) loggerInstance.error(message)
      else if (args.length === 1) loggerInstance.error(message, args[0] as string)
      else if (args.length === 2) loggerInstance.error(message, args[0] as string, args[1] as Error)
      else if (args.length === 3) loggerInstance.error(message, args[0] as string, args[1] as Error, args[2])
      else loggerInstance.error(message, args[0] as string, args[1] as Error, args[2], args[3] as string)
    },
    debug: (message: string, ...args: unknown[]) => {
      // debug(message, context?, data?, traceId?)
      if (args.length === 0) loggerInstance.debug(message)
      else if (args.length === 1) loggerInstance.debug(message, args[0] as string)
      else if (args.length === 2) loggerInstance.debug(message, args[0] as string, args[1])
      else loggerInstance.debug(message, args[0] as string, args[1], args[2] as string)
    },
  }
}

/**
 * 获取默认服务依赖
 *
 * 生产环境使用：
 * - 全局 prisma 实例
 * - 全局 logger 实例
 */
let defaultDeps: ServiceDeps | null = null

export function getDefaultDeps(): ServiceDeps {
  if (!defaultDeps) {
    defaultDeps = {
      db: adaptPrismaToIDatabaseClient(defaultPrisma),
      logger: adaptLoggerToILogger(logger),
    }
  }
  return defaultDeps
}

// ==================== 服务容器 ====================

/**
 * 服务实例容器
 * 支持注册和获取单例服务实例
 */
class ServiceContainer {
  private services = new Map<string, unknown>()
  private deps: ServiceDeps

  constructor(deps: ServiceDeps = getDefaultDeps()) {
    this.deps = deps
  }

  /**
   * 获取依赖
   */
  getDeps(): ServiceDeps {
    return this.deps
  }

  /**
   * 注册服务实例
   */
  register<T>(name: string, instance: T): void {
    this.services.set(name, instance)
  }

  /**
   * 获取服务实例
   */
  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  /**
   * 注册并获取服务（工厂模式）
   */
  registerFactory<T>(name: string, factory: (deps: ServiceDeps) => T): T {
    const existing = this.services.get(name) as T | undefined
    if (existing) {
      return existing
    }
    const instance = factory(this.deps)
    this.services.set(name, instance)
    return instance
  }
}

// ==================== 全局容器 ====================

/**
 * 全局服务容器实例
 */
let globalContainer: ServiceContainer | null = null

/**
 * 获取全局服务容器
 */
export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer()
  }
  return globalContainer
}

/**
 * 创建新的服务容器（用于测试）
 */
export function createServiceContainer(deps?: ServiceDeps): ServiceContainer {
  return new ServiceContainer(deps || getDefaultDeps())
}

/**
 * 重置全局容器（用于测试清理）
 */
export function resetServiceContainer(): void {
  globalContainer = null
}
