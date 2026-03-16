import { create, type Delta } from 'jsondiffpatch'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()
const differ = create()

/**
 * 配置写入限频器
 * 60 秒内最多 3 次写入
 */
class RateLimiter {
  private timestamps: number[] = []
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests = 3, windowMs = 60_000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  canProceed(): boolean {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    return this.timestamps.length < this.maxRequests
  }

  record(): void {
    this.timestamps.push(Date.now())
  }

  remainingQuota(): { remaining: number; resetIn: number } {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    const remaining = Math.max(0, this.maxRequests - this.timestamps.length)
    const oldestInWindow = this.timestamps[0]
    const resetIn = oldestInWindow ? Math.max(0, this.windowMs - (now - oldestInWindow)) : 0
    return { remaining, resetIn }
  }
}

/** 全局限频器实例（每个 profileId 一个） */
const rateLimiters = new Map<string, RateLimiter>()

function getRateLimiter(profileId: string): RateLimiter {
  let limiter = rateLimiters.get(profileId)
  if (!limiter) {
    limiter = new RateLimiter()
    rateLimiters.set(profileId, limiter)
  }
  return limiter
}

/**
 * trustedProxies 输入校验
 * 只允许精确 IP 或小网段（/24 以上），禁止 0.0.0.0/0 这类危险值
 */
function validateTrustedProxies(proxies: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const dangerousPatterns = [
    '0.0.0.0/0',
    '::/0',
    '0.0.0.0',
    '*',
  ]

  for (const proxy of proxies) {
    const trimmed = proxy.trim()

    // 检查危险值
    if (dangerousPatterns.includes(trimmed)) {
      errors.push(`禁止使用危险代理地址: ${trimmed}`)
      continue
    }

    // 检查 CIDR 网段
    const cidrMatch = trimmed.match(/^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/)
    if (cidrMatch) {
      const prefix = parseInt(cidrMatch[2], 10)
      if (prefix < 24) {
        errors.push(`网段过大 (/${prefix})，最小允许 /24: ${trimmed}`)
      }
      continue
    }

    // 检查精确 IPv4
    const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
      const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number)
      if (octets.some(o => o > 255)) {
        errors.push(`无效 IP 地址: ${trimmed}`)
      }
      continue
    }

    // 检查 IPv6（简单验证）
    if (trimmed.includes(':') && !trimmed.includes('/')) {
      continue // 精确 IPv6 地址，允许
    }

    errors.push(`无法识别的代理地址格式: ${trimmed}`)
  }

  return { valid: errors.length === 0, errors }
}

