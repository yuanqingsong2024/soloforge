import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

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

i18n
  .use(initReactI18next)
  .init({
    lng: 'zh-CN',
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
