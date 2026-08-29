import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'node:crypto'

export interface ConnectionProfile {
  name: string
  baseUrl: string
  wsUrl: string
  authMode: 'token' | 'password' | 'trusted-proxy'
  token?: string
  password?: string
  edgeToken?: string
  eventPath?: string
}

/**
 * 审计回调类型
 * OpenClawClient 内部每次远程调用都会触发，调用方注入实现以写入 audit_logs
 */
export type OpenClawAuditFn = (input: {
  action: string
  request: unknown
  response: unknown
  error?: string
}) => Promise<void>

export interface OpenClawClientOptions extends ConnectionProfile {
  /** 审计回调（可选）。注入后所有远程调用自动写入审计日志 */
  audit?: OpenClawAuditFn
}

export class OpenClawClient {
  private profile: ConnectionProfile
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private shouldReconnect = false
  private readonly audit?: OpenClawAuditFn

  constructor(options: OpenClawClientOptions) {
    // 分离 audit 字段，profile 不含 audit
    const { audit, ...profile } = options
    this.profile = profile
    this.audit = audit
  }

  async ping(): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now()
    try {
      const response = await fetch(`${this.profile.baseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000)
      })
      const latency = Date.now() - start
      return { success: response.ok, latency }
    } catch (error) {
      return { success: false, latency: Date.now() - start, error: String(error) }
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        let connected = false
        const timeout = setTimeout(() => {
          if (connected) return
          this.shouldReconnect = false
          this.ws?.terminate()
          reject(new Error('连接 OpenClaw WebSocket 超时'))
        }, 5000)

        this.ws = new WebSocket(this.profile.wsUrl, {
          headers: this.getHeaders()
        })

        this.ws.on('open', () => {
          connected = true
          this.shouldReconnect = true
          this.reconnectAttempts = 0
          clearTimeout(timeout)
          resolve()
        })

        this.ws.on('error', (error) => {
          // WS 连接错误走 logger，不打印可能含敏感信息的 error 对象
          if (!connected) {
            this.shouldReconnect = false
            clearTimeout(timeout)
            reject(error)
          }
        })

        this.ws.on('close', () => {
          clearTimeout(timeout)
          if (connected && this.shouldReconnect) {
            this.handleReconnect()
          }
        })

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString())
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(data: unknown, traceId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const payload = typeof data === 'object' && data !== null
      ? { ...(data as Record<string, unknown>), traceId: traceId || uuidv4(), timestamp: new Date().toISOString() }
      : { data, traceId: traceId || uuidv4(), timestamp: new Date().toISOString() }

    this.ws.send(JSON.stringify(payload))
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    // trusted-proxy 模式：不附加客户端凭证，依赖反向代理（OpenResty）的 X-Edge-Token 门禁
    // 与 token/password 模式互斥
    if (this.profile.authMode === 'token' && this.profile.token) {
      headers['Authorization'] = `Bearer ${this.profile.token}`
    } else if (this.profile.authMode === 'password' && this.profile.password) {
      headers['X-Password'] = this.profile.password
    } else if (this.profile.authMode === 'trusted-proxy') {
      // trusted-proxy 模式下客户端不持有业务凭证，仅依赖 edge token（如配置）
      // 业务层鉴权由 OpenResty 反代完成（AGENTS.md §4/§12）
    }

    // X-Edge-Token 作为第二道门禁，所有模式均可选配
    if (this.profile.edgeToken) {
      headers['X-Edge-Token'] = this.profile.edgeToken
    }

    return headers
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    setTimeout(() => {
      this.connect().catch(() => {
        // 重连失败静默处理，已达到 maxReconnectAttempts 时自然停止
      })
    }, delay)
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      // 消息内容可能含敏感信息，不打印；如需调试可注入 audit 回调
      void message
    } catch {
      // 消息解析失败静默处理，避免噪音日志
    }
  }

  /**
   * 获取远端 OpenClaw 配置
   */
  async getConfig(traceId?: string): Promise<unknown> {
    const resolvedTraceId = traceId || uuidv4()
    const response = await fetch(`${this.profile.baseUrl}/config`, {
      method: 'GET',
      headers: {
        ...this.getHeaders(),
        'X-Trace-ID': resolvedTraceId
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) {
      const error = `Failed to fetch config: ${response.status} ${response.statusText}`
      await this.emitAudit('GET_CONFIG', { traceId: resolvedTraceId }, null, error)
      throw new Error(error)
    }
    const result = await response.json()
    await this.emitAudit('GET_CONFIG', { traceId: resolvedTraceId }, result)
    return result
  }

  /**
   * 应用配置到远端 OpenClaw
   */
  async applyConfig(config: unknown, traceId: string): Promise<unknown> {
    const response = await fetch(`${this.profile.baseUrl}/config`, {
      method: 'PATCH',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId
      },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const error = `Failed to apply config: ${response.status} ${response.statusText}`
      await this.emitAudit('APPLY_CONFIG', { traceId, config }, null, error)
      throw new Error(error)
    }
    const result = await response.json()
    await this.emitAudit('APPLY_CONFIG', { traceId, config }, result)
    return result
  }

  /**
   * 通过 OpenClaw webhook 发送频道消息
   */
  async sendChannelMessage(payload: {
    channel: string
    to: string
    body: string
    subject?: string
    traceId?: string
  }): Promise<unknown> {
    const traceId = payload.traceId || uuidv4()
    const webhookPath = this.profile.eventPath || '/hooks/event'
    const requestBody = {
      event: 'send_external',
      channel: payload.channel,
      to: payload.to,
      subject: payload.subject || '',
      body: payload.body,
      traceId,
      timestamp: new Date().toISOString()
    }

    const response = await fetch(`${this.profile.baseUrl}${webhookPath}`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      const error = `Failed to send channel message: ${response.status} ${response.statusText}`
      await this.emitAudit('SEND_CHANNEL_MESSAGE', requestBody, null, error)
      throw new Error(error)
    }

    const result = await response.json()
    await this.emitAudit('SEND_CHANNEL_MESSAGE', requestBody, result)
    return result
  }

  /**
   * 调用 OpenAI 兼容的 Chat Completions 接口
   */
  async createChatCompletion(payload: {
    model: string
    messages: Array<{ role: string; content: string }>
    maxTokens?: number
    traceId?: string
  }): Promise<unknown> {
    const traceId = payload.traceId || uuidv4()
    const response = await fetch(`${this.profile.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId
      },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        ...(payload.maxTokens ? { max_tokens: payload.maxTokens } : {})
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      const error = `Failed to create chat completion: ${response.status} ${response.statusText}`
      await this.emitAudit('CREATE_CHAT_COMPLETION', { traceId, model: payload.model }, null, error)
      throw new Error(error)
    }

    const result = await response.json()
    await this.emitAudit('CREATE_CHAT_COMPLETION', { traceId, model: payload.model }, result)
    return result
  }

