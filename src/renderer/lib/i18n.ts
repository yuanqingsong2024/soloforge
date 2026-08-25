import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readLocalStorage } from './storage'

const localeModules = import.meta.glob(
  '../../../resources/locales/**/*.json',
  { eager: true }
) as Record<string, Record<string, Record<string, string>>>

function buildResources() {
  const resources: Record<string, Record<string, object>> = {}
  for (const [filePath, mod] of Object.entries(localeModules)) {
    const parts = filePath.split('/')
    const lang = parts[parts.length - 2]
    const ns = parts[parts.length - 1].replace('.json', '')
    if (!resources[lang]) resources[lang] = {}
    resources[lang][ns] = (mod as { default?: object }).default ?? mod as object
  }
  return resources
}

// 获取保存的语言设置，默认为 zh-CN
function getInitialLanguage(): string {
  try {
    const saved = readLocalStorage('soloforge-language')
    if (saved === 'zh-CN' || saved === 'en-US') {
      return saved
    }
  } catch {
    // ignore
  }
  return 'zh-CN'
}

i18n
  .use(initReactI18next)
  .init({
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    resources: buildResources(),
    ns: [
      'common',
      'navigation',
      'dashboard',
      'tickets',
      'team',
      'approval',
      'audit',
      'config',
      'deployment',
      'operations',
      'help'
    ],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  })

export { i18n }
export default i18n
