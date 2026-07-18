import React, { createContext, useContext, useEffect, useState } from 'react'
import { readLocalStorage, writeLocalStorage } from '../lib/storage'

// 主题类型定义
type Theme = 'light' | 'dark' | 'system'

// 主题上下文接口
interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  effectiveTheme: 'light' | 'dark' // 实际应用的主题（system 会解析为 light 或 dark）
}

// 创建上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// 获取系统主题偏好
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// 从 localStorage 读取保存的主题
function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const saved = readLocalStorage('soloforge-theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
  } catch (e) {
    console.error('Failed to read theme from localStorage:', e)
  }
  return 'system'
}

// 保存主题到 localStorage
function saveTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  try {
    writeLocalStorage('soloforge-theme', theme)
  } catch (e) {
    console.error('Failed to save theme to localStorage:', e)
  }
}

// 应用主题到 DOM
function applyTheme(effectiveTheme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', effectiveTheme)
}

// ThemeProvider 组件
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getSavedTheme)
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    const saved = getSavedTheme()
    return saved === 'system' ? getSystemTheme() : saved
  })

  // 设置主题（保存到 localStorage 并更新状态）
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    saveTheme(newTheme)
  }

  // 监听主题变化，计算实际应用的主题
  useEffect(() => {
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme
    setEffectiveTheme(resolvedTheme)
    applyTheme(resolvedTheme)
  }, [theme])

  // 监听系统主题变化（仅当用户选择 system 时）
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light'
      setEffectiveTheme(newSystemTheme)
      applyTheme(newSystemTheme)
    }

    // 现代浏览器使用 addEventListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      // 兼容旧版浏览器
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// useTheme hook
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
