import { useTheme } from '../contexts/ThemeContext'


// 主题切换组件
export function ThemeToggle() {
  const { theme, setTheme, effectiveTheme } = useTheme()

  const handleToggle = () => {
    // 循环切换：light → dark → system → light
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  // 图标组件
  const SunIcon = () => (
    <svg
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )

  const MoonIcon = () => (
    <svg
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
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )

  const MonitorIcon = () => (
    <svg
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
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )

  // 根据当前主题显示对应图标
  const getIcon = () => {
    if (theme === 'system') {
      return <MonitorIcon />
    }
    return effectiveTheme === 'dark' ? <MoonIcon /> : <SunIcon />
  }

  // 主题标签
  const getLabel = () => {
    if (theme === 'system') {
      return `跟随系统 (${effectiveTheme === 'dark' ? '深色' : '浅色'})`
    }
    return theme === 'dark' ? '深色模式' : '浅色模式'
  }

  return (
    <button
      onClick={handleToggle}
      data-testid="theme-toggle"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.72)]
                 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)_/_0.88))] px-3.5 py-2 text-sm font-medium text-[hsl(var(--secondary-foreground))]
                 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] transition-colors duration-200 hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
      title={getLabel()}
      aria-label={getLabel()}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--accent)_/_0.72)] text-[hsl(var(--google-blue))]">
        {getIcon()}
      </span>
      <span className="hidden sm:inline">{getLabel()}</span>
    </button>
  )
}
