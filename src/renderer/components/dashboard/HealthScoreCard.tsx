// ============================================
// Dashboard Health Score Component
// 仪表盘健康评分
// ============================================

interface HealthScore {
  score: number
  label: 'GOOD' | 'WARNING' | 'CRITICAL'
  summary: string
  factors: Array<{
    key: string
    label: string
    weight: number
    penalty: number
    description: string
  }>
}

interface HealthScoreCardProps {
  score: HealthScore
  getStatusLabel: (label: HealthScore['label']) => string
}

function getScoreClass(label: HealthScore['label']): string {
  switch (label) {
    case 'GOOD': return 'text-[hsl(var(--success))]'
    case 'WARNING': return 'text-[hsl(var(--google-yellow))]'
    case 'CRITICAL': return 'text-[hsl(var(--destructive))]'
  }
}

function getScoreGradient(label: HealthScore['label']): string {
  switch (label) {
    case 'GOOD': return 'from-green-500 to-emerald-600'
    case 'WARNING': return 'from-yellow-500 to-orange-500'
    case 'CRITICAL': return 'from-red-500 to-rose-600'
  }
}

export function HealthScoreCard({ score, getStatusLabel }: HealthScoreCardProps) {
  const gradientClass = getScoreGradient(score.label)
  const scoreClass = getScoreClass(score.label)

  return (
    <div className="rounded-lg border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card))] p-6 shadow-sm">
      <div className="flex items-center gap-4">
        {/* 分数圆环 */}
        <div className="relative h-20 w-20 flex-shrink-0">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
            {/* 背景圆环 */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-[hsl(var(--muted))]"
            />
            {/* 进度圆环 */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${score.score * 2.51} 251`}
              strokeLinecap="round"
              className={`${gradientClass} transition-all duration-1000`}
            />
          </svg>
          {/* 分数文字 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${scoreClass}`}>{score.score}</span>
          </div>
        </div>

        {/* 状态和摘要 */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-semibold ${scoreClass}`}>
              {getStatusLabel(score.label)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {score.summary}
          </p>
        </div>
      </div>

      {/* 因素列表 */}
      {score.factors.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {score.factors.map(factor => (
            <div
              key={factor.key}
              className="flex items-center justify-between rounded-md border border-[hsl(var(--border)_/_0.5)] bg-[hsl(var(--muted)_/_0.3)] px-3 py-2 text-xs"
            >
              <span className="text-[hsl(var(--foreground))]">{factor.label}</span>
              <span className="font-mono text-[hsl(var(--muted-foreground))]">
                -{factor.penalty} ({factor.weight * 100}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
