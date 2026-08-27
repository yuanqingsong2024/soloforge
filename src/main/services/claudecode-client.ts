/**
 * Claude Code Client 封装
 *
 * 提供与 Claude Code/Claude API 的交互接口
 */

export interface ConfigSnapshot {
  id?: string
  version?: string
  config?: Record<string, unknown>
  contentHash?: string
  hash?: string
  updatedAt?: string
}

export interface ApplyConfigOptions {
  config: Record<string, unknown>
  traceId: string
}

export interface ChangeRequest {
  id: string
  title: string
  description: string
  diff: Record<string, unknown>
}

export interface ApplyChangeRequestOptions {
  id?: string
  diffJson?: string
  changeRequest?: ChangeRequest
  traceId: string
}

/**
 * Claude Code Client
 *
 * 与 Claude Code/Claude API 交互的客户端封装
 */
export class ClaudeCodeClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(path: string, init: RequestInit, traceId: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      throw new Error(`Claude Code 请求失败: ${response.status} ${response.statusText}`)
    }
    return await response.json() as T
  }

  /**
   * 获取配置快照
   */
  async getConfigSnapshot(traceId: string): Promise<ConfigSnapshot> {
    const response = await this.request<{ config?: Record<string, unknown>; hash?: string; contentHash?: string; updatedAt?: string }>(
      '/config',
      { method: 'GET' },
      traceId
    )
    if (!response.config) {
      throw new Error('Claude Code 返回的配置快照为空')
    }
    return {
      config: response.config,
      hash: response.hash || response.contentHash || '',
      contentHash: response.contentHash || response.hash || '',
      updatedAt: response.updatedAt || new Date().toISOString()
    }
  }

  /**
   * 应用配置变更
   */
  async applyConfig(config: Record<string, unknown>, traceId: string): Promise<boolean> {
    await this.request<unknown>('/config', {
      method: 'PATCH',
      body: JSON.stringify(config)
    }, traceId)
    const snapshot = await this.getConfigSnapshot(traceId)
    return Object.keys(snapshot.config || {}).length > 0
  }

  /**
   * 应用变更请求
   */
  async applyChangeRequest(options: ApplyChangeRequestOptions): Promise<boolean> {
    if (!options.diffJson && !options.changeRequest) {
      throw new Error('变更请求缺少 diff 内容')
    }
    const diff = options.diffJson ? JSON.parse(options.diffJson) : options.changeRequest?.diff
    if (!diff || typeof diff !== 'object') {
      throw new Error('变更请求 diff 格式无效')
    }
    return await this.applyConfig(diff as Record<string, unknown>, options.traceId)
  }

  /**
   * 健康检查
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * 获取基础 URL
   */
  getBaseUrl(): string {
    return this.baseUrl
  }
}
