import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import i18n from 'i18next'
import { readLocalStorage, writeLocalStorage } from '../lib/storage'

// 语言类型定义
export type Language = 'zh-CN' | 'en-US'

// 语言上下文接口
export interface LanguageContextType {
  language: Language
  changeLanguage: (lang: Language) => void
}

const STORAGE_KEY = 'soloforge-language'

// 创建上下文
const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en-US'
}

function getSavedLanguage(): Language | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const saved = readLocalStorage(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch (e) {
    console.error('Failed to read language from localStorage:', e)
  }
  return undefined
}

function saveLanguage(lang: Language): void {
  if (typeof window === 'undefined') return
  try {
    writeLocalStorage(STORAGE_KEY, lang)
  } catch (e) {
    console.error('Failed to save language to localStorage:', e)
  }
}

function normalizeToSupportedLanguage(locale: string): Language {
  // zh / zh-CN / zh-Hans / zh-TW ... → zh-CN（当前仅支持 zh-CN/en-US）
  if (locale.toLowerCase().startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

// LanguageProvider 组件
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('zh-CN')

  // 初始化语言：localStorage → 系统语言（IPC）→ 回退 zh-CN
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const saved = getSavedLanguage()
      if (saved) {
        if (!cancelled) setLanguage(saved)
        await i18n.changeLanguage(saved)
        return
      }

      try {
        // 检查 electronAPI 是否可用
        if (typeof window !== 'undefined' && window.electronAPI?.i18n?.getSystemLocale) {
          const systemLocale = await window.electronAPI.i18n.getSystemLocale()
          const detected = normalizeToSupportedLanguage(systemLocale || '')
          if (!cancelled) setLanguage(detected)
          await i18n.changeLanguage(detected)
        } else {
          // electronAPI 不可用（可能在浏览器环境或 preload 未加载），回退到默认 zh-CN
          console.warn('electronAPI.i18n not available, falling back to zh-CN')
          if (!cancelled) setLanguage('zh-CN')
          await i18n.changeLanguage('zh-CN')
        }
      } catch (e) {
        // IPC 未就绪或调用失败时，回退到默认 zh-CN
        console.error('Failed to detect system locale via IPC:', e)
        if (!cancelled) setLanguage('zh-CN')
        await i18n.changeLanguage('zh-CN')
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [])

  const changeLanguage = (lang: Language) => {
    setLanguage(lang)
    saveLanguage(lang)
    void i18n.changeLanguage(lang)
  }

  const value = useMemo<LanguageContextType>(() => ({ language, changeLanguage }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// useLanguage hook
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
