/**
 * 统一重试机制
 * 提供可配置的重试策略、退避算法、失败处理
 */

import { OperationResult, ErrorType } from './error-types'
import { logger } from './logger'

export interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors?: ErrorType[]
  onRetry?: (attempt: number, error: unknown) => void
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
}

/**
 * 计算退避延迟（指数退避 + 抖动）
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs)
  
  // 添加 ±25% 的随机抖动，避免雷鸣群效应
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1)
  
  return Math.floor(cappedDelay + jitter)
}

/**
 * 延迟执行
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 判断是否应该重试
 */
function shouldRetry<T>(
  result: OperationResult<T>,
  attempt: number,
  config: RetryConfig
): boolean {
  // 已达到最大重试次数
  if (attempt >= config.maxAttempts) {
    return false
  }

  // 操作成功，不需要重试
  if (result.success) {
    return false
  }

  // 检查错误是否可重试
  if (!result.error) {
    return false
  }

  // 如果配置了特定的可重试错误类型
  if (config.retryableErrors && config.retryableErrors.length > 0) {
    return config.retryableErrors.includes(result.error.type)
  }

  // 否则使用错误对象的 retryable 标志
  return result.error.retryable ?? false
}

/**
 * 带重试的操作执行
 */
export async function withRetry<T>(
  operation: () => Promise<OperationResult<T>>,
  config: Partial<RetryConfig> = {},
  context?: string,
  traceId?: string
): Promise<OperationResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let attempt = 0
  let lastResult: OperationResult<T>

  while (true) {
    attempt++

    try {
      logger.debug(
        `执行操作 (尝试 ${attempt}/${finalConfig.maxAttempts})`,
        context || 'RetryService',
        undefined,
        traceId
      )

      lastResult = await operation()

      if (lastResult.success) {
        if (attempt > 1) {
          logger.info(
            `操作成功 (经过 ${attempt} 次尝试)`,
            context || 'RetryService',
            undefined,
            traceId
          )
        }
        return lastResult
      }

      // 检查是否应该重试
      if (!shouldRetry(lastResult, attempt, finalConfig)) {
        logger.warn(
          `操作失败，不再重试 (尝试 ${attempt}/${finalConfig.maxAttempts})`,
          context || 'RetryService',
          { error: lastResult.error },
          traceId
        )
        return lastResult
      }

      // 计算退避延迟
      const delayMs = calculateBackoff(attempt, finalConfig)

      logger.warn(
        `操作失败，将在 ${delayMs}ms 后重试 (尝试 ${attempt}/${finalConfig.maxAttempts})`,
        context || 'RetryService',
        { error: lastResult.error },
        traceId
      )

      // 调用重试回调
      if (finalConfig.onRetry) {
        finalConfig.onRetry(attempt, lastResult.error)
      }

      // 等待后重试
      await delay(delayMs)
    } catch (error) {
      logger.error(
        `操作执行异常 (尝试 ${attempt}/${finalConfig.maxAttempts})`,
        context || 'RetryService',
        error as Error,
        undefined,
        traceId
      )

      // 如果是未捕获的异常，包装为失败结果
      lastResult = {
        success: false,
        error: {
          type: ErrorType.UNKNOWN,
          message: error instanceof Error ? error.message : String(error),
          retryable: true
        }
      }

      if (!shouldRetry(lastResult, attempt, finalConfig)) {
        return lastResult
      }

      const delayMs = calculateBackoff(attempt, finalConfig)
      await delay(delayMs)
    }
  }
}

/**
 * 预定义的重试配置
 */
export const RetryPresets = {
  /**
   * 快速重试（适用于轻量级操作）
   */
  FAST: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2
  } as RetryConfig,

  /**
   * 标准重试（适用于一般操作）
   */
  STANDARD: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2
  } as RetryConfig,

  /**
   * 持久重试（适用于关键操作）
   */
  PERSISTENT: {
    maxAttempts: 8,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2
  } as RetryConfig,

  /**
   * 网络重试（适用于网络请求）
   */
  NETWORK: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.CONNECTION_REFUSED,
      ErrorType.RESOURCE_UNAVAILABLE
    ]
  } as RetryConfig
}

/**
 * 批量操作重试（带并发控制）
 */
export async function withBatchRetry<T, R>(
  items: T[],
  operation: (item: T) => Promise<OperationResult<R>>,
  config: Partial<RetryConfig> = {},
  concurrency = 5,
  context?: string,
  traceId?: string
): Promise<Array<{ item: T; result: OperationResult<R> }>> {
  const results: Array<{ item: T; result: OperationResult<R> }> = []
  const queue = [...items]

  logger.info(
    `开始批量操作 (总数: ${items.length}, 并发: ${concurrency})`,
    context || 'RetryService',
    undefined,
    traceId
  )

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break

      const result = await withRetry(() => operation(item), config, context, traceId)
      results.push({ item, result })
    }
  })

  await Promise.all(workers)

  const successCount = results.filter((r) => r.result.success).length
  const failureCount = results.length - successCount

  logger.info(
    `批量操作完成 (成功: ${successCount}, 失败: ${failureCount})`,
    context || 'RetryService',
    undefined,
    traceId
  )

  return results
}

/**
 * 带超时的重试
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<OperationResult<T>>,
  timeoutMs: number,
  config: Partial<RetryConfig> = {},
  context?: string,
  traceId?: string
): Promise<OperationResult<T>> {
  const timeoutPromise = new Promise<OperationResult<T>>((resolve) => {
    setTimeout(() => {
      logger.warn(
        `操作超时 (${timeoutMs}ms)`,
        context || 'RetryService',
        undefined,
        traceId
      )
      resolve({
        success: false,
        error: {
          type: ErrorType.TIMEOUT,
          message: `操作超时 (${timeoutMs}ms)`,
          retryable: true
        }
      })
    }, timeoutMs)
  })

  const operationPromise = withRetry(operation, config, context, traceId)

  return Promise.race([operationPromise, timeoutPromise])
}
