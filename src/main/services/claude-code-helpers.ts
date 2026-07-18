/**
 * Claude Code Helpers - 消息发送相关辅助函数
 */

import { prisma } from './api-shared'
import { writeAuditLog } from './audit-log-writer'
import { v4 as uuidv4 } from 'uuid'

/**
 * 分发出站消息（审批通过后执行）
 */
export async function dispatchOutboundMessage(outboundMessageId: string, actor: string): Promise<void> {
  const traceId = uuidv4()

  const message = await prisma.outboundMessage.findUnique({
    where: { id: outboundMessageId },
    include: { workspace: true }
  })

  if (!message) {
    throw new Error(`OutboundMessage ${outboundMessageId} not found`)
  }

  // 根据 channel 类型发送消息
  // TODO: 实现实际的发送逻辑
  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: {
      status: 'SENT',
      lastSentAt: new Date(),
      lastError: null
    }
  })

  await writeAuditLog({
    workspaceId: message.workspaceId,
    traceId,
    actor,
    action: 'OUTBOUND_MESSAGE_SENT',
    tool: 'communications',
    request: { outboundMessageId, channel: message.channel },
    response: { status: 'SENT' }
  })
}
