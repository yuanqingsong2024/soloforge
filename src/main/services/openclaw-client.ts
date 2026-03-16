import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'

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

export class OpenClawClient {
  private profile: ConnectionProfile
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(profile: ConnectionProfile) {
    this.profile = profile
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
        this.ws = new WebSocket(this.profile.wsUrl, {
          headers: this.getHeaders()
        })

        this.ws.on('open', () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          resolve()
        })

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        })

        this.ws.on('close', () => {
          console.log('WebSocket closed')
          this.handleReconnect()
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
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(data: any, traceId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const message = {
      ...data,
      traceId: traceId || uuidv4(),
      timestamp: new Date().toISOString()
    }

    this.ws.send(JSON.stringify(message))
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.profile.authMode === 'token' && this.profile.token) {
      headers['Authorization'] = `Bearer ${this.profile.token}`
    } else if (this.profile.authMode === 'password' && this.profile.password) {
      headers['X-Password'] = this.profile.password
    }

    if (this.profile.edgeToken) {
      headers['X-Edge-Token'] = this.profile.edgeToken
    }

    return headers
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      console.log('Received message:', message)
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  /**
   * 获取远端 OpenClaw 配置
   */
  async getConfig(traceId?: string): Promise<unknown> {
    const response = await fetch(`${this.profile.baseUrl}/config`, {
      method: 'GET',
      headers: {
        ...this.getHeaders(),
        ...(traceId ? { 'X-Trace-ID': traceId } : {})
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`)
    }
    return await response.json()
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
      throw new Error(`Failed to apply config: ${response.status} ${response.statusText}`)
    }
    return await response.json()
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
      throw new Error(`Failed to send channel message: ${response.status} ${response.statusText}`)
    }

    return await response.json()
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
  private sanitizeConfig(config: any): any {
    if (typeof config !== 'object' || config === null) {
      return config
    }

    if (Array.isArray(config)) {
      return config.map(item => this.sanitizeConfig(item))
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(config)) {
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
   */
  private hashConfig(config: any): string {
    const crypto = require('crypto')
    const content = JSON.stringify(config, Object.keys(config).sort())
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
