import { type Approval } from '@prisma/client'
import { getDefaultDeps, type IDatabaseClient } from './service-container'

// 保留 prisma 导出以保持向后兼容
export { prisma } from './db'

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

/**
 * ApprovalGuard 构造函数参数
 */
export interface ApprovalGuardDeps {
  /** 数据库客户端（支持 mock） */
  db?: IDatabaseClient
}

/**
 * ApprovalGuard 服务
 * 
 * 核心职责：
 * 1. 检查操作是否需要审批
 * 2. 创建审批请求
 * 3. 执行守卫检查
 * 
 * 支持依赖注入，便于单元测试 mock
 */
export class ApprovalGuard {
  private readonly db: IDatabaseClient

  /**
   * 静态默认实例（保持向后兼容）
   */
  private static defaultInstance: ApprovalGuard | null = null

  /**
   * 创建 ApprovalGuard 实例
   * 
   * @param deps 可选的依赖注入，默认使用全局依赖
   */
  constructor(deps?: ApprovalGuardDeps) {
    const defaultDeps = getDefaultDeps()
    this.db = deps?.db || defaultDeps.db
  }

  /**
   * 获取默认实例（保持向后兼容）
   */
  static getInstance(): ApprovalGuard {
    if (!this.defaultInstance) {
      this.defaultInstance = new ApprovalGuard()
    }
    return this.defaultInstance
  }

  /**
   * 检查操作是否需要审批
   */
  requiresApproval(action: string): boolean {
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
  async createApproval(
    actionType: HighRiskAction,
    payload: unknown,
    requestedBy: string,
    ticketId?: string
  ): Promise<string> {
    const approval = await this.db.approval.create({
      data: {
        ticketId,
        actionType,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        requestedBy
      }
    }) as Approval
    return approval.id
  }

  /**
   * 检查审批状态
   */
  async checkApproval(approvalId: string): Promise<'PENDING' | 'APPROVED' | 'REJECTED'> {
    const approval = await this.db.approval.findUnique({ where: { id: approvalId } }) as Approval | null
    if (!approval) throw new Error('Approval not found')
    return approval.status as 'PENDING' | 'APPROVED' | 'REJECTED'
  }

  /**
   * 批准审批
   */
  async approve(approvalId: string, approvedBy: string): Promise<void> {
    await this.db.approval.update({
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
  async reject(approvalId: string, approvedBy: string): Promise<void> {
    await this.db.approval.update({
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
  async assertApproved(
    approvalId: string,
    expectedActionType?: HighRiskAction
  ): Promise<{ approval: Approval; payload: unknown }> {
    const approval = await this.db.approval.findUnique({ where: { id: approvalId } }) as Approval | null
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
  async executeProtected<T>(
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

// ==================== 静态方法兼容层 ====================
// 保持向后兼容，提供静态方法访问默认实例

export namespace ApprovalGuard {
  /**
   * @deprecated 使用 ApprovalGuard.getInstance().requiresApproval() 替代
   */
  export function requiresApproval(action: string): boolean {
    return ApprovalGuard.getInstance().requiresApproval(action)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).createApproval() 替代
   */
  export async function createApproval(
    actionType: HighRiskAction,
    payload: unknown,
    requestedBy: string,
    ticketId?: string
  ): Promise<string> {
    return ApprovalGuard.getInstance().createApproval(actionType, payload, requestedBy, ticketId)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).checkApproval() 替代
   */
  export async function checkApproval(approvalId: string): Promise<'PENDING' | 'APPROVED' | 'REJECTED'> {
    return ApprovalGuard.getInstance().checkApproval(approvalId)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).approve() 替代
   */
  export async function approve(approvalId: string, approvedBy: string): Promise<void> {
    return ApprovalGuard.getInstance().approve(approvalId, approvedBy)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).reject() 替代
   */
  export async function reject(approvalId: string, approvedBy: string): Promise<void> {
    return ApprovalGuard.getInstance().reject(approvalId, approvedBy)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).assertApproved() 替代
   */
  export async function assertApproved(
    approvalId: string,
    expectedActionType?: HighRiskAction
  ): Promise<{ approval: Approval; payload: unknown }> {
    return ApprovalGuard.getInstance().assertApproved(approvalId, expectedActionType)
  }

  /**
   * @deprecated 使用 new ApprovalGuard(deps).executeProtected() 替代
   */
  export async function executeProtected<T>(
    action: string,
    payload: unknown,
    requestedBy: string,
    executor: () => Promise<T>,
    ticketId?: string
  ): Promise<{ approvalId?: string; result?: T; needsApproval: boolean }> {
    return ApprovalGuard.getInstance().executeProtected(action, payload, requestedBy, executor, ticketId)
  }
}
