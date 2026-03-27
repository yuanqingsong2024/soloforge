import React from 'react'

// 表格列定义
export interface DataTableColumn<T> {
  key: string
  label: string
  render?: (item: T) => React.ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}

// DataTable 组件属性
interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (item: T) => string | number
  emptyMessage?: string
  onRowClick?: (item: T) => void
  className?: string
}

// 数据表格组件
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = '暂无数据',
  onRowClick,
  className = '',
}: DataTableProps<T>) {
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

  return (
    <div className={`overflow-x-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm ${className}`}>
      <table className="w-full border-collapse">
        {/* 表头 */}
        <thead>
          <tr className="border-b border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.7)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] ${getAlignClass(column.align)}`}
                style={{ width: column.width }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* 表体 */}
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`
                  border-b border-[hsl(var(--border)_/_0.72)] last:border-b-0
                  transition-colors duration-200
                  ${onRowClick ? 'cursor-pointer hover:bg-[hsl(var(--accent)_/_0.72)]' : ''}
                `}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3.5 text-sm text-[hsl(var(--foreground))] ${getAlignClass(column.align)}`}
                  >
                    {column.render
                      ? column.render(item)
                      : (item as any)[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
