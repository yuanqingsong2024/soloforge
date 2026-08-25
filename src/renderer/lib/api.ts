/**
 * API 响应通用类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * API 客户端封装
 *
 * 职责：
 * 1. 统一获取 API 端口（支持 URL 参数、IPC、默认值）
 * 2. 自动携带本地 API Token 进行认证
 */

const DEV_API_PORT = 13789

/** Token 缓存（避免每次请求都调 IPC） */
let cachedToken: string | null = null

function getApiPortFromUrl(): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  const searchParams = new URLSearchParams(window.location.search)
  const apiPort = searchParams.get('apiPort')
  if (!apiPort) {
    return null
  }

  const parsed = Number(apiPort)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getApiPort(): Promise<number> {
  const apiPortFromUrl = getApiPortFromUrl()
  if (apiPortFromUrl !== null) {
    return apiPortFromUrl
  }

  if (typeof window !== 'undefined' && typeof window.electronAPI?.getApiPort === 'function') {
    return window.electronAPI.getApiPort()
  }

  return DEV_API_PORT
}

/**
 * 获取本地 API Token（通过 IPC 调用 main process）
 * 首次调用后缓存，避免重复 IPC
 * 确保 token 始终返回（即使 IPC 失败，也会尝试重试）
 */
export async function getLocalApiToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken
  }

  if (typeof window !== 'undefined' && typeof window.electronAPI?.getLocalApiToken === 'function') {
    try {
      cachedToken = await window.electronAPI.getLocalApiToken()
      return cachedToken
    } catch (error) {
      console.warn('[API] 获取本地 Token 失败:', error)
      // 清除缓存，下次重试
      cachedToken = null
      return null
    }
  }

  console.warn('[API] electronAPI.getLocalApiToken 不可用')
  return null
}

/**
 * 构建带认证头的 fetch 选项
 */
export async function buildAuthHeaders(): Promise<HeadersInit> {
  const token = await getLocalApiToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

/**
 * 带认证的 API 请求
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const port = await getApiPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`

  const headers = await buildAuthHeaders()
  const mergedHeaders = {
    ...headers,
    ...(options.headers || {})
  }

  const response = await fetch(url, {
    ...options,
    headers: mergedHeaders
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API Error ${response.status}: ${errorText}`)
  }

  return response.json()
}
