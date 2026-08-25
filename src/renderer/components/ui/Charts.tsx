// ============================================
// SoloForge Design System - Mini Charts
// 轻量级图表组件（纯 SVG，无需外部依赖）
// ============================================

// ============================================
// Sparkline - 迷你趋势线
// ============================================

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  showArea?: boolean
  className?: string
}

export function Sparkline({
  data,
  width = 100,
  height = 32,
  color = 'hsl(var(--primary))',
  showArea = true,
  className = '',
}: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const pathD = `M ${points.join(' L ')}`
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`

  return (
    <svg width={width} height={height} className={className}>
      {showArea && (
        <defs>
          <linearGradient id={`sparkline-gradient-${color.replace(/[^a-z]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showArea && (
        <path
          d={areaD}
          fill={`url(#sparkline-gradient-${color.replace(/[^a-z]/g, '')})`}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ============================================
// Mini Bar Chart - 迷你柱状图
// ============================================

interface MiniBarChartProps {
  data: { label: string; value: number }[]
  width?: number
  height?: number
  barColor?: string
  className?: string
}

export function MiniBarChart({
  data,
  width = 200,
  height = 60,
  barColor = 'hsl(var(--primary))',
  className = '',
}: MiniBarChartProps) {
  if (data.length === 0) return null

  const max = Math.max(...data.map(d => d.value))
  const barWidth = Math.min(20, (width - (data.length - 1) * 4) / data.length)
  const gap = (width - data.length * barWidth) / (data.length + 1)

  return (
    <svg width={width} height={height} className={className}>
      {data.map((item, index) => {
        const barHeight = (item.value / max) * (height - 8)
        const x = gap + index * (barWidth + gap)
        const y = height - barHeight - 4

        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={barColor}
              rx="2"
              className="transition-all duration-300"
            />
          </g>
        )
      })}
    </svg>
  )
}

// ============================================
// Donut Chart - 环形图表
// ============================================

interface DonutChartItem {
  label: string
  value: number
  color?: string
}

interface DonutChartProps {
  data: DonutChartItem[]
  size?: number
  strokeWidth?: number
  showLegend?: boolean
  className?: string
}

const defaultColors = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--google-blue))',
  'hsl(var(--google-green))',
]

export function DonutChart({
  data,
  size = 160,
  strokeWidth = 20,
  showLegend = true,
  className = '',
}: DonutChartProps) {
  if (data.length === 0) return null

  const total = data.reduce((sum, item) => sum + item.value, 0)
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const center = size / 2

  // 计算每个扇形的偏移
  let currentOffset = 0
  const segments = data.map((item, index) => {
    const percentage = item.value / total
    const dashLength = circumference * percentage
    const dashOffset = circumference - currentOffset
    currentOffset += dashLength

    return {
      ...item,
      percentage,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset,
      color: item.color || defaultColors[index % defaultColors.length],
    }
  })

  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <div className="relative shrink-0">
        <svg width={size} height={size} className="-rotate-90">
          {segments.map((segment, index) => (
            <circle
              key={index}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              className="transition-all duration-700 ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-[hsl(var(--foreground))]">
            {total}
          </span>
        </div>
      </div>

      {showLegend && (
        <div className="flex flex-col gap-2">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {segment.label}
              </span>
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                {segment.value}
              </span>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                ({Math.round(segment.percentage * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Activity Heatmap - 活动热力图
// ============================================

interface ActivityHeatmapProps {
  data: { date: string; value: number }[]
  weeks?: number
  className?: string
}

export function ActivityHeatmap({
  data,
  weeks = 12,
  className = '',
}: ActivityHeatmapProps) {
  const cellSize = 12

  // 生成日期网格
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - weeks * 7)

  const dataMap = new Map(data.map(d => [d.date, d.value]))

  // 获取颜色强度
  const getColor = (value: number) => {
    if (value === 0) return 'hsl(var(--muted))'
    if (value < 3) return 'hsl(var(--primary) / 0.3)'
    if (value < 6) return 'hsl(var(--primary) / 0.5)'
    if (value < 10) return 'hsl(var(--primary) / 0.7)'
    return 'hsl(var(--primary))'
  }

  interface DayItem {
    date: string
    value: number
    dayOfWeek: number
    weekIndex: number
  }
  
  const days: DayItem[] = []
  const current = new Date(startDate)
  for (let i = 0; i < weeks * 7; i++) {
    const dateStr = current.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      value: dataMap.get(dateStr) || 0,
      dayOfWeek: current.getDay(),
      weekIndex: Math.floor(i / 7),
    })
    current.setDate(current.getDate() + 1)
  }

  return (
    <div className={className}>
      <div className="flex gap-1">
        {/* 星期标签 */}
        <div className="flex flex-col gap-[3px] pt-5">
          {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
            <span key={i} className="text-[8px] text-[hsl(var(--muted-foreground))]">
              {i % 2 === 0 ? day : ''}
            </span>
          ))}
        </div>

        {/* 热力网格 */}
        <div className="flex gap-[3px]">
          {Array.from({ length: weeks }).map((_, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {days
                .filter(d => d.weekIndex === weekIndex)
                .map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className="rounded-sm transition-colors hover:ring-2 hover:ring-[hsl(var(--primary))]/50"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: getColor(day.value),
                    }}
                    title={`${day.date}: ${day.value} 次活动`}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Trend Indicator - 趋势指示器
// ============================================

interface TrendIndicatorProps {
  value: number
  compareValue?: number
  format?: 'number' | 'percent' | 'currency'
  showIcon?: boolean
  className?: string
}

export function TrendIndicator({
  value,
  // compareValue, // TODO: 用于计算变化率
  format = 'number',
  showIcon = true,
  className = '',
}: TrendIndicatorProps) {
  const isPositive = value > 0
  const isNeutral = value === 0

  const formatValue = (v: number) => {
    switch (format) {
      case 'percent':
        return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
      case 'currency':
        return `${v >= 0 ? '+' : ''}¥${v.toFixed(2)}`
      default:
        return `${v >= 0 ? '+' : ''}${v}`
    }
  }

  const TrendIcon = () => {
    if (isNeutral) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--muted-foreground))]">
          <path d="M5 12h14" />
        </svg>
      )
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}>
        {isPositive ? (
          <path d="m18 15-6-6-6 6" />
        ) : (
          <path d="m6 9 6 6 6-6" />
        )}
      </svg>
    )
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {showIcon && <TrendIcon />}
      <span className={`text-sm font-medium ${isNeutral ? 'text-[hsl(var(--muted-foreground))]' : isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}`}>
        {formatValue(value)}
      </span>
    </div>
  )
}
