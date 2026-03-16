import React, { useState, useEffect } from 'react'
import { ThemeToggle } from '../ThemeToggle'

// 连接状态类型
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

// Topbar 组件
export function Topbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [currentProfile, setCurrentProfile] = useState<string>('未连接')

  // 获取 API 端口
  const getApiPort = (): number => {
    if (import.meta.env?.DEV) {
      return 13789
    }
    return (window as any).electronAPI?.getApiPort?.() || 13789
  }

  // 检查连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const port = getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/connection-profiles`)
        if (response.ok) {
          const profiles = await response.json()
          const activeProfile = profiles.find((p: any) => p.isActive)
          if (activeProfile) {
            setCurrentProfile(activeProfile.name)
            setConnectionStatus('connected')
          } else {
            setCurrentProfile('未连接')
            setConnectionStatus('disconnected')
          }
        }
      } catch (error) {
        setConnectionStatus('disconnected')
        setCurrentProfile('未连接')
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 10000) // 每 10 秒检查一次
    return () => clearInterval(interval)
  }, [])

  // 搜索处理
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      console.log('搜索:', searchQuery)
      // TODO: 实现全局搜索功能
    }
  }

  // 连接状态指示器
  const ConnectionIndicator = () => {
    const statusConfig = {
      connected: {
        color: 'bg-[hsl(var(--success))]',
        label: '已连接',
      },
      connecting: {
        color: 'bg-[hsl(var(--warning))]',
        label: '连接中',
      },
      disconnected: {
        color: 'bg-[hsl(var(--destructive))]',
        label: '未连接',
      },
    }

    const config = statusConfig[connectionStatus]

    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-workshop-md bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        <span className="text-sm text-[hsl(var(--foreground))]">{currentProfile}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">({config.label})</span>
      </div>
    )
  }

  return (
    <header data-testid="app-topbar" className="h-16 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between px-6">
      {/* 左侧：全局搜索 */}
      <div className="flex-1 max-w-md">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="搜索工单、审批、审计日志..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-workshop-md
                       bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
                       border border-[hsl(var(--border))]
                       placeholder:text-[hsl(var(--muted-foreground))]
                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]
                       transition-shadow duration-200"
            />
          </div>
        </form>
      </div>

      {/* 右侧：连接状态 + 主题切换 */}
      <div data-testid="topbar-actions" className="flex items-center gap-4">
        <ConnectionIndicator />
        <ThemeToggle />
      </div>
    </header>
  )
}
