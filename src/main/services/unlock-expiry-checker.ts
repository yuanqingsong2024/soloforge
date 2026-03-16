import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 自动解锁到期检查
 * 每分钟检查一次所有 workspace 的 unlock_until
 * 如果已到期，自动恢复只读模式
 */
export async function startUnlockExpiryChecker() {
  // 立即执行一次
  await checkAndExpireUnlocks()
  
  // 每分钟检查一次
  setInterval(async () => {
    await checkAndExpireUnlocks()
  }, 60000) // 60秒
  
  console.log('[UnlockExpiryChecker] 自动解锁到期检查已启动')
}

async function checkAndExpireUnlocks() {
  try {
    const now = new Date()
    
    // 查找所有已解锁但已到期的 workspace
    const expiredWorkspaces = await prisma.workspace.findMany({
      where: {
        unlockUntil: {
          lte: now // 小于等于当前时间
        },
        isReadOnlyDefault: true // 只处理默认只读的 workspace
      },
    })
    
    if (expiredWorkspaces.length === 0) {
      return
    }
    
    console.log(`[UnlockExpiryChecker] 发现 ${expiredWorkspaces.length} 个已到期的解锁`)
    
    // 批量恢复只读
    for (const workspace of expiredWorkspaces) {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { unlockUntil: null },
      })
      
      // 写入审计日志
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          traceId: `auto-expire-${Date.now()}`,
          actor: 'system',
          action: 'WORKSPACE_UNLOCK_EXPIRED',
          tool: 'unlock-expiry-checker',
          request: JSON.stringify({ workspaceId: workspace.id, unlockUntil: workspace.unlockUntil }),
          response: JSON.stringify({ status: 'expired', restoredReadOnly: true }),
          ts: new Date(),
        },
      })
      
      console.log(`[UnlockExpiryChecker] Workspace ${workspace.name} (${workspace.id}) 解锁已到期，已恢复只读`)
    }
  } catch (error) {
    console.error('[UnlockExpiryChecker] 检查失败:', error)
  }
}
