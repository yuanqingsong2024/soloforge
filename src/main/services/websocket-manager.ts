/**
 * WebSocket 连接管理器
 * 
 * 职责：
 * 1. 管理 WebSocket 连接生命周期
 * 2. 自动重连与指数退避
 * 3. 心跳保活
 * 4. 消息队列与离线缓存
 * 5. 连接状态订阅
 * 
 * 注意：此模块需要浏览器 WebSocket API 支持，请在渲染进程中使用
 */

// ============================================
// 类型定义
// ============================================

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'

export interface WebSocketConfig {
  url: string
  protocols?: string[]
  reconnect?: boolean
  reconnectInterval?: number // 初始重连间隔（毫秒）
  maxReconnectInterval?: number // 最大重连间隔
  reconnectDecay?: number // 重连延迟衰减系数
  maxReconnectAttempts?: number
  heartbeatInterval?: number // 心跳间隔（毫秒）
  heartbeatTimeout?: number // 心跳超时（毫秒）
  messageQueueSize?: number // 离线消息队列大小
}

export interface WebSocketMessage {
  id: string
  type: string
  payload: unknown
  timestamp: number
}

export interface ConnectionListener {
  onStateChange?: (state: ConnectionState) => void
  onMessage?: (message: WebSocketMessage) => void
  onError?: (error: Error) => void
  onReconnectAttempt?: (info: { attempt: number; delay: number }) => void
}

// ============================================
// 连接管理器配置默认值
// ============================================

export const DEFAULT_WEBSOCKET_CONFIG: Required<WebSocketConfig> = {
  url: '',
  protocols: [],
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  reconnectDecay: 1.5,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  heartbeatTimeout: 5000,
  messageQueueSize: 100
}

// ============================================
// 日志辅助（渲染进程使用 console）
// ============================================

function log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const prefix = '[WebSocket]'
  switch (level) {
    case 'info':
      console.info(prefix, ...args)
      break
    case 'warn':
      console.warn(prefix, ...args)
      break
    case 'error':
      console.error(prefix, ...args)
      break
  }
}

// ============================================
// WebSocket 管理器
// ============================================

