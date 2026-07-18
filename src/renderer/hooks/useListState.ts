import { useState, useCallback } from 'react'

export interface PaginationState {
  page: number
  limit: number
  total?: number
}

export interface UseListStateResult<T, F> {
  items: T[]
  setItems: React.Dispatch<React.SetStateAction<T[]>>
  filters: F
  setFilters: React.Dispatch<React.SetStateAction<F>>
  updateFilter: <K extends keyof F>(key: K, value: F[K]) => void
  clearFilters: () => void
  pagination: PaginationState
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>
  updatePagination: (updates: Partial<PaginationState>) => void
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
}

export function useListState<T = any, F = Record<string, any>>(
  initialFilters: F = {} as F,
  initialPagination: PaginationState = { page: 1, limit: 20 }
): UseListStateResult<T, F> {
  const [items, setItems] = useState<T[]>([])
  const [filters, setFilters] = useState<F>(initialFilters)
  const [pagination, setPagination] = useState<PaginationState>(initialPagination)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  const updatePagination = useCallback((updates: Partial<PaginationState>) => {
    setPagination((prev) => ({ ...prev, ...updates }))
  }, [])

  return {
    items,
    setItems,
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    pagination,
    setPagination,
    updatePagination,
    loading,
    setLoading,
    error,
    setError
  }
}