export class ConfigManager {
  /**
   * 计算配置 SHA-256 哈希
   */
  static hash(config: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(config))
      .digest('hex')
  }

  /**
   * 保存配置快照
   */
  static async saveSnapshot(profileId: string, config: unknown): Promise<string> {
    const hash = this.hash(config)
    const snapshot = await prisma.configSnapshot.create({
      data: {
        profileId,
        config: JSON.stringify(config),
        hash
      }
    })
    return snapshot.id
  }

  /**
   * 获取最新快照
   */
  static async getLatestSnapshot(profileId: string): Promise<unknown | null> {
    const snapshot = await prisma.configSnapshot.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' }
    })
    return snapshot ? JSON.parse(snapshot.config) : null
  }

  /**
   * 获取所有历史快照（分页）
   */
  static async listSnapshots(profileId: string, take = 20) {
    return await prisma.configSnapshot.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        hash: true,
        createdAt: true
      }
    })
  }

  /**
   * 获取指定快照的完整配置
   */
  static async getSnapshot(snapshotId: string): Promise<unknown | null> {
    const snapshot = await prisma.configSnapshot.findUnique({
      where: { id: snapshotId }
    })
    if (!snapshot) return null
    return JSON.parse(snapshot.config)
  }

  /**
   * 生成两个配置之间的 Diff
   */
  static diff(oldConfig: unknown, newConfig: unknown): unknown {
    return differ.diff(oldConfig, newConfig)
  }

  /**
   * 应用 Diff Patch
   */
  static patch(config: unknown, delta: Delta): unknown {
    return differ.patch(config, delta)
  }

  /**
   * 回滚到指定快照
   */
  static async rollback(snapshotId: string): Promise<unknown> {
    const snapshot = await prisma.configSnapshot.findUnique({
      where: { id: snapshotId }
    })
    if (!snapshot) throw new Error('Snapshot not found')
    return JSON.parse(snapshot.config)
  }

  /**
   * 检查写入限频
   */
  static checkRateLimit(profileId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const limiter = getRateLimiter(profileId)
    const { remaining, resetIn } = limiter.remainingQuota()
    return { allowed: limiter.canProceed(), remaining, resetIn }
  }

  /**
   * 记录一次写入
   */
  static recordWrite(profileId: string): void {
    getRateLimiter(profileId).record()
  }

  /**
   * 校验 trustedProxies
   */
  static validateTrustedProxies(proxies: string[]): { valid: boolean; errors: string[] } {
    return validateTrustedProxies(proxies)
  }
  /**
   * 保存期望状态快照（Desired Snapshot）
   */
  static async saveDesiredSnapshot(
    workspaceId: string,
    config: unknown,
    createdBy: string
  ): Promise<string> {
    const hash = this.hash(config)
    const snapshot = await prisma.workspaceSnapshot.create({
      data: {
        workspaceId,
        kind: 'DESIRED',
        source: 'LOCAL_SAVE',
        contentJson: JSON.stringify(config),
        contentHash: hash,
        createdBy
      }
    })
    return snapshot.id
  }
  /**
   * 同步实际状态快照（Actual Snapshot）
   * 从 OpenClaw 拉取配置并保存
   */
  static async syncActualSnapshot(
    workspaceId: string,
    config: unknown,
    createdBy: string
  ): Promise<string> {
    const hash = this.hash(config)
    const snapshot = await prisma.workspaceSnapshot.create({
      data: {
        workspaceId,
        kind: 'ACTUAL',
        source: 'REMOTE_SYNC',
        contentJson: JSON.stringify(config),
        contentHash: hash,
        createdBy
      }
    })
    return snapshot.id
  }
  /**
   * 计算漂移（Drift Detection）
   * 比较最新的 DESIRED 和 ACTUAL 快照
   */
  static async computeDrift(workspaceId: string): Promise<{
    hasDrift: boolean
    diffId?: string
    severity?: string
    summary?: string
  }> {
    // 获取最新的 DESIRED 快照
    const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
      where: { workspaceId, kind: 'DESIRED' },
      orderBy: { createdAt: 'desc' }
    })
    // 获取最新的 ACTUAL 快照
    const actualSnapshot = await prisma.workspaceSnapshot.findFirst({
      where: { workspaceId, kind: 'ACTUAL' },
      orderBy: { createdAt: 'desc' }
    })
    if (!desiredSnapshot || !actualSnapshot) {
      return { hasDrift: false }
    }
    // 比较哈希
    if (desiredSnapshot.contentHash === actualSnapshot.contentHash) {
      return { hasDrift: false }
    }
    // 计算 diff
    const desired = JSON.parse(desiredSnapshot.contentJson)
    const actual = JSON.parse(actualSnapshot.contentJson)
    const delta = this.diff(desired, actual)
    // 分析严重程度
    const severity = this.analyzeDriftSeverity(delta)
    const summary = this.generateDriftSummary(delta)
    // 保存 diff
    const diff = await prisma.snapshotDiff.create({
      data: {
        workspaceId,
        desiredSnapshotId: desiredSnapshot.id,
        actualSnapshotId: actualSnapshot.id,
        diffJson: JSON.stringify(delta),
        summary,
        severity
      }
    })
    return {
      hasDrift: true,
      diffId: diff.id,
      severity,
      summary
    }
  }
  /**
   * 分析漂移严重程度
   */
  private static analyzeDriftSeverity(delta: any): string {
    if (!delta) return 'LOW'
    const deltaStr = JSON.stringify(delta)
    // 高危字段：gateway.auth, trustedProxies, hooks.token, tools.allow/deny
    const highRiskPatterns = [
      'gateway.auth',
      'trustedProxies',
      'hooks.token',
      'tools.allow',
      'tools.deny'
    ]
    for (const pattern of highRiskPatterns) {
      if (deltaStr.includes(pattern)) {
        return 'HIGH'
      }
    }
    // 中危：其他配置变更
    if (Object.keys(delta).length > 5) {
      return 'MED'
    }
    return 'LOW'
  }
  /**
   * 生成漂移摘要
   */
  private static generateDriftSummary(delta: any): string {
    if (!delta) return '无漂移'
    const changes = Object.keys(delta).length
    return `检测到 ${changes} 处配置差异`
  }
  /**
   * 获取最新漂移
   */
  static async getLatestDrift(workspaceId: string) {
    return await prisma.snapshotDiff.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        desiredSnapshot: true,
        actualSnapshot: true
      }
    })
  }
  /**
   * 从漂移创建变更单
   */
  static async createChangeRequestFromDrift(
    workspaceId: string,
    diffId: string,
    title: string,
    description: string,
    createdBy: string,
    traceId: string
  ): Promise<string> {
    const diff = await prisma.snapshotDiff.findUnique({
      where: { id: diffId }
    })
    if (!diff) throw new Error('Drift not found')
    const changeRequest = await prisma.changeRequest.create({
      data: {
        workspaceId,
        type: 'CONFIG',
        title,
        description,
        diffJson: diff.diffJson,
        status: 'DRAFT',
        traceId,
        createdBy
      }
    })
    return changeRequest.id
  }
}

export { prisma }