export class WebSocketManager {
  private ws: WebSocket | null = null
  private config: Required<WebSocketConfig>
  private state: ConnectionState = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private messageQueue: WebSocketMessage[] = []
  private listeners: Set<ConnectionListener> = new Set()
  private pendingMessages = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private messageIdCounter = 0
  
  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      protocols: config.protocols ?? [],
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      reconnectDecay: config.reconnectDecay ?? 1.5,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 5000,
      messageQueueSize: config.messageQueueSize ?? 100
    }
  }

  private generateId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`
  }

  // ============================================
  // 连接管理
  // ============================================

  /**
   * 连接到 WebSocket 服务器
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'connected' || this.state === 'connecting') {
        resolve()
        return
      }

      this.setState('connecting')
      log('info', `连接中: ${this.config.url}`)

      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols)
        
        this.ws.onopen = () => {
          log('info', '连接已建立')
          this.setState('connected')
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.flushMessageQueue()
          resolve()
        }

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event)
        }

        this.ws.onerror = () => {
          log('error', '连接错误')
          this.notifyListeners('onError', new Error('WebSocket 连接错误'))
        }

        this.ws.onclose = (event: CloseEvent) => {
          log('info', `连接关闭: code=${event.code}, reason=${event.reason || 'none'}`)
          this.stopHeartbeat()
          
          if (this.state !== 'disconnected') {
            if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
              this.scheduleReconnect()
            } else {
              this.setState('disconnected')
            }
          }
        }
      } catch (error) {
        this.setState('failed')
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.setState('disconnected')
    this.stopHeartbeat()
    this.clearReconnectTimeout()
    
    if (this.ws) {
      this.ws.close(1000, '客户端主动断开')
      this.ws = null
    }
    
    this.messageQueue = []
    this.pendingMessages.clear()
  }

  /**
   * 发送消息
   */
  async send(type: string, payload: unknown): Promise<unknown> {
    const id = this.generateId()
    const message: WebSocketMessage = {
      id,
      type,
      payload,
      timestamp: Date.now()
    }

    if (this.state !== 'connected' || !this.ws) {
      this.enqueueMessage(message)
      throw new Error('WebSocket 未连接，消息已加入队列')
    }

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, { resolve, reject })
      
      try {
        this.ws!.send(JSON.stringify(message))
        
        setTimeout(() => {
          if (this.pendingMessages.has(id)) {
            this.pendingMessages.delete(id)
            reject(new Error('消息发送超时'))
          }
        }, 10000)
      } catch (error) {
        this.pendingMessages.delete(id)
        reject(error)
      }
    })
  }

  /**
   * 发送消息（不等待响应）
   */
  sendAsync(type: string, payload: unknown): void {
    const message: WebSocketMessage = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now()
    }

    if (this.state !== 'connected' || !this.ws) {
      this.enqueueMessage(message)
      return
    }

    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      log('error', '发送消息失败:', error)
      this.enqueueMessage(message)
    }
  }

  // ============================================
  // 状态管理
  // ============================================

  getState(): ConnectionState {
    return this.state
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  addListener(listener: ConnectionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.notifyListeners('onStateChange', state)
    }
  }

  private notifyListeners<K extends keyof ConnectionListener>(
    method: K,
    arg: Parameters<NonNullable<ConnectionListener[K]>>[0]
  ): void {
    for (const listener of this.listeners) {
      const fn = listener[method]
      if (fn) {
        try {
          (fn as (arg: unknown) => void)(arg)
        } catch (error) {
          log('error', '监听器错误:', error)
        }
      }
    }
  }

  // ============================================
  // 重连逻辑
  // ============================================

  private scheduleReconnect(): void {
    this.clearReconnectTimeout()
    
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(this.config.reconnectDecay, this.reconnectAttempts),
      this.config.maxReconnectInterval
    )
    
    this.reconnectAttempts++
    this.setState('reconnecting')
    
    log('info', `${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连`)
    this.notifyListeners('onReconnectAttempt', { attempt: this.reconnectAttempts, delay })
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        log('error', '重连失败:', error)
      })
    }, delay)
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  // ============================================
  // 心跳机制
  // ============================================

  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected' && this.ws) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', id: this.generateId(), timestamp: Date.now() }))
          
          this.heartbeatTimeoutTimer = setTimeout(() => {
            log('warn', '心跳超时，尝试重连')
            this.ws?.close()
          }, this.config.heartbeatTimeout)
        } catch (error) {
          log('error', '发送心跳失败:', error)
        }
      }
    }, this.config.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer)
      this.heartbeatTimeoutTimer = null
    }
  }

  // ============================================
  // 消息处理
  // ============================================

  private handleMessage(event: MessageEvent): void {
    try {
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer)
        this.heartbeatTimeoutTimer = null
      }

      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      
      if (data.type === 'pong') {
        return
      }

      if (data.id && this.pendingMessages.has(data.id)) {
        const pending = this.pendingMessages.get(data.id)!
        this.pendingMessages.delete(data.id)
        
        if (data.error) {
          pending.reject(new Error(data.error))
        } else {
          pending.resolve(data.payload)
        }
        return
      }

      const message: WebSocketMessage = {
        id: data.id || this.generateId(),
        type: data.type,
        payload: data.payload,
        timestamp: data.timestamp || Date.now()
      }
      
      this.notifyListeners('onMessage', message)
    } catch (error) {
      log('error', '解析消息失败:', error)
    }
  }

  // ============================================
  // 消息队列
  // ============================================

  private enqueueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      this.messageQueue.shift()
    }
    this.messageQueue.push(message)
    log('info', `消息入队，当前队列长度: ${this.messageQueue.length}`)
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return
    
    log('info', `刷新消息队列，共 ${this.messageQueue.length} 条消息`)
    
    while (this.messageQueue.length > 0 && this.state === 'connected') {
      const message = this.messageQueue.shift()
      if (message && this.ws) {
        try {
          this.ws.send(JSON.stringify(message))
        } catch (error) {
          log('error', '发送队列消息失败:', error)
          this.messageQueue.unshift(message)
          break
        }
      }
    }
  }

  getQueuedMessageCount(): number {
    return this.messageQueue.length
  }
}

// ============================================
// 便捷工厂函数
// ============================================

let globalManager: WebSocketManager | null = null

export function getGlobalWebSocketManager(): WebSocketManager | null {
  return globalManager
}

export function createGlobalWebSocketManager(config: WebSocketConfig): WebSocketManager {
  if (globalManager) {
    globalManager.disconnect()
  }
  globalManager = new WebSocketManager(config)
  return globalManager
}

export function destroyGlobalWebSocketManager(): void {
  if (globalManager) {
    globalManager.disconnect()
    globalManager = null
  }
}
