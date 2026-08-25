/**
 * i18n 格式化工具
 * 统一处理日期、数字的本地化格式化
 */

import i18n from 'i18next'

/**
 * 获取当前语言的区域设置
 * @returns 语言代码，如 'zh-CN' 或 'en-US'
 */
export function getCurrentLocale(): string {
  return i18n.language || 'zh-CN'
}

/**
 * 格式化日期时间
 * @param date Date 对象或 ISO 字符串或时间戳
 * @param options Intl.DateTimeFormatOptions
 * @returns 格式化后的日期字符串
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options
  }
  
  return d.toLocaleString(getCurrentLocale(), defaultOptions)
}

/**
 * 格式化日期（不含时间）
 * @param date Date 对象或 ISO 字符串或时间戳
 * @param options Intl.DateTimeFormatOptions
 * @returns 格式化后的日期字符串
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(date, { year: 'numeric', month: '2-digit', day: '2-digit', ...options })
}

/**
 * 格式化时间（仅时间）
 * @param date Date 对象或 ISO 字符串或时间戳
 * @param options Intl.DateTimeFormatOptions
 * @returns 格式化后的时间字符串
 */
export function formatTime(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(date, { hour: '2-digit', minute: '2-digit', second: '2-digit', ...options })
}

/**
 * 格式化相对时间（如 "3 分钟前"）
 * @param date Date 对象或 ISO 字符串或时间戳
 * @returns 相对时间字符串
 */
export function formatRelativeTime(
  date: Date | string | number | null | undefined
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const absDiff = Math.abs(diff)
  
  const locale = getCurrentLocale()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  
  const seconds = Math.floor(absDiff / 1000)
  const minutes = Math.floor(absDiff / (1000 * 60))
  const hours = Math.floor(absDiff / (1000 * 60 * 60))
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24))
  
  if (seconds < 60) {
    return rtf.format(-seconds, 'second')
  } else if (minutes < 60) {
    return rtf.format(-minutes, 'minute')
  } else if (hours < 24) {
    return rtf.format(-hours, 'hour')
  } else if (days < 30) {
    return rtf.format(-days, 'day')
  } else {
    return formatDate(d)
  }
}

/**
 * 格式化数字
 * @param value 数字
 * @param options Intl.NumberFormatOptions
 * @returns 格式化后的数字字符串
 */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return '-'
  
  return value.toLocaleString(getCurrentLocale(), options)
}

/**
 * 格式化百分比
 * @param value 0-1 之间的小数
 * @param options Intl.NumberFormatOptions
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return '-'
  
  return (value * 100).toLocaleString(getCurrentLocale(), { 
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    ...options 
  })
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let size = bytes
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${formatNumber(size, { maximumFractionDigits: 2 })} ${units[unitIndex]}`
}
