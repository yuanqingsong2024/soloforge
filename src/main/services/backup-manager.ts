import { prisma } from './db'
import { app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { writeAuditLog } from './audit-log-writer'

/**
 * 备份包
 */
export interface BackupPack {
  version: string
  workspaceId: string
  workspaceName: string
  exportedAt: string
  exportedBy: string
  config: {
    desired?: unknown // 脱敏后的期望配置
    actual?: unknown // 脱敏后的实际配置
  }
  changeRequests?: unknown[] // 变更单历史
  metadata: {
    hash: string
    itemCount: number
  }
}

export interface BackupHistoryItem {
  id: string
  workspaceId: string
  workspaceName: string
  exportedAt: string
  exportedBy: string
  hash: string
  itemCount: number
  traceId: string | null
  fileName?: string
  filePath?: string
  sizeBytes?: number
}

interface BackupFileEnvelope {
  id: string
  traceId: string
  fileName: string
  createdAt: string
  pack: BackupPack
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean
  workspaceId?: string
  errors: string[]
  warnings: string[]
  credentialsNeeded: string[] // 需要用户重新填写的凭证列表
}

/**
 * BackupManager 服务
 * 负责配置备份/还原，脱敏处理
 */
export class BackupManager {
  private static getBackupRoot(): string {
    return path.join(app.getPath('userData'), 'backups')
  }

  private static getWorkspaceBackupDir(workspaceId: string): string {
    return path.join(this.getBackupRoot(), workspaceId)
  }

  private static ensureWorkspaceBackupDir(workspaceId: string): string {
    const dir = this.getWorkspaceBackupDir(workspaceId)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private static buildBackupFileName(exportedAt: string, hash: string): string {
    const safeTimestamp = exportedAt.replace(/[:.]/g, '-')
    return `backup-${safeTimestamp}-${hash.slice(0, 12)}.json`
  }

  private static persistBackupPack(pack: BackupPack, traceId: string): BackupHistoryItem {
    const dir = this.ensureWorkspaceBackupDir(pack.workspaceId)
    const fileName = this.buildBackupFileName(pack.exportedAt, pack.metadata.hash)
    const filePath = path.join(dir, fileName)
    const envelope: BackupFileEnvelope = {
      id: pack.metadata.hash,
      traceId,
      fileName,
      createdAt: new Date().toISOString(),
      pack
    }
    fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf-8')
    const stat = fs.statSync(filePath)

    return {
      id: pack.metadata.hash,
      workspaceId: pack.workspaceId,
      workspaceName: pack.workspaceName,
      exportedAt: pack.exportedAt,
      exportedBy: pack.exportedBy,
      hash: pack.metadata.hash,
      itemCount: pack.metadata.itemCount,
      traceId,
      fileName,
      filePath,
      sizeBytes: stat.size
    }
  }

  private static readBackupEnvelope(filePath: string): BackupFileEnvelope | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<BackupFileEnvelope>
      if (!parsed || typeof parsed !== 'object' || !parsed.pack) return null
      return parsed as BackupFileEnvelope
    } catch {
      return null
    }
  }

  private static validateBackupPackHash(pack: BackupPack): boolean {
    const expectedHash = this.hashBackupPack({
      ...pack,
      metadata: { ...pack.metadata, hash: '' }
    })
    return pack.metadata.hash === expectedHash
  }

  /**
   * 导出备份包
   */
  static async exportBackup(
    workspaceId: string,
    exportedBy: string,
    options?: {
      includeChangeRequests?: boolean
      includeSnapshots?: boolean
    }
  ): Promise<BackupPack> {
    const { includeChangeRequests = true, includeSnapshots = true } = options || {}

    // 获取 workspace 信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    })

    if (!workspace) {
      throw new Error('Workspace not found')
    }

    // 获取最新的 DESIRED 和 ACTUAL 快照
    const desiredSnapshot = includeSnapshots
      ? await prisma.workspaceSnapshot.findFirst({
          where: { workspaceId, kind: 'DESIRED' },
          orderBy: { createdAt: 'desc' }
        })
      : null

    const actualSnapshot = includeSnapshots
      ? await prisma.workspaceSnapshot.findFirst({
          where: { workspaceId, kind: 'ACTUAL' },
          orderBy: { createdAt: 'desc' }
        })
      : null

    // 获取变更单历史
    const changeRequests = includeChangeRequests
      ? await prisma.changeRequest.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
          take: 50 // 最近 50 条
        })
      : []

    // 脱敏配置
    const desiredConfig = desiredSnapshot
      ? this.sanitizeConfig(JSON.parse(desiredSnapshot.contentJson))
      : null

    const actualConfig = actualSnapshot
      ? this.sanitizeConfig(JSON.parse(actualSnapshot.contentJson))
      : null

    // 脱敏变更单
    const sanitizedChangeRequests = changeRequests.map(cr => ({
      id: cr.id,
      type: cr.type,
      title: cr.title,
      description: cr.description,
      status: cr.status,
      createdAt: cr.createdAt,
      createdBy: cr.createdBy
      // 不包含 diffJson（可能含敏感信息）
    }))

    // 构建备份包
    const backupPack: BackupPack = {
      version: '1.0',
      workspaceId,
      workspaceName: workspace.name,
      exportedAt: new Date().toISOString(),
      exportedBy,
      config: {
        desired: desiredConfig,
        actual: actualConfig
      },
      changeRequests: sanitizedChangeRequests,
      metadata: {
        hash: '',
        itemCount: sanitizedChangeRequests.length
      }
    }

    // 计算哈希
    backupPack.metadata.hash = this.hashBackupPack(backupPack)
    const traceId = crypto.randomUUID()
    const fileItem = this.persistBackupPack(backupPack, traceId)

    await writeAuditLog({
      workspaceId,
      traceId,
      actor: exportedBy,
      action: 'BACKUP_EXPORT_HISTORY',
      tool: 'backup',
      request: {
        workspaceId,
        includeChangeRequests,
        includeSnapshots
      },
      response: {
        workspaceName: workspace.name,
        exportedAt: backupPack.exportedAt,
        hash: backupPack.metadata.hash,
        itemCount: backupPack.metadata.itemCount,
        fileName: fileItem.fileName,
        sizeBytes: fileItem.sizeBytes
      }
    })

    return backupPack
  }

  /**
   * 导入备份包
   */
  static async importBackup(
    backupPack: BackupPack,
    importedBy: string,
    options?: {
      createNewWorkspace?: boolean
      targetWorkspaceId?: string
    }
  ): Promise<ImportResult> {
    const { createNewWorkspace = true, targetWorkspaceId } = options || {}
    const errors: string[] = []
    const warnings: string[] = []
    const credentialsNeeded: string[] = []

    try {
      // 校验备份包版本
      if (backupPack.version !== '1.0') {
        errors.push(`不支持的备份包版本: ${backupPack.version}`)
        return { success: false, errors, warnings, credentialsNeeded }
      }

      // 校验哈希
      if (!this.validateBackupPackHash(backupPack)) {
        errors.push('备份包哈希校验失败，文件可能已损坏')
        return { success: false, errors, warnings, credentialsNeeded }
      }

      // 确定目标 workspace
      let workspaceId: string

      if (createNewWorkspace) {
        // 创建新 workspace
        const newWorkspace = await prisma.workspace.create({
          data: {
            name: `${backupPack.workspaceName} (导入)`,
            description: `从备份导入于 ${new Date().toLocaleString('zh-CN')}`,
            envType: 'DEV' // 默认 DEV
          }
        })
        workspaceId = newWorkspace.id
      } else if (targetWorkspaceId) {
        // 导入到现有 workspace
        const existingWorkspace = await prisma.workspace.findUnique({
          where: { id: targetWorkspaceId }
        })
        if (!existingWorkspace) {
          errors.push('目标 workspace 不存在')
          return { success: false, errors, warnings, credentialsNeeded }
        }
        workspaceId = targetWorkspaceId
      } else {
        errors.push('必须指定 createNewWorkspace 或 targetWorkspaceId')
        return { success: false, errors, warnings, credentialsNeeded }
      }

      // 恢复配置快照
      if (backupPack.config.desired) {
        await prisma.workspaceSnapshot.create({
          data: {
            workspaceId,
            kind: 'DESIRED',
            source: 'BACKUP_IMPORT',
            contentJson: JSON.stringify(backupPack.config.desired),
            contentHash: crypto
              .createHash('sha256')
              .update(JSON.stringify(backupPack.config.desired))
              .digest('hex'),
            createdBy: importedBy
          }
        })
      }

      if (backupPack.config.actual) {
        await prisma.workspaceSnapshot.create({
          data: {
            workspaceId,
            kind: 'ACTUAL',
            source: 'BACKUP_IMPORT',
            contentJson: JSON.stringify(backupPack.config.actual),
            contentHash: crypto
              .createHash('sha256')
              .update(JSON.stringify(backupPack.config.actual))
              .digest('hex'),
            createdBy: importedBy
          }
        })
      }

      // 检测需要重新填写的凭证
      credentialsNeeded.push(
        'OpenClaw token',
        'X-Edge-Token',
        'Hooks token'
      )

      warnings.push('备份包不包含敏感凭证，请在导入后重新填写')

      return {
        success: true,
        workspaceId,
        errors,
        warnings,
        credentialsNeeded
      }
    } catch (error: unknown) {
      errors.push(`导入失败: ${error instanceof Error ? error.message : String(error)}`)
      return { success: false, errors, warnings, credentialsNeeded }
    }
  }

  /**
   * 脱敏配置
   * 移除所有敏感字段（token, password, apiKey 等）
   */
  private static sanitizeConfig(config: unknown): unknown {
    if (!config || typeof config !== 'object') {
      return config
    }

    if (Array.isArray(config)) {
      return config.map(item => this.sanitizeConfig(item))
    }

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()

      // 敏感字段列表
      const sensitiveKeys = [
        'token',
        'password',
        'apikey',
        'api_key',
        'secret',
        'credential',
        'auth',
        'key'
      ]

      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        // 替换为占位符
        if (typeof value === 'string' && value.length > 0) {
          sanitized[key] = '***REDACTED***'
        } else {
          sanitized[key] = null
        }
      } else if (typeof value === 'object' && value !== null) {
        // 递归脱敏
        sanitized[key] = this.sanitizeConfig(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * 计算备份包哈希
   */
  private static hashBackupPack(pack: BackupPack): string {
    const { metadata, ...rest } = pack
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(rest))
      .digest('hex')
  }

  /**
   * 列出备份历史（优先读取真实备份文件，审计日志仅作为兼容兜底）
   */
  static async listBackups(workspaceId: string): Promise<BackupHistoryItem[]> {
    const fileItems = this.listBackupFiles(workspaceId)
    if (fileItems.length > 0) {
      return fileItems
    }

    const [workspace, rows] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId } }),
      prisma.auditLog.findMany({
        where: {
          workspaceId,
          action: 'BACKUP_EXPORT_HISTORY',
          tool: 'backup'
        },
        orderBy: { ts: 'desc' },
        take: 50
      })
    ])

    return rows.map(row => {
      const response = this.safeJsonParse<Record<string, unknown>>(row.response, {})
      const request = this.safeJsonParse<Record<string, unknown>>(row.request, {})

      return {
        id: row.id,
        workspaceId,
        workspaceName: typeof response.workspaceName === 'string'
          ? response.workspaceName
          : workspace?.name || workspaceId,
        exportedAt: row.ts.toISOString(),
        exportedBy: typeof row.actor === 'string' && row.actor.length > 0
          ? row.actor
          : typeof request.exportedBy === 'string'
            ? request.exportedBy
            : 'unknown',
        hash: typeof response.hash === 'string' ? response.hash : '',
        itemCount: typeof response.itemCount === 'number' ? response.itemCount : 0,
        traceId: row.traceId || null,
        fileName: typeof response.fileName === 'string' ? response.fileName : undefined,
        sizeBytes: typeof response.sizeBytes === 'number' ? response.sizeBytes : undefined
      }
    })
  }

  private static listBackupFiles(workspaceId: string): BackupHistoryItem[] {
    const dir = this.getWorkspaceBackupDir(workspaceId)
    if (!fs.existsSync(dir)) return []

    const items: BackupHistoryItem[] = []
    for (const fileName of fs.readdirSync(dir)) {
      if (!fileName.endsWith('.json')) continue
      const filePath = path.join(dir, fileName)
      const envelope = this.readBackupEnvelope(filePath)
      if (!envelope || envelope.pack.workspaceId !== workspaceId) continue
      const stat = fs.statSync(filePath)
      items.push({
        id: envelope.id || envelope.pack.metadata.hash,
        workspaceId: envelope.pack.workspaceId,
        workspaceName: envelope.pack.workspaceName,
        exportedAt: envelope.pack.exportedAt,
        exportedBy: envelope.pack.exportedBy,
        hash: envelope.pack.metadata.hash,
        itemCount: envelope.pack.metadata.itemCount,
        traceId: envelope.traceId || null,
        fileName,
        filePath,
        sizeBytes: stat.size
      })
    }

    return items.sort((left, right) => Date.parse(right.exportedAt) - Date.parse(left.exportedAt))
  }

  private static safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }
}

export { prisma } from './db'
