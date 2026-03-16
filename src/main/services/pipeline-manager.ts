import { PrismaClient, type PipelineStep, type Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalGuard, type HighRiskAction } from './approval-guard'

const prisma = new PrismaClient()

type PipelineRuntimeStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED'

function safeParseStringArray(raw: string, fieldLabel: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} 不是数组`) // 中文：定位字段
    }
    const invalid = parsed.find(v => typeof v !== 'string')
    if (invalid !== undefined) {
      throw new Error(`${fieldLabel} 数组元素必须为字符串`)
    }
    return parsed as string[]
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldLabel} 解析失败: ${message}`)
  }
}

function asHighRiskAction(action: string): HighRiskAction | null {
  const candidates: HighRiskAction[] = [
    'SEND_EXTERNAL',
    'MERGE_MAIN',
    'DEPLOY_PROD',
    'EXPORT_DATA',
    'PURCHASE',
    'CHANGE_CONFIG',
    'ROTATE_TOKEN'
  ]
  return candidates.includes(action as HighRiskAction) ? (action as HighRiskAction) : null
}

async function writeAuditLog(input: {
  ticketId?: string
  traceId: string
  actor: string
  action: string
  tool?: string
  approvalId?: string
  request: unknown
  response: unknown
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ticketId: input.ticketId,
      traceId: input.traceId,
      actor: input.actor,
      action: input.action,
      tool: input.tool,
      approvalId: input.approvalId,
      request: JSON.stringify(input.request),
      response: JSON.stringify(input.response),
      ts: new Date()
    }
  })
}

