// ============================================
// Dashboard Overview Cards Component
// 仪表盘概览卡片
// ============================================

import { Link } from 'react-router-dom'
import { SectionCard } from '../ui/SectionCard'

interface OverviewCard {
  key: string
  title: string
  value: string
  subtitle: string
  route: string
}

interface OverviewCardsProps {
  cards: OverviewCard[]
}

export function OverviewCards({ cards }: OverviewCardsProps) {
  return (
    <SectionCard title="全局概览" description="系统整体状态一览">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {cards.map(card => (
          <Link
            key={card.key}
            to={card.route}
            className="group rounded-lg border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card))] p-4 transition-all hover:border-[hsl(var(--primary)_/_0.5)] hover:shadow-md"
          >
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]">
              {card.title}
            </div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">
              {card.value}
            </div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">
              {card.subtitle}
            </div>
          </Link>
        ))}
      </div>
    </SectionCard>
  )
}
