import { useTranslation } from 'react-i18next'
import * as enumMaps from './i18n-enums'

/**
 * Hook: 翻译枚举值
 * @example
 * const translateTicketStatus = useEnumTranslation('ticketStatusMap');
 * const statusText = translateTicketStatus(ticket.status);
 */
export function useEnumTranslation<K extends keyof typeof enumMaps>(mapName: K) {
  const { t } = useTranslation()
  return (value: string) => {
    const map = enumMaps[mapName] as Record<string, string>
    const key = map[value]
    return key ? t(key) : value
  }
}

/**
 * 非 Hook 版本：翻译枚举值
 * @example
 * const statusText = translateEnum(t, 'ticketStatusMap', ticket.status);
 */
export function translateEnum(
  t: (key: string) => string,
  mapName: keyof typeof enumMaps,
  value: string
): string {
  const map = enumMaps[mapName] as Record<string, string>
  const key = map[value]
  return key ? t(key) : value
}

/**
 * Hook: 错误消息国际化
 * @example
 * const getErrorMessage = useErrorMessage();
 * const message = getErrorMessage(error);
 */
export function useErrorMessage() {
  const { t } = useTranslation('common')
  return (error: unknown): string => {
    if (error instanceof Error) {
      // 尝试匹配已知错误消息
      const message = error.message
      if (message.includes('网络错误') || message.includes('Network')) {
        return t('common.errors.networkError')
      }
      if (message.includes('未授权') || message.includes('Unauthorized')) {
        return t('common.errors.unauthorized')
      }
      if (message.includes('未找到') || message.includes('Not Found')) {
        return t('common.errors.notFound')
      }
      // 返回原始消息
      return message
    }
    return t('common.errors.unknown')
  }
}

/**
 * Hook: 确认对话框消息
 * @example
 * const getConfirmMessage = useConfirmMessage();
 * const confirmed = window.confirm(getConfirmMessage('delete'));
 */
export function useConfirmMessage() {
  const { t } = useTranslation('common')
  return (
    action: 'delete' | 'approve' | 'reject' | 'rollback' | 'reset'
  ): string => {
    return t(`common.confirm.${action}`)
  }
}