export class PipelineManager {
  /**
   * 推进到下一步
   */
  static async advanceStep(
    ticketId: string,
    requestedBy: string
  ): Promise<{ traceId: string; fromStepOrder: number; toStepOrder: number; status: PipelineRuntimeStatus; needsApproval: boolean; approvalIds: string[] }>
  {
    const traceId = uuidv4()

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const state = await this.getOrCreateTicketPipelineState(tx, ticketId)
      const steps = state.pipeline.steps.slice().sort((a, b) => a.order - b.order)
      if (steps.length === 0) {
        throw new Error('Pipeline 未配置任何步骤')
      }

      const currentIdx = Math.max(
        0,
        steps.findIndex(s => s.order === state.currentStepOrder)
      )
      const currentStep = steps[currentIdx]
      const nextStep = steps[currentIdx + 1]

      if (!nextStep) {
        const updated = await tx.ticketPipelineState.update({
          where: { ticketId },
          data: { status: 'COMPLETED' }
        })
        return {
          fromStepOrder: currentStep.order,
          toStepOrder: currentStep.order,
          status: updated.status as PipelineRuntimeStatus,
          nextStep: null as PipelineStep | null
        }
      }

      // 检查下一步所需输入产物
      const requiredInputs = safeParseStringArray(nextStep.inputArtifacts, 'PipelineStep.inputArtifacts')
      const inputCheck = await this.checkInputArtifactsTx(tx, ticketId, requiredInputs)
      if (!inputCheck.ok) {
        throw new Error(`缺少推进所需产物: ${inputCheck.missing.join(', ')}`)
      }

      const nextStatus: PipelineRuntimeStatus = this.requiresApproval(nextStep) ? 'PAUSED' : 'RUNNING'
      const updated = await tx.ticketPipelineState.update({
        where: { ticketId },
        data: {
          currentStepOrder: nextStep.order,
          status: nextStatus
        }
      })

      return {
        fromStepOrder: currentStep.order,
        toStepOrder: nextStep.order,
        status: updated.status as PipelineRuntimeStatus,
        nextStep
      }
    })

    // 审批创建（如需要）
    const approvalIds: string[] = []
    let needsApproval = false
    if (result.nextStep && this.requiresApproval(result.nextStep)) {
      const actionTypes = safeParseStringArray(result.nextStep.requireApprovalActions, 'PipelineStep.requireApprovalActions')
      const highRisk = actionTypes
        .filter(a => ApprovalGuard.requiresApproval(a))
        .map(a => asHighRiskAction(a))
        .filter((a): a is HighRiskAction => a !== null)

      if (highRisk.length > 0) {
        needsApproval = true
        for (const actionType of highRisk) {
          const approvalId = await ApprovalGuard.createApproval(
            actionType,
            {
              ticketId,
              pipelineStepOrder: result.toStepOrder,
              note: 'Pipeline 推进需要审批'
            },
            requestedBy,
            ticketId
          )
          approvalIds.push(approvalId)
        }
      }
    }

    await writeAuditLog({
      ticketId,
      traceId,
      actor: requestedBy,
      action: 'PIPELINE_ADVANCE',
      request: {
        ticketId,
        fromStepOrder: result.fromStepOrder,
        toStepOrder: result.toStepOrder
      },
      response: {
        status: result.status,
        needsApproval,
        approvalIds
      }
    })

    if (result.status === 'COMPLETED') {
      await writeAuditLog({
        ticketId,
        traceId,
        actor: requestedBy,
        action: 'PIPELINE_COMPLETED',
        request: { ticketId },
        response: { status: 'COMPLETED' }
      })
    }

    return {
      traceId,
      fromStepOrder: result.fromStepOrder,
      toStepOrder: result.toStepOrder,
      status: result.status,
      needsApproval,
      approvalIds
    }
  }

  /**
   * 回退到上一步
   */
  static async rollbackStep(
    ticketId: string,
    requestedBy: string
  ): Promise<{ traceId: string; fromStepOrder: number; toStepOrder: number; status: PipelineRuntimeStatus }>
  {
    const traceId = uuidv4()

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) throw new Error('工单不存在')

      const state = await tx.ticketPipelineState.findUnique({
        where: { ticketId },
        include: { pipeline: { include: { steps: true } } }
      })
      if (!state) {
        throw new Error('该工单尚未初始化 Pipeline 状态')
      }

      const steps = state.pipeline.steps.slice().sort((a, b) => a.order - b.order)
      if (steps.length === 0) throw new Error('Pipeline 未配置任何步骤')

      const currentIdx = steps.findIndex(s => s.order === state.currentStepOrder)
      if (currentIdx <= 0) {
        // 已经在第一步，无法回退
        return {
          fromStepOrder: state.currentStepOrder,
          toStepOrder: state.currentStepOrder,
          status: state.status as PipelineRuntimeStatus
        }
      }

      const currentStep = steps[currentIdx]
      if (!currentStep.allowRework) {
        throw new Error('当前步骤不允许返工回退')
      }

      const prevStep = steps[currentIdx - 1]
      const updated = await tx.ticketPipelineState.update({
        where: { ticketId },
        data: {
          currentStepOrder: prevStep.order,
          status: 'RUNNING'
        }
      })

      return {
        fromStepOrder: currentStep.order,
        toStepOrder: prevStep.order,
        status: updated.status as PipelineRuntimeStatus
      }
    })

    await writeAuditLog({
      ticketId,
      traceId,
      actor: requestedBy,
      action: 'PIPELINE_ROLLBACK',
      request: {
        ticketId,
        fromStepOrder: result.fromStepOrder,
        toStepOrder: result.toStepOrder
      },
      response: { status: result.status }
    })

    return { traceId, ...result }
  }

  /**
   * 检查输入产物
   */
  static async checkInputArtifacts(
    ticketId: string,
    requiredTypes: string[]
  ): Promise<{ ok: boolean; missing: string[]; found: string[] }>
  {
    return await this.checkInputArtifactsTx(prisma, ticketId, requiredTypes)
  }

  /**
   * 判断是否需要审批
   */
  static requiresApproval(step: PipelineStep): boolean {
    const actions = safeParseStringArray(step.requireApprovalActions, 'PipelineStep.requireApprovalActions')
    return actions.some(a => ApprovalGuard.requiresApproval(a))
  }

  private static async getOrCreateTicketPipelineState(
    tx: Prisma.TransactionClient,
    ticketId: string
  ) {
    const existing = await tx.ticketPipelineState.findUnique({
      where: { ticketId },
      include: { pipeline: { include: { steps: true } } }
    })
    if (existing) return existing

    const pipeline = await tx.pipeline.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
      include: { steps: { orderBy: { order: 'asc' } } }
    })
    if (!pipeline) {
      throw new Error('未找到可用的 Pipeline（enabled=true）')
    }
    if (pipeline.steps.length === 0) {
      throw new Error('可用 Pipeline 未配置任何步骤')
    }

    const first = pipeline.steps[0]
    const created = await tx.ticketPipelineState.create({
      data: {
        ticketId,
        pipelineId: pipeline.id,
        currentStepOrder: first.order,
        status: 'RUNNING'
      },
      include: { pipeline: { include: { steps: true } } }
    })
    return created
  }

  private static async checkInputArtifactsTx(
    tx: Prisma.TransactionClient | PrismaClient,
    ticketId: string,
    requiredTypes: string[]
  ): Promise<{ ok: boolean; missing: string[]; found: string[] }>
  {
    if (requiredTypes.length === 0) {
      return { ok: true, missing: [], found: [] }
    }

    const artifacts = await tx.artifact.findMany({
      where: { ticketId, type: { in: requiredTypes } },
      select: { type: true }
    })
    const foundSet = new Set(artifacts.map(a => a.type))
    const missing = requiredTypes.filter(t => !foundSet.has(t))
    return {
      ok: missing.length === 0,
      missing,
      found: Array.from(foundSet)
    }
  }
}

export { prisma }
