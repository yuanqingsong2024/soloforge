import React, { useState } from 'react'

// ============================================
// SoloForge Design System - DataTable 组件 V2
// 增强版数据表格组件
// ============================================

export interface DataTableColumn<T> {
  key: string
  label: string
  render?: (item: T) => React.ReactNode
  width?: string
  minWidth?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
}

// 行操作按钮定义
export interface DataTableAction<T> {
  label: string
  onClick: (item: T) => void
  variant?: 'default' | 'danger' | 'primary'
  icon?: React.ReactNode
  disabled?: (item: T) => boolean
}

// DataTable 组件属性
export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (item: T) => string | number
  emptyMessage?: string
  onRowClick?: (item: T) => void
  className?: string
  // 固定列
  fixedColumns?: {
    right?: number
    left?: number
  }
  // 行操作
  actions?: DataTableAction<T>[]
  actionsLabel?: string
  // 排序
  sortable?: boolean
  defaultSortKey?: string
  defaultSortDirection?: 'asc' | 'desc'
  onSort?: (key: string, direction: 'asc' | 'desc') => void
  // 加载状态
  isLoading?: boolean
  loadingRows?: number
  // 多选
  selectable?: boolean
  selectedKeys?: Set<string | number>
  onSelectionChange?: (keys: Set<string | number>) => void
}

// 对齐样式
const getAlignClass = (align?: 'left' | 'center' | 'right') => {
  switch (align) {
    case 'center':
      return 'text-center'
    case 'right':
      return 'text-right'
    default:
      return 'text-left'
  }
}

// 操作按钮样式
const getActionVariantClass = (variant?: 'default' | 'danger' | 'primary') => {
  switch (variant) {
    case 'danger':
      return 'text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10'
    case 'primary':
      return 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10'
    default:
      return 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
  }
}

// 数据表格组件
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = '暂无数据',
  onRowClick,
  className = '',
  fixedColumns,
  actions,
  actionsLabel = '操作',
  sortable = false,
  defaultSortKey,
  defaultSortDirection = 'asc',
  onSort,
  isLoading = false,
  loadingRows = 5,
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection)

  // 排序逻辑
  const sortedData = React.useMemo(() => {
    if (!sortKey) return data

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]

      if (aVal === bVal) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const comparison = aVal < bVal ? -1 : 1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection])

  // 处理排序点击
  const handleSort = (key: string) => {
    if (!sortable) return

    const newDirection = sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortDirection(newDirection)
    onSort?.(key, newDirection)
  }

  // 处理行选择
  const handleSelect = (key: string | number, checked: boolean) => {
    if (!selectable || !onSelectionChange) return

    const newKeys = new Set(selectedKeys)
    if (checked) {
      newKeys.add(key)
    } else {
      newKeys.delete(key)
    }
    onSelectionChange(newKeys)
  }

  // 计算固定列
  const leftFixedCount = fixedColumns?.left ?? 0
  const rightFixedCount = fixedColumns?.right ?? 0
  const hasFixedColumns = leftFixedCount > 0 || rightFixedCount > 0
  const leftColumns = columns.slice(0, leftFixedCount)
  const rightColumns = columns.slice(-rightFixedCount)
  const centerColumns = columns.slice(leftFixedCount, columns.length - rightFixedCount || undefined)

  // 加载骨架屏
  if (isLoading) {
    return (
      <div className={`overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm ${className}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.7]">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] ${getAlignClass(col.align)}`} style={{ width: col.width }}>
                  {col.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{actionsLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="border-b border-[hsl(var(--border))] last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5">
                    <div className="h-4 w-20 animate-pulse rounded bg-[hsl(var(--muted))]" />
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <div className="h-6 w-12 animate-pulse rounded bg-[hsl(var(--muted))]" />
                      <div className="h-6 w-12 animate-pulse rounded bg-[hsl(var(--muted))]" />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm ${className}`}>
      <table className="w-full border-collapse">
        {/* 表头 */}
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.7]">
            {selectable && (
              <th className="w-10 px-4 py-3.5">
                <span className="sr-only">选择</span>
              </th>
            )}
            {hasFixedColumns && leftFixedCount > 0 && leftColumns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] ${getAlignClass(column.align)} ${sortable || column.sortable ? 'cursor-pointer select-none hover:bg-[hsl(var(--accent))/0.5]' : ''} ${leftFixedCount > 1 ? '' : 'sticky left-0 z-10 bg-[hsl(var(--muted))/0.9]'}`}
                style={{ width: column.width, minWidth: column.minWidth }}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-1">
                  {column.label}
                  {sortable && sortKey === column.key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
            ))}
            {centerColumns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] ${getAlignClass(column.align)} ${sortable || column.sortable ? 'cursor-pointer select-none hover:bg-[hsl(var(--accent))/0.5]' : ''}`}
                style={{ width: column.width, minWidth: column.minWidth }}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-1">
                  {column.label}
                  {sortable && sortKey === column.key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
            ))}
            {hasFixedColumns && rightFixedCount > 0 && rightColumns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] ${getAlignClass(column.align)} ${rightFixedCount > 1 ? '' : 'sticky right-0 z-10 bg-[hsl(var(--muted))/0.9]'}`}
                style={{ width: column.width, minWidth: column.minWidth }}
              >
                {column.label}
              </th>
            ))}
            {actions && (
              <th className="sticky right-0 z-10 w-24 bg-[hsl(var(--muted))/0.9] px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {actionsLabel}
              </th>
            )}
          </tr>
        </thead>

        {/* 表体 */}
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((item) => {
              const key = keyExtractor(item)
              const isSelected = selectedKeys?.has(key)

              return (
                <tr
                  key={String(key)}
                  className={`border-b border-[hsl(var(--border))] last:border-b-0 transition-colors duration-200 ${isSelected ? 'bg-[hsl(var(--primary))]/5' : ''} ${onRowClick ? 'cursor-pointer hover:bg-[hsl(var(--accent))/0.5]' : 'hover:bg-[hsl(var(--accent))/0.3]'}`}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-3.5">
                      <input type="checkbox" checked={isSelected} onChange={(e) => handleSelect(key, e.target.checked)} className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]" />
                    </td>
                  )}
                  {hasFixedColumns && leftFixedCount > 0 && leftColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 text-sm text-[hsl(var(--foreground))] ${getAlignClass(column.align)} ${leftFixedCount > 1 ? '' : 'sticky left-0 bg-[hsl(var(--card))]'}`}
                      onClick={() => onRowClick?.(item)}
                    >
                      {column.render ? column.render(item) : String((item as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                  {centerColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 text-sm text-[hsl(var(--foreground))] ${getAlignClass(column.align)}`}
                      onClick={() => onRowClick?.(item)}
                    >
                      {column.render ? column.render(item) : String((item as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                  {hasFixedColumns && rightFixedCount > 0 && rightColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 text-sm text-[hsl(var(--foreground))] ${getAlignClass(column.align)} ${rightFixedCount > 1 ? '' : 'sticky right-0 bg-[hsl(var(--card))]'}`}
                      onClick={() => onRowClick?.(item)}
                    >
                      {column.render ? column.render(item) : String((item as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                  {actions && (
                    <td className="sticky right-0 bg-[hsl(var(--card))] px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {actions.map((action, idx) => {
                          const isDisabled = action.disabled?.(item)
                          return (
                            <button
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation()
                                action.onClick(item)
                              }}
                              disabled={isDisabled}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150 ${getActionVariantClass(action.variant)} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                              {action.icon && <span className="mr-1">{action.icon}</span>}
                              {action.label}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
