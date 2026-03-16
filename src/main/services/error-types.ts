/**
 * 统一错误类型定义
 * 用于标准化所有执行器和服务的错误分类
 */

export enum ErrorType {
  // 认证与授权
  AUTH_FAILED = 'AUTH_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

  // 网络与连接
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  TIMEOUT = 'TIMEOUT',
  DNS_RESOLUTION_FAILED = 'DNS_RESOLUTION_FAILED',

  // 资源与状态
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  INVALID_STATE = 'INVALID_STATE',

  // 验证与输入
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // 执行与操作
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  OPERATION_BLOCKED = 'OPERATION_BLOCKED',
  OPERATION_CANCELED = 'OPERATION_CANCELED',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',

  // 系统与配置
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  NOT_SUPPORTED = 'NOT_SUPPORTED',

  // 数据与存储
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  STORAGE_FULL = 'STORAGE_FULL',

  // 未分类
  UNKNOWN = 'UNKNOWN'
}

/**
 * 统一的操作结果类型
 */
export interface OperationResult<T = unknown> {
  success: boolean
  data?: T
  error?: {
    type: ErrorType
    message: string
    details?: unknown
    retryable?: boolean
  }
}

/**
 * 创建成功结果
 */
export function success<T>(data?: T): OperationResult<T> {
  return {
    success: true,
    data
  }
}

/**
 * 创建失败结果
 */
export function failure(
  type: ErrorType,
  message: string,
  details?: unknown,
  retryable = false
): OperationResult<never> {
  return {
    success: false,
    error: {
      type,
      message,
      details,
      retryable
    }
  }
}

/**
 * 从 Error 对象推断错误类型
 */
export function inferErrorType(error: unknown): ErrorType {
  if (!(error instanceof Error)) {
    return ErrorType.UNKNOWN
  }

  const message = error.message.toLowerCase()

  // 认证相关
  if (message.includes('auth') || message.includes('unauthorized')) {
    return ErrorType.AUTH_FAILED
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return ErrorType.PERMISSION_DENIED
  }
  if (message.includes('token') && message.includes('expired')) {
    return ErrorType.TOKEN_EXPIRED
  }
  if (message.includes('credential')) {
    return ErrorType.INVALID_CREDENTIALS
  }

  // 网络相关
  if (
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('fetch failed')
  ) {
    return ErrorType.NETWORK_ERROR
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return ErrorType.TIMEOUT
  }
  if (message.includes('connection refused')) {
    return ErrorType.CONNECTION_REFUSED
  }

  // 资源相关
  if (message.includes('not found') || message.includes('does not exist')) {
    return ErrorType.NOT_FOUND
  }
  if (message.includes('already exists') || message.includes('duplicate')) {
    return ErrorType.ALREADY_EXISTS
  }

  // 验证相关
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorType.VALIDATION_ERROR
  }

  // 系统相关
  if (message.includes('not implemented')) {
    return ErrorType.NOT_IMPLEMENTED
  }
  if (message.includes('not supported')) {
    return ErrorType.NOT_SUPPORTED
  }

  return ErrorType.UNKNOWN
}

/**
 * 将异常转换为统一的失败结果
 */
export function fromError(error: unknown, defaultMessage = '操作失败'): OperationResult<never> {
  if (error instanceof Error) {
    const type = inferErrorType(error)
    const retryable = [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.CONNECTION_REFUSED,
      ErrorType.RESOURCE_UNAVAILABLE
    ].includes(type)

    return failure(type, error.message, { stack: error.stack }, retryable)
  }

  return failure(ErrorType.UNKNOWN, defaultMessage, { raw: String(error) })
}

/**
 * 判断错误是否可重试
 */
export function isRetryable(result: OperationResult): boolean {
  return result.error?.retryable ?? false
}

/**
 * 判断错误是否为临时性错误
 */
export function isTransient(errorType: ErrorType): boolean {
  return [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT,
    ErrorType.CONNECTION_REFUSED,
    ErrorType.RESOURCE_UNAVAILABLE
  ].includes(errorType)
}
