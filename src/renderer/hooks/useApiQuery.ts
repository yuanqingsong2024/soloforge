import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'

// ============================================
// useApiQuery - 统一数据获取 Hook
// 支持条件请求、定时刷新、错误重试、请求取消
// ============================================

export interface UseApiQueryOptions {
  /** 是否启用请求，默认为 true */
  enabled?: boolean
  /** 定时刷新间隔（毫秒），不设置则不刷新 */
  refetchInterval?: number
  /** 请求成功回调 */
  onSuccess?: (data: unknown) => void
  /** 请求失败回调 */
  onError?: (error: string) => void
  /** 初始数据，用于乐观更新 */
  initialData?: unknown
  /** 重试次数，默认为 0 */
  retryCount?: number
  /** 重试间隔（毫秒），默认为 1000 */
  retryInterval?: number
}

export interface UseApiQueryResult<T> {
  /** 请求返回的数据 */
  data: T | null
  /** 是否正在加载 */
  loading: boolean
  /** 是否正在重新请求（用于手动刷新） */
  refreshing: boolean
  /** 错误信息 */
  error: string | null
  /** 手动刷新函数 */
  refetch: () => Promise<void>
  /** 设置数据（用于乐观更新） */
  setData: (data: T | null) => void
}

export function useApiQuery<T = unknown>(
  endpoint: string,
  options: UseApiQueryOptions = {}
): UseApiQueryResult<T> {
  const {
    enabled = true,
    refetchInterval,
    onSuccess,
    onError,
    initialData,
    retryCount = 0,
    retryInterval = 1000,
  } = options

  const [data, setData] = useState<T | null>((initialData as T) ?? null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  // 带重试的请求函数
  const fetchWithRetry = useCallback(async (isManualRefetch = false) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const controller = abortControllerRef.current

    const doFetch = async (): Promise<void> => {
      try {
        if (isManualRefetch) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }
        setError(null)

        const result = await apiFetch<T>(endpoint, {
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          setData(result)
          retryCountRef.current = 0
          onSuccess?.(result)
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // 请求被取消，不处理错误
          return
        }

        const errorMessage = err instanceof Error ? err.message : '请求失败'

        // 检查是否需要重试
        if (retryCountRef.current < retryCount) {
          retryCountRef.current++
          await new Promise((resolve) => setTimeout(resolve, retryInterval))
          return doFetch()
        }

        setError(errorMessage)
        onError?.(errorMessage)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    await doFetch()
  }, [endpoint, onSuccess, onError, retryCount, retryInterval])

  // 手动刷新函数
  const refetch = useCallback(async () => {
    await fetchWithRetry(true)
  }, [fetchWithRetry])

  // 初始化和依赖变更时请求
  useEffect(() => {
    if (enabled) {
      void fetchWithRetry(false)
    }

    return () => {
      // 组件卸载时取消请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [enabled, endpoint]) // eslint-disable-line react-hooks/exhaustive-deps

  // 定时刷新
  useEffect(() => {
    if (refetchInterval && enabled) {
      const interval = setInterval(() => void fetchWithRetry(true), refetchInterval)
      return () => clearInterval(interval)
    }
  }, [refetchInterval, enabled, fetchWithRetry])

  return {
    data,
    loading,
    refreshing,
    error,
    refetch,
    setData,
  }
}

// ============================================
// useApiMutation - 数据提交 Hook
// 用于 POST/PUT/DELETE 等写操作
// ============================================

export interface UseApiMutationOptions {
  onSuccess?: (data: unknown) => void
  onError?: (error: string) => void
  onSettled?: () => void
}

export interface UseApiMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | null>
  loading: boolean
  error: string | null
  data: TData | null
  reset: () => void
}

export function useApiMutation<TData = unknown, TVariables = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options: UseApiMutationOptions = {}
): UseApiMutationResult<TData, TVariables> {
  const { onSuccess, onError, onSettled } = options

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TData | null>(null)

  const mutate = useCallback(async (variables: TVariables): Promise<TData | null> => {
    setLoading(true)
    setError(null)

    try {
      const result = await apiFetch<TData>(endpoint, {
        method,
        body: JSON.stringify(variables),
      })

      setData(result)
      onSuccess?.(result)
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作失败'
      setError(errorMessage)
      onError?.(errorMessage)
      return null
    } finally {
      setLoading(false)
      onSettled?.()
    }
  }, [endpoint, method, onSuccess, onError, onSettled])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { mutate, loading, error, data, reset }
}
