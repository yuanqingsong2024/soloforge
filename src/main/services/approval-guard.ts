import { type Approval } from '@prisma/client'
import { prisma } from './db'


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
    payload: unknown,
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
   * 执行守卫：断言审批已通过
   *
   * 用于二次执行端点（非通过 /api/approvals/:id 触发的端点）在校验后再次确认审批状态。
   * 校验项：
   * 1. 审批记录存在
   * 2. 状态为 APPROVED（PENDING / REJECTED 直接抛错）
   * 3. actionType 与期望匹配（若提供 expectedActionType）
   *
   * 返回审批记录与解析后的 payload（已 JSON.parse）。
   */
  static async assertApproved(
    approvalId: string,
    expectedActionType?: HighRiskAction
  ): Promise<{ approval: Approval; payload: unknown }> {
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } })
    if (!approval) {
      throw new Error(`审批记录不存在: ${approvalId}`)
    }
    if (approval.status !== 'APPROVED') {
      throw new Error(`审批未通过，当前状态: ${approval.status}（需为 APPROVED）`)
    }
    if (expectedActionType && approval.actionType !== expectedActionType) {
      throw new Error(
        `审批动作类型不匹配，期望: ${expectedActionType}，实际: ${approval.actionType}`
      )
    }

    let payload: unknown
    try {
      payload = JSON.parse(approval.payload)
    } catch {
      throw new Error(`审批 payload 解析失败: ${approvalId}`)
    }

    return { approval, payload }
  }

  /**
   * 执行受保护的操作
   */
  static async executeProtected<T>(
    action: string,
    payload: unknown,
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

export { prisma } from './db'
