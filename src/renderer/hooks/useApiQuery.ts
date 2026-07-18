import { useState, useEffect, useCallback } from 'react'
import { getApiPort } from '../lib/api'

export interface UseApiQueryOptions {
  enabled?: boolean
  refetchInterval?: number
  onSuccess?: (data: any) => void
  onError?: (error: string) => void
}

export interface UseApiQueryResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useApiQuery<T = any>(
  endpoint: string,
  options: UseApiQueryOptions = {}
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const port = await getApiPort()
      const response = await fetch(`http://localhost:${port}${endpoint}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      setData(result)
      options.onSuccess?.(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败'
      setError(errorMessage)
      options.onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [endpoint, options])

  useEffect(() => {
    if (options.enabled !== false) {
      refetch()
    }
  }, [endpoint, options.enabled, refetch])

  useEffect(() => {
    if (options.refetchInterval && options.enabled !== false) {
      const interval = setInterval(refetch, options.refetchInterval)
      return () => clearInterval(interval)
    }
  }, [options.refetchInterval, options.enabled, refetch])

  return { data, loading, error, refetch }
}
