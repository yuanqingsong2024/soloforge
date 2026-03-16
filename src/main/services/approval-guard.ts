import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export type HighRiskAction =
  | 'SEND_EXTERNAL'
  | 'MERGE_MAIN'
  | 'DEPLOY_PROD'
  | 'EXPORT_DATA'
  | 'PURCHASE'
  | 'CHANGE_CONFIG'
  | 'CHANGE_POLICY'
  | 'ROTATE_TOKEN'
  | 'CHANGE_WORKSPACE_ENV'
  | 'UNLOCK_WORKSPACE'
  | 'DEPLOY_TARGET'
  | 'START_SERVICE'
  | 'STOP_SERVICE'
  | 'RESTART_SERVICE'
  | 'UPGRADE_SERVICE'
  | 'BACKUP_DEPLOYMENT'
  | 'RESTORE_DEPLOYMENT'
  | 'DELETE_DEPLOYMENT'

export class ApprovalGuard {
  /**
   * 检查操作是否需要审批
   */
  static requiresApproval(action: string): boolean {
    const highRiskActions: HighRiskAction[] = [
      'SEND_EXTERNAL',
      'MERGE_MAIN',
      'DEPLOY_PROD',
      'EXPORT_DATA',
      'PURCHASE',
      'CHANGE_CONFIG',
      'CHANGE_POLICY',
      'ROTATE_TOKEN',
      'CHANGE_WORKSPACE_ENV',
      'UNLOCK_WORKSPACE',
      'DEPLOY_TARGET',
      'START_SERVICE',
      'STOP_SERVICE',
      'RESTART_SERVICE',
      'UPGRADE_SERVICE',
      'BACKUP_DEPLOYMENT',
      'RESTORE_DEPLOYMENT',
      'DELETE_DEPLOYMENT'
    ]
    return highRiskActions.includes(action as HighRiskAction)
  }

  /**
   * 创建审批请求
   */
  static async createApproval(
    actionType: HighRiskAction,
    payload: any,
    requestedBy: string,
    ticketId?: string
  ): Promise<string> {
    const approval = await prisma.approval.create({
      data: {
        ticketId,
        actionType,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        requestedBy
      }
    })
    return approval.id
  }

  /**
   * 检查审批状态
   */
  static async checkApproval(approvalId: string): Promise<'PENDING' | 'APPROVED' | 'REJECTED'> {
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } })
    if (!approval) throw new Error('Approval not found')
    return approval.status as 'PENDING' | 'APPROVED' | 'REJECTED'
  }

  /**
   * 批准审批
   */
  static async approve(approvalId: string, approvedBy: string): Promise<void> {
    await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approvedBy,
        decidedAt: new Date()
      }
    })
  }

  /**
   * 拒绝审批
   */
  static async reject(approvalId: string, approvedBy: string): Promise<void> {
    await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        approvedBy,
        decidedAt: new Date()
      }
    })
  }

  /**
   * 执行受保护的操作
   */
  static async executeProtected<T>(
    action: string,
    payload: any,
    requestedBy: string,
    executor: () => Promise<T>,
    ticketId?: string
  ): Promise<{ approvalId?: string; result?: T; needsApproval: boolean }> {
    if (!this.requiresApproval(action)) {
      // 不需要审批，直接执行
      const result = await executor()
      return { result, needsApproval: false }
    }

    // 需要审批
    const approvalId = await this.createApproval(
      action as HighRiskAction,
      payload,
      requestedBy,
      ticketId
    )

    return { approvalId, needsApproval: true }
  }
}

export { prisma }
