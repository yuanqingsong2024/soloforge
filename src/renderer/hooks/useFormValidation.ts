import { useState, useCallback } from 'react'

/**
 * 表单验证规则
 */
export interface ValidationRule<T = any> {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: T) => string | null
}

/**
 * 表单验证 Schema
 */
export type ValidationSchema<T> = {
  [K in keyof T]?: ValidationRule<T[K]>
}

/**
 * 验证错误
 */
export type ValidationErrors<T> = {
  [K in keyof T]?: string
}

/**
 * 验证单个字段
 */
function validateField<T>(value: T, rule: ValidationRule<T>): string | null {
  // 必填验证
  if (rule.required && (value === null || value === undefined || value === '')) {
    return '此字段为必填项'
  }

  // 如果值为空且非必填，跳过其他验证
  if (value === null || value === undefined || value === '') {
    return null
  }

  // 字符串长度验证
  if (typeof value === 'string') {
    if (rule.minLength && value.length < rule.minLength) {
      return `最少需要 ${rule.minLength} 个字符`
    }
    if (rule.maxLength && value.length > rule.maxLength) {
      return `最多允许 ${rule.maxLength} 个字符`
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      return '格式不正确'
    }
  }

  // 自定义验证
  if (rule.custom) {
    return rule.custom(value)
  }

  return null
}

/**
 * 表单验证 Hook
 * 
 * @example
 * ```tsx
 * const { errors, validate, clearErrors } = useFormValidation({
 *   name: { required: true, minLength: 2 },
 *   email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
 * })
 * 
 * const handleSubmit = () => {
 *   if (validate(formData)) {
 *     // 提交表单
 *   }
 * }
 * ```
 */
export function useFormValidation<T extends Record<string, any>>(
  schema: ValidationSchema<T>
) {
  const [errors, setErrors] = useState<ValidationErrors<T>>({})

  /**
   * 验证整个表单
   */
  const validate = useCallback(
    (data: T): boolean => {
      const newErrors: ValidationErrors<T> = {}

      for (const key in schema) {
        const rule = schema[key]
        if (rule) {
          const error = validateField(data[key], rule)
          if (error) {
            newErrors[key] = error
          }
        }
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
    [schema]
  )

  /**
   * 验证单个字段
   */
  const validateSingle = useCallback(
    (field: keyof T, value: unknown): string | null => {
      const rule = schema[field]
      if (!rule) return null

      const error = validateField(value as T[keyof T], rule)
      setErrors((prev) => ({
        ...prev,
        [field]: error || undefined
      }))

      return error
    },
    [schema]
  )

  /**
   * 清除所有错误
   */
  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  /**
   * 清除单个字段错误
   */
  const clearError = useCallback((field: keyof T) => {
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  return {
    errors,
    validate,
    validateSingle,
    clearErrors,
    clearError
  }
}
