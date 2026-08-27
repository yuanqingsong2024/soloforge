/**
 * 审批执行器（Approval Executor）
 *
 * 职责：
 * 1. 集中分发已批准（APPROVED）高危动作的执行逻辑
 * 2. 对未实现执行逻辑的动作记录审计日志（标记"待实现"）
 * 3. 处理被拒绝（REJECTED）动作的回滚/取消逻辑
 *
 * 设计：处理器注册表模式
 * - api-server.ts 在启动时通过 registerApproved() / registerRejected() 注册各动作的处理器
 * - 执行器本身不依赖 api-server.ts 内部函数，避免循环依赖
 * - 未注册处理器的动作走"待实现"降级路径，仅记录审计日志
 *
 * 安全约束（AGENTS.md §3）：
 * - 只有 APPROVED 状态才允许执行
 * - 执行后必须写入 AuditLog
 * - AuditLog 只允许 create，禁止 update/delete
 */

import { type Approval } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { prisma, type HighRiskAction } from './approval-guard'
import { writeAuditLogStrict } from './audit-log-writer'
import { logger } from './logger'

/** 已批准动作处理器类型 */
export type ApprovedActionHandler = (
  approval: Approval,
  payload: unknown
) => Promise<unknown>

/** 被拒绝动作处理器类型 */
export type RejectedActionHandler = (
  approval: Approval,
  payload: unknown
) => Promise<unknown>

/** 执行结果 */
export interface ExecutionResult {
  /** 是否有已注册的处理器（true=已执行，false=未实现或无额外处理） */
  handled: boolean
  /** 机器可读的执行状态 */
  status?: 'EXECUTED' | 'NOT_IMPLEMENTED' | 'EXECUTION_FAILED' | 'REJECTED'
  /** 处理器返回值（handled=false 时为 undefined） */
  result?: unknown
}

class ApprovalExecutorClass {
  /** 已批准动作处理器注册表 */
  private approvedHandlers = new Map<HighRiskAction, ApprovedActionHandler>()

  /** 被拒绝动作处理器注册表 */
  private rejectedHandlers = new Map<HighRiskAction, RejectedActionHandler>()

  /**
   * 注册已批准动作的处理器
   *
   * @param action 高危动作类型
   * @param handler 处理器函数
   */
  registerApproved(action: HighRiskAction, handler: ApprovedActionHandler): void {
    if (this.approvedHandlers.has(action)) {
      logger.warn(`已批准动作处理器已存在，将被覆盖: ${action}`, 'approval-executor')
    }
    this.approvedHandlers.set(action, handler)
  }

  /**
   * 注册被拒绝动作的处理器
   *
   * @param action 高危动作类型
   * @param handler 处理器函数
   */
  registerRejected(action: HighRiskAction, handler: RejectedActionHandler): void {
    if (this.rejectedHandlers.has(action)) {
      logger.warn(`被拒绝动作处理器已存在，将被覆盖: ${action}`, 'approval-executor')
    }
    this.rejectedHandlers.set(action, handler)
  }

  /**
   * 执行已批准的动作
   *
   * 流程：
   * 1. 解析 payload（JSON.parse）
   * 2. 查找已注册处理器
   * 3. 有处理器 → 调用执行
   * 4. 无处理器 → 记录审计日志（标记"待实现"），不抛异常
   *
   * @param approval 已批准的审批记录（status=APPROVED）
   */
  async executeApprovedAction(approval: Approval): Promise<ExecutionResult> {
    if (approval.status !== 'APPROVED') {
      throw new Error(`审批未批准，禁止执行：${approval.id}`)
    }

    const payload = this.parsePayload(approval)

    const handler = this.approvedHandlers.get(approval.actionType as HighRiskAction)
    if (handler) {
      try {
        const result = await handler(approval, payload)
        return { handled: true, status: 'EXECUTED', result }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await writeAuditLogStrict({
          traceId: uuidv4(),
          actor: approval.approvedBy || approval.requestedBy,
          action: `${approval.actionType}_EXECUTION_FAILED`,
          tool: 'approval-executor',
          approvalId: approval.id,
          request: { actionType: approval.actionType, approvalId: approval.id, payload },
          response: { status: 'execution_failed', error: message }
        })
        logger.error(`审批动作执行失败: ${approval.actionType}`, 'approval-executor', error instanceof Error ? error : undefined)
        return { handled: true, status: 'EXECUTION_FAILED', result: { error: message } }
      }
    }

    // 未实现的动作：记录审计日志（明确标记为未实现）
    await writeAuditLogStrict({
      traceId: uuidv4(),
      actor: approval.approvedBy || approval.requestedBy,
      action: `${approval.actionType}_PENDING_IMPLEMENTATION`,
      tool: 'approval-executor',
      approvalId: approval.id,
      request: {
        actionType: approval.actionType,
        approvalId: approval.id,
        payload
      },
      response: {
        status: 'not_implemented',
        message: '该高危动作已批准但尚未实现执行逻辑，仅记录审计日志'
      }
    })
    logger.warn(
      `审批动作 ${approval.actionType} 已批准但尚未实现执行逻辑，仅记录审计日志`,
      'approval-executor'
    )
    return { handled: false, status: 'NOT_IMPLEMENTED' }
  }

  /**
   * 处理被拒绝的动作
   *
   * 流程：
   * 1. 解析 payload
   * 2. 查找已注册处理器
   * 3. 有处理器 → 调用执行（如取消外发消息）
   * 4. 无处理器 → 记录审计日志
   *
   * @param approval 被拒绝的审批记录（status=REJECTED）
   */
  async handleRejectedAction(approval: Approval): Promise<ExecutionResult> {
    if (approval.status !== 'REJECTED') {
      throw new Error(`审批未拒绝，禁止执行拒绝处理：${approval.id}`)
    }

    const payload = this.parsePayload(approval)

    const handler = this.rejectedHandlers.get(approval.actionType as HighRiskAction)
    if (handler) {
      const result = await handler(approval, payload)
      return { handled: true, status: 'REJECTED', result }
    }

    // 未注册拒绝处理器的动作：记录审计日志
    await writeAuditLogStrict({
      traceId: uuidv4(),
      actor: approval.approvedBy || approval.requestedBy,
      action: `${approval.actionType}_REJECTED`,
      tool: 'approval-executor',
      approvalId: approval.id,
      request: {
        actionType: approval.actionType,
        approvalId: approval.id,
        payload
      },
      response: {
        status: 'rejected',
        message: '审批被拒绝，无额外回滚逻辑'
      }
    })
    return { handled: false, status: 'REJECTED' }
  }

  /**
   * 解析审批 payload
   * 解析失败时抛出可定位的错误
   */
  private parsePayload(approval: Approval): unknown {
    try {
      return JSON.parse(approval.payload)
    } catch {
      throw new Error(`审批 payload 解析失败: ${approval.id}（actionType=${approval.actionType}）`)
    }
  }

  /**
   * 获取已注册的已批准动作类型列表（用于诊断/测试）
   */
  getRegisteredApprovedActions(): HighRiskAction[] {
    return Array.from(this.approvedHandlers.keys())
  }

  /**
   * 获取已注册的被拒绝动作类型列表（用于诊断/测试）
   */
  getRegisteredRejectedActions(): HighRiskAction[] {
    return Array.from(this.rejectedHandlers.keys())
  }

  /**
   * 清空所有已注册的处理器（仅用于测试）
   */
  clearHandlers(): void {
    this.approvedHandlers.clear()
    this.rejectedHandlers.clear()
  }
}

/** 审批执行器单例 */
export const ApprovalExecutor = new ApprovalExecutorClass()

export { prisma }
