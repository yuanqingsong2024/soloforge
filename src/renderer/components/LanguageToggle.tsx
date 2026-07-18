import React from 'react'
import { useTranslation } from 'react-i18next'

import { useLanguage } from '../contexts/LanguageContext'

export const LanguageToggle: React.FC = () => {
  const { language, changeLanguage } = useLanguage()
  const { t } = useTranslation('common')

  const toggleLanguage = () => {
    const newLang = language === 'zh-CN' ? 'en-US' : 'zh-CN'
    changeLanguage(newLang)
  }

  const nextLanguageLabel = language === 'zh-CN' ? 'English' : '中文'

  return (
    <button
      onClick={toggleLanguage}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors duration-200 hover:bg-[hsl(var(--accent)_/_0.48)] hover:text-[hsl(var(--foreground))]"
      title={`${t('common:switchLanguage')}：${nextLanguageLabel}`}
      aria-label={`${t('common:switchLanguage')}：${nextLanguageLabel}`}
    >
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
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
      </svg>
    </button>
  )
}