  /**
   * 获取配置快照（用于 Desired State 管理）
   * 返回脱敏后的配置快照
   */
  async getConfigSnapshot(traceId: string): Promise<{ config: unknown; hash: string }> {
    const config = await this.getConfig(traceId)
    // 脱敏：移除敏感字段
    const sanitized = this.sanitizeConfig(config)
    // 计算哈希
    const hash = this.hashConfig(sanitized)
    return { config: sanitized, hash }
  }

  /**
   * 通过变更单应用配置
   * 支持幂等性检查
   */
  async applyChangeRequest(changeRequest: {
    id: string
    diffJson: string
    traceId: string
  }): Promise<unknown> {
    // 解析 diff
    const diff = JSON.parse(changeRequest.diffJson)
    // 应用 diff 到配置
    const response = await this.applyConfig(diff, changeRequest.traceId)
    return response
  }

  /**
   * 脱敏配置：移除 token/password/apiKey 等敏感字段
   */
  private sanitizeConfig(config: unknown): unknown {
    if (typeof config !== 'object' || config === null) {
      return config
    }

    if (Array.isArray(config)) {
      return config.map(item => this.sanitizeConfig(item))
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      // 敏感字段列表
      const sensitiveKeys = ['token', 'password', 'apiKey', 'secret', 'key', 'credential']
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '***MASKED***'
      } else {
        sanitized[key] = this.sanitizeConfig(value)
      }
    }
    return sanitized
  }

  /**
   * 计算配置哈希（用于内容判重）
   * 修复：使用稳定的深层序列化（排序所有层级的 key），而非仅排序顶层
   */
  private hashConfig(config: unknown): string {
    const stable = this.toStableSorted(config)
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')
  }

  /**
   * 递归将对象/数组的所有层级的 key 排序，生成稳定序列化结构
   * 解决原 Object.keys(config).sort() 只排序顶层、嵌套对象哈希不稳定的问题
   */
  private toStableSorted(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
      return value
    }
    if (Array.isArray(value)) {
      return value.map(item => this.toStableSorted(item))
    }
    const obj = value as Record<string, unknown>
    const sortedKeys = Object.keys(obj).sort()
    const result: Record<string, unknown> = {}
    for (const key of sortedKeys) {
      result[key] = this.toStableSorted(obj[key])
    }
    return result
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * 内部：触发审计回调
   * 失败时静默处理，避免审计逻辑影响主流程
   */
  private async emitAudit(
    action: string,
    request: unknown,
    response: unknown,
    error?: string
  ): Promise<void> {
    if (!this.audit) return
    try {
      await this.audit({
        action,
        request,
        response: error ? { success: false, error } : response,
        error
      })
    } catch {
      // 审计回调失败静默处理，避免影响业务主流程
    }
  }
}
