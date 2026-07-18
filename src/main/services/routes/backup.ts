/**
 * Backup 路由模块 - 备份导入导出
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { BackupManager, type BackupPack } from '../backup-manager'
import {
  ok,
  fail,
  toErrorMessage,
  emitApiEvent
} from '../api-shared'

// ==================== 类型定义 ====================

interface BackupExportBody {
  workspaceId: string
  exportedBy: string
  includeChangeRequests?: boolean
  includeSnapshots?: boolean
}

interface BackupImportBody {
  backupPack: BackupPack
  importedBy: string
  createNewWorkspace?: boolean
  targetWorkspaceId?: string
}

// ==================== 辅助函数 ====================

function resolveSqliteDbPath(): string {
  const url = process.env.DATABASE_URL
  if (url && url.startsWith('file:')) {
    const filePart = url.slice('file:'.length)
    // sqlite file: URL 可能是相对路径（如 ./dev.db）
    if (filePart.startsWith('/') || /^[a-zA-Z]:\\/.test(filePart)) {
      return filePart
    }
    return path.resolve(process.cwd(), filePart)
  }

  // 默认 schema.prisma 使用 file:./dev.db，通常落在项目 prisma/dev.db
  const candidates = [
    path.resolve(process.cwd(), 'prisma', 'dev.db'),
    path.resolve(app.getAppPath(), 'prisma', 'dev.db')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

// ==================== 路由注册 ====================

export function registerBackupRoutes(fastify: FastifyInstance): void {
  // 导出备份包
  fastify.post('/api/backup/export', async (request, reply) => {
    const traceId = uuidv4()
    const body = request.body as BackupExportBody
    try {
      // 兼容保留：确保本地 SQLite 路径解析逻辑仍被覆盖（避免死代码与后续回归）
      resolveSqliteDbPath()

      const workspaceId = (body.workspaceId || '').trim()
      const exportedBy = (body.exportedBy || '').trim()
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!exportedBy) {
        reply.code(400)
        return fail('exportedBy 不能为空')
      }

      const pack = await BackupManager.exportBackup(workspaceId, exportedBy, {
        includeChangeRequests: body.includeChangeRequests,
        includeSnapshots: body.includeSnapshots
      })

      await emitApiEvent({
        workspaceId,
        sourceType: 'BACKUP',
        sourceId: pack.metadata.hash,
        eventType: 'BACKUP_CREATED',
        severity: 'INFO',
        title: '备份包已创建',
        summary: `Workspace ${workspaceId} 备份导出完成`,
        payload: {
          workspaceId,
          exportedBy,
          exportedAt: pack.exportedAt,
          hash: pack.metadata.hash,
          itemCount: pack.metadata.itemCount
        },
        traceId
      })

      return ok(pack)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '导出备份包失败')
      reply.code(500)
      return fail(`导出备份失败：${errMsg}`)
    }
  })

  // 导入备份包
  fastify.post('/api/backup/import', async (request, reply) => {
    const traceId = uuidv4()
    const body = request.body as BackupImportBody

    try {
      if (!body.backupPack) {
        reply.code(400)
        return fail('backupPack 不能为空')
      }
      const importedBy = (body.importedBy || '').trim()
      if (!importedBy) {
        reply.code(400)
        return fail('importedBy 不能为空')
      }

      const result = await BackupManager.importBackup(body.backupPack, importedBy, {
        createNewWorkspace: body.createNewWorkspace,
        targetWorkspaceId: body.targetWorkspaceId
      })

      const restoreWorkspaceId = result.workspaceId || body.targetWorkspaceId || body.backupPack.workspaceId
      await emitApiEvent({
        workspaceId: restoreWorkspaceId,
        sourceType: 'BACKUP',
        sourceId: body.backupPack.metadata.hash,
        eventType: 'RESTORE_COMPLETED',
        severity: result.success ? 'INFO' : 'ERROR',
        title: result.success ? '备份恢复完成' : '备份恢复失败',
        summary: result.success ? '备份包已成功导入' : '备份包导入失败',
        payload: {
          targetWorkspaceId: restoreWorkspaceId,
          importedBy,
          warnings: result.warnings,
          errors: result.errors,
          credentialsNeeded: result.credentialsNeeded
        },
        traceId
      })

      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '导入备份包失败')
      reply.code(500)
      return fail(`导入备份失败：${errMsg}`)
    }
  })

  // 获取备份历史
  fastify.get('/api/backup/history', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    const targetWorkspaceId = (workspaceId || '').trim()

    try {
      if (!targetWorkspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      return ok(await BackupManager.listBackups(targetWorkspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取备份历史失败：${toErrorMessage(error)}`)
    }
  })
}
