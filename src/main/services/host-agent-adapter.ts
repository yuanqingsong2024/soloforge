/**
 * Host Agent Worker 适配器
 *
 * 职责：
 * - 与 Host Agent（远程宿主机常驻代理）通信
 * - 任务派发与结果回收
 * - 通过 SoloForge 本地 API 或 WebSocket 与 Host Agent 通信
 *
 * 注意：当前为存根实现，实际集成需要：
 * - Host Agent 注册流程
 * - 任务派发（AgentAction 表）
 * - 心跳监控
 * - 结果回收
 */

import { v4 as uuidv4 } from 'uuid'
import { type WorkerAdapter, type WorkerTaskRequest, type WorkerTaskResponse, type WorkerStatusResponse, type WorkerRow } from './worker-adapter'
import { WorkerRegistry, type WorkerType } from './worker-registry'
import { writeAuditLog } from './audit-log-writer'
import { prisma } from './db'

export class HostAgentAdapter implements WorkerAdapter {
  readonly type: WorkerType = 'host-agent'

  async dispatchTask(workerId: string, request: WorkerTaskRequest): Promise<WorkerTaskResponse> {
    const traceId = request.traceId

    const action = await prisma.agentAction.create({
      data: {
        workspaceId: '00000000-0000-0000-0000-000000000001',
        targetId: workerId,
        hostAgentId: workerId,
        actionType: request.taskType,
        requestJson: JSON.stringify({
          prompt: request.prompt,
          context: request.context
        }),
        status: 'PENDING',
        traceId
      }
    })

    await writeAuditLog({
      actor: 'system',
      traceId,
      action: 'HOST_AGENT_TASK_DISPATCHED',
      tool: 'host-agent-adapter',
      request: {
        workerId,
        taskType: request.taskType,
        promptLength: request.prompt.length,
        actionId: action.id
      },
      response: {
        taskId: action.id,
        status: 'PENDING'
      }
    })

    return {
      taskId: action.id,
      status: 'PENDING'
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    await prisma.agentAction.update({
      where: { id: taskId },
      data: { status: 'CANCELED' }
    })

    await writeAuditLog({
      actor: 'system',
      traceId: uuidv4(),
      action: 'HOST_AGENT_TASK_CANCELED',
      tool: 'host-agent-adapter',
      request: { taskId },
      response: { canceled: true }
    })
  }

  async getTaskStatus(taskId: string): Promise<WorkerStatusResponse> {
    const action = await prisma.agentAction.findUnique({
      where: { id: taskId }
    })

    if (!action) {
      return {
        taskId,
        status: 'FAILED',
        error: '任务不存在'
      }
    }

    return {
      taskId: action.id,
      status: action.status as WorkerStatusResponse['status'],
      result: action.resultJson ? JSON.parse(action.resultJson) : undefined,
      error: action.errorSummary || undefined
    }
  }

  async listWorkers(enabledOnly = false): Promise<WorkerRow[]> {
    const where = enabledOnly ? { status: 'ONLINE' } : undefined
    const agents = await prisma.hostAgent.findMany({ where })

    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      enabled: (agent.status ?? '') === 'ONLINE',
      capabilities: agent.capabilitiesJson,
      tags: agent.labelsJson,
      lastHealthStatus: agent.lastHeartbeatAt ? 'OK' : null,
      lastHealthAt: agent.lastHeartbeatAt || null
    }))
  }

  async ping(workerId: string): Promise<{ success: boolean; latency?: number; error?: string }> {
    const agent = await prisma.hostAgent.findUnique({ where: { id: workerId } })

    if (!agent) {
      return { success: false, error: 'Agent 不存在' }
    }

    const lastHeartbeat = agent.lastHeartbeatAt
    const isOnline = lastHeartbeat
      ? (Date.now() - lastHeartbeat.getTime()) < 180_000
      : false

    return {
      success: isOnline,
      error: isOnline ? undefined : 'Agent 心跳超时'
    }
  }

  async getWorker(workerId: string): Promise<WorkerRow | null> {
    const agent = await prisma.hostAgent.findUnique({ where: { id: workerId } })
    if (!agent) return null

    return {
      id: agent.id,
      name: agent.name,
      enabled: (agent.status ?? '') === 'ONLINE',
      capabilities: agent.capabilitiesJson,
      tags: agent.labelsJson,
      lastHealthStatus: agent.lastHeartbeatAt ? 'OK' : null,
      lastHealthAt: agent.lastHeartbeatAt || null
    }
  }

  async syncToRegistry(): Promise<void> {
    const agents = await this.listWorkers(false)

    for (const agent of agents) {
      WorkerRegistry.register({
        type: 'host-agent',
        id: agent.id,
        name: agent.name,
        enabled: agent.enabled,
        capabilities: Object.keys(JSON.parse(agent.capabilities || '{}')),
        tags: JSON.parse(agent.tags || '[]'),
        healthStatus: agent.lastHealthStatus === 'OK' ? 'healthy' : 'unknown',
        lastHealthAt: agent.lastHealthAt || undefined
      })
    }
  }
}
