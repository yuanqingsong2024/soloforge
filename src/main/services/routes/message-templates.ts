/**
 * Message Templates 路由模块 - 消息模板管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import {
  prisma,
  stableJson,
  safeParseJson,
  computeContentHash,
  computeIdempotencyKey,
  maskTarget
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

type TemplateScenario = 'REQUIREMENTS_CLARIFY' | 'QUOTE' | 'DELIVERY_NOTICE' | 'STATUS_UPDATE' | 'CUSTOM'
type ContentFormat = 'MARKDOWN' | 'PLAINTEXT'

interface CreateTemplateBody {
  name: string
  scenario: TemplateScenario
  channelConstraints?: string[]
  contentFormat: ContentFormat
  subjectTemplate?: string
  bodyTemplate: string
  variablesSchema?: Record<string, unknown>
  defaults?: Record<string, unknown>
  enabled?: boolean
}

interface RenderTemplateBody {
  templateId: string
  ticketId?: string
  variables?: Record<string, unknown>
  channel?: string
  to?: string
}

// ==================== 辅助函数 ====================

function renderTemplateText(template: string, variables: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_: unknown, key: string) => {
    const value = variables[key]
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return stableJson(value)
    return String(value)
  })
}

function mergeTemplateVariables(
  defaults: Record<string, unknown>,
  inferred: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...defaults,
    ...inferred,
    ...input
  }
}

// ==================== 路由注册 ====================

export function registerMessageTemplatesRoutes(fastify: FastifyInstance): void {
  // 获取消息模板列表
  fastify.get('/api/message-templates', async (request) => {
    const { enabled } = request.query as { enabled?: string }
    const rows = await prisma.messageTemplate.findMany({
      where: enabled === undefined ? undefined : { enabled: enabled === 'true' },
      orderBy: { updatedAt: 'desc' }
    })

    return rows.map(row => ({
      ...row,
      channelConstraints: safeParseJson<string[]>(row.channelConstraints, []),
      variablesSchema: safeParseJson<Record<string, unknown>>(row.variablesSchema, {}),
      defaults: safeParseJson<Record<string, unknown>>(row.defaults, {})
    }))
  })

  // 创建消息模板
  fastify.post('/api/message-templates', async (request) => {
    const body = request.body as CreateTemplateBody
    return await prisma.messageTemplate.create({
      data: {
        name: body.name,
        scenario: body.scenario,
        channelConstraints: JSON.stringify(body.channelConstraints || []),
        contentFormat: body.contentFormat,
        subjectTemplate: body.subjectTemplate || null,
        bodyTemplate: body.bodyTemplate,
        variablesSchema: JSON.stringify(body.variablesSchema || {}),
        defaults: JSON.stringify(body.defaults || {}),
        enabled: body.enabled ?? true
      }
    })
  })

  // 更新消息模板
  fastify.put('/api/message-templates/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Partial<CreateTemplateBody>
    return await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.scenario !== undefined ? { scenario: body.scenario } : {}),
        ...(body.channelConstraints !== undefined ? { channelConstraints: JSON.stringify(body.channelConstraints) } : {}),
        ...(body.contentFormat !== undefined ? { contentFormat: body.contentFormat } : {}),
        ...(body.subjectTemplate !== undefined ? { subjectTemplate: body.subjectTemplate } : {}),
        ...(body.bodyTemplate !== undefined ? { bodyTemplate: body.bodyTemplate } : {}),
        ...(body.variablesSchema !== undefined ? { variablesSchema: JSON.stringify(body.variablesSchema) } : {}),
        ...(body.defaults !== undefined ? { defaults: JSON.stringify(body.defaults) } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {})
      }
    })
  })

  // 渲染消息模板
  fastify.post('/api/message-templates/render', async (request) => {
    const traceId = uuidv4()
    const body = request.body as RenderTemplateBody

    const requestAuditPayload = {
      templateId: body.templateId,
      ticketId: body.ticketId || null,
      channel: body.channel || null,
      toMasked: body.to ? maskTarget(body.to) : null,
      variablesKeys: Object.keys(body.variables || {})
    }

    try {
      if (!body.templateId) {
        throw new Error('templateId 必填')
      }

      const template = await prisma.messageTemplate.findUnique({ where: { id: body.templateId } })
      if (!template || !template.enabled) {
        throw new Error('模板不存在或已禁用')
      }

      const ticket = body.ticketId
        ? await prisma.ticket.findUnique({
          where: { id: body.ticketId },
          include: {
            contact: true,
            primaryTarget: true,
            artifacts: { orderBy: { createdAt: 'desc' }, take: 3 }
          }
        })
        : null

      if (body.ticketId && !ticket) {
        throw new Error('工单不存在')
      }

      const inferred: Record<string, unknown> = {
        ticketId: ticket?.id || '',
        ticketTitle: ticket?.title || '',
        contactName: ticket?.contact?.name || '',
        contactCompany: ticket?.contact?.company || '',
        latestArtifact: ticket?.artifacts?.[0]?.content || ''
      }

      const defaults = safeParseJson<Record<string, unknown>>(template.defaults, {})
      const variables = mergeTemplateVariables(defaults, inferred, body.variables || {})
      const renderedSubject = template.subjectTemplate ? renderTemplateText(template.subjectTemplate, variables) : null
      const renderedBody = renderTemplateText(template.bodyTemplate, variables)

      const run = await prisma.templateRun.create({
        data: {
          templateId: template.id,
          ticketId: ticket?.id || null,
          variables: stableJson(variables),
          renderedSubject,
          renderedBody
        }
      })

      const targetTo = (body.to || ticket?.primaryTarget?.to || '').trim()
      const targetChannel = (body.channel || ticket?.primaryTarget?.channel || 'slack').trim()
      if (!targetTo) {
        throw new Error('缺少接收目标 to')
      }
      if (!targetChannel) {
        throw new Error('缺少 channel')
      }

      const contentHash = computeContentHash({
        channel: targetChannel,
        to: targetTo,
        subject: renderedSubject,
        body: renderedBody
      })

      const idempotencyKey = computeIdempotencyKey({
        ticketId: ticket?.id || null,
        templateId: template.id,
        scenario: template.scenario,
        channel: targetChannel,
        to: targetTo,
        subject: renderedSubject,
        body: renderedBody
      })

      const duplicated = await prisma.outboundMessage.findFirst({
        where: {
          contentHash,
          status: { in: ['SENDING', 'SENT'] }
        }
      })

      const draftMessageId = duplicated
        ? duplicated.id
        : (await prisma.outboundMessage.create({
          data: {
            ticketId: ticket?.id || null,
            templateId: template.id,
            provider: 'claude-code',
            channel: targetChannel,
            to: targetTo,
            toMasked: maskTarget(targetTo),
            subject: renderedSubject,
            body: renderedBody,
            status: 'DRAFT',
            idempotencyKey,
            traceId: uuidv4(),
            contentHash,
            attempts: 0
          }
        })).id

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'TEMPLATE_RENDER',
        tool: 'message-templates',
        request: requestAuditPayload,
        response: {
          templateRunId: run.id,
          outboundMessageId: draftMessageId,
          deduplicated: Boolean(duplicated),
          channel: targetChannel,
          toMasked: maskTarget(targetTo)
        }
      })

      return {
        templateRunId: run.id,
        draftMessageId,
        renderedSubject,
        renderedBody
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        await writeAuditLog({
          traceId,
          actor: 'admin',
          action: 'TEMPLATE_RENDER',
          tool: 'message-templates',
          request: requestAuditPayload,
          response: { success: false, error: message }
        })
      } catch (logError) {
        const logMessage = logError instanceof Error ? logError.message : String(logError)
        fastify.log.error({ traceId, err: logMessage }, '写入审计日志失败：TEMPLATE_RENDER')
      }
      throw new Error(`渲染模板失败：${message}`)
    }
  })

  // 渲染草稿消息
  fastify.post('/api/template-runs/render-draft', async (request) => {
    const body = request.body as RenderTemplateBody
    const template = await prisma.messageTemplate.findUnique({ where: { id: body.templateId } })
    if (!template || !template.enabled) {
      throw new Error('模板不存在或已禁用')
    }

    const ticket = body.ticketId
      ? await prisma.ticket.findUnique({
        where: { id: body.ticketId },
        include: {
          contact: true,
          primaryTarget: true,
          artifacts: { orderBy: { createdAt: 'desc' }, take: 3 }
        }
      })
      : null

    const inferred = {
      ticketId: ticket?.id || '',
      ticketTitle: ticket?.title || '',
      contactName: ticket?.contact?.name || '',
      contactCompany: ticket?.contact?.company || '',
      latestArtifact: ticket?.artifacts?.[0]?.content || ''
    }

    const defaults = safeParseJson<Record<string, unknown>>(template.defaults, {})
    const variables = mergeTemplateVariables(defaults, inferred, body.variables || {})
    const renderedSubject = template.subjectTemplate ? renderTemplateText(template.subjectTemplate, variables) : null
    const renderedBody = renderTemplateText(template.bodyTemplate, variables)

    const run = await prisma.templateRun.create({
      data: {
        templateId: template.id,
        ticketId: ticket?.id || null,
        variables: stableJson(variables),
        renderedSubject,
        renderedBody
      }
    })

    const targetTo = body.to || ticket?.primaryTarget?.to || ''
    const targetChannel = body.channel || ticket?.primaryTarget?.channel || 'slack'
    const contentHash = computeContentHash({
      channel: targetChannel,
      to: targetTo,
      subject: renderedSubject,
      body: renderedBody
    })

    const idempotencyKey = computeIdempotencyKey({
      ticketId: ticket?.id || null,
      templateId: template.id,
      scenario: template.scenario,
      channel: targetChannel,
      to: targetTo,
      subject: renderedSubject,
      body: renderedBody
    })

    const draft = await prisma.outboundMessage.create({
      data: {
        ticketId: ticket?.id || null,
        templateId: template.id,
        provider: 'claude-code',
        channel: targetChannel,
        to: targetTo,
        toMasked: maskTarget(targetTo),
        subject: renderedSubject,
        body: renderedBody,
        status: 'DRAFT',
        idempotencyKey,
        traceId: uuidv4(),
        contentHash,
        attempts: 0
      }
    })

    return {
      templateRun: run,
      outboundDraft: draft,
      rendered: {
        subject: renderedSubject,
        body: renderedBody,
        variables
      }
    }
  })
}
