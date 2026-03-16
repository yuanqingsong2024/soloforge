import { PrismaClient, type OutboxEvent } from '@prisma/client'

const prisma = new PrismaClient()

export type OutboxStatus = 'PENDING' | 'SENDING' | 'SUCCEEDED' | 'FAILED'

const MAX_RETRY_ATTEMPTS = 8
const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 32, 64, 128]
const SERVICE_ACTOR = 'outbox-manager'

export type OutboxHandler = (input: {
  eventId: string
  kind: string
  payload: unknown
  traceId: string
}) => Promise<unknown>

function safeJsonStringify(data: unknown, fieldLabel: string): string {
  try {
    return JSON.stringify(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldLabel} 序列化失败: ${message}`)
  }
}

function safeJsonParse(raw: string, fieldLabel: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldLabel} 解析失败: ${message}`)
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function writeAuditLog(input: {
  traceId: string
  ticketId?: string
  actor?: string
  action: string
  tool?: string
  request: unknown
  response: unknown
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ticketId: input.ticketId,
      traceId: input.traceId,
      actor: input.actor || SERVICE_ACTOR,
      action: input.action,
      tool: input.tool,
      request: safeJsonStringify(input.request, 'AuditLog.request'),
      response: safeJsonStringify(input.response, 'AuditLog.response'),
      ts: new Date()
    }
  })
}

export class OutboxManager {
  private static handlers = new Map<string, OutboxHandler>()
  private static timer: NodeJS.Timeout | null = null

  /**
   * 注册某种 kind 的处理器（Outbox 事件的实际投递逻辑由外部注入）
   */
  static registerHandler(kind: string, handler: OutboxHandler): void {
    this.handlers.set(kind, handler)
  }

  /**
   * 入队
   */
  static async enqueue(kind: string, payload: unknown, traceId: string): Promise<OutboxEvent> {
    if (!traceId) throw new Error('traceId 不能为空')

    const event = await prisma.outboxEvent.create({
      data: {
        kind,
        payload: safeJsonStringify(payload, 'OutboxEvent.payload'),
        traceId,
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: null,
        lastError: null
      }
    })

    await writeAuditLog({
      traceId,
      action: 'OUTBOX_ENQUEUED',
      tool: 'outbox',
      request: { kind, eventId: event.id },
      response: { status: event.status }
    })

    return event
  }

  /**
   * 指数退避算法（1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s）
   * @param attempts 已尝试次数（从 1 开始）；超过最大次数返回 null
   */
  static calculateNextRetry(attempts: number): Date | null {
    if (attempts >= MAX_RETRY_ATTEMPTS) return null
    const idx = Math.max(0, Math.min(attempts - 1, BACKOFF_SECONDS.length - 1))
    const seconds = BACKOFF_SECONDS[idx]
    return new Date(Date.now() + seconds * 1000)
  }

  /**
   * 定时任务处理重试（会处理所有到期事件）
   */
  static async processRetries(): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
    const now = new Date()
    const dueEvents = await prisma.outboxEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
      },
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
      take: 50
    })

    let processed = 0
    let succeeded = 0
    let failed = 0
    let skipped = 0

    for (const event of dueEvents) {
      processed++
      const outcome = await this.processSingleEvent(event.id)
      if (outcome === 'SUCCEEDED') succeeded++
      else if (outcome === 'FAILED') failed++
      else skipped++
    }

    return { processed, succeeded, failed, skipped }
  }

  /**
   * 手动重试
   */
  static async manualRetry(eventId: string): Promise<{ status: OutboxStatus; traceId: string }>
  {
    const existing = await prisma.outboxEvent.findUnique({ where: { id: eventId } })
    if (!existing) throw new Error('OutboxEvent 不存在')
    if (existing.status === 'SUCCEEDED') {
      throw new Error('该事件已成功，无需重试')
    }

    const updated = await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'PENDING',
        nextRetryAt: new Date(),
        lastError: null
      }
    })

    await writeAuditLog({
      traceId: updated.traceId,
      action: 'OUTBOX_MANUAL_RETRY',
      tool: 'outbox',
      request: { eventId },
      response: { status: updated.status }
    })

    const outcome = await this.processSingleEvent(eventId)
    const reloaded = await prisma.outboxEvent.findUnique({ where: { id: eventId } })
    if (!reloaded) throw new Error('OutboxEvent 重试后读取失败')
    return { status: (outcome === 'SKIPPED' ? reloaded.status : outcome) as OutboxStatus, traceId: reloaded.traceId }
  }

  /**
   * 启动定时任务（默认每 2 秒扫描一次）
   */
  static startScheduler(intervalMs = 2000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.processRetries().catch((error) => {
        // 定时任务错误不应导致进程崩溃：记录到审计便于定位
        const traceId = 'scheduler'
        writeAuditLog({
          traceId,
          action: 'OUTBOX_SCHEDULER_ERROR',
          tool: 'outbox',
          request: { intervalMs },
          response: { error: toErrorMessage(error) }
        }).catch(() => {
          // 审计写入失败也不应抛出到定时器
        })
      })
    }, intervalMs)
  }

  /**
   * 停止定时任务
   */
  static stopScheduler(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private static async processSingleEvent(eventId: string): Promise<OutboxStatus | 'SKIPPED'> {
    const now = new Date()

    // 先尝试“抢占”事件：只有 PENDING/FAILED 且到期的才可置为 SENDING
    const lock = await prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
      },
      data: { status: 'SENDING' }
    })
    if (lock.count === 0) {
      return 'SKIPPED'
    }

    const event = await prisma.outboxEvent.findUnique({ where: { id: eventId } })
    if (!event) {
      return 'SKIPPED'
    }

    const handler = this.handlers.get(event.kind)
    if (!handler) {
      const message = `未注册 Outbox 处理器: kind=${event.kind}`
      await this.markFailed(event, message)
      return 'FAILED'
    }

    const payload = safeJsonParse(event.payload, 'OutboxEvent.payload')

    try {
      const result = await handler({ eventId: event.id, kind: event.kind, payload, traceId: event.traceId })
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'SUCCEEDED',
          nextRetryAt: null,
          lastError: null
        }
      })

      await writeAuditLog({
        traceId: event.traceId,
        action: 'OUTBOX_SUCCEEDED',
        tool: 'outbox',
        request: { eventId: event.id, kind: event.kind, attempts: event.attempts },
        response: { result }
      })

      return 'SUCCEEDED'
    } catch (error) {
      await this.markFailed(event, toErrorMessage(error))
      return 'FAILED'
    }
  }

  private static async markFailed(event: OutboxEvent, errorMessage: string): Promise<void> {
    const nextAttempts = event.attempts + 1
    const nextRetryAt = nextAttempts >= MAX_RETRY_ATTEMPTS ? null : this.calculateNextRetry(nextAttempts)

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        attempts: nextAttempts,
        nextRetryAt,
        lastError: errorMessage
      }
    })

    await writeAuditLog({
      traceId: event.traceId,
      action: 'OUTBOX_FAILED',
      tool: 'outbox',
      request: {
        eventId: event.id,
        kind: event.kind,
        attempts: nextAttempts
      },
      response: {
        error: errorMessage,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
        exhausted: nextRetryAt === null
      }
    })
  }
}

export { prisma }
