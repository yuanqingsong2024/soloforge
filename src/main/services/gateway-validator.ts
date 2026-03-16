import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 网关配置
 */
export interface GatewayConfig {
  port?: number
  bind?: string // localhost, 0.0.0.0, etc.
  auth?: {
    mode: 'token' | 'password' | 'trusted-proxy' | 'none'
    tokenHash?: string
    passwordHash?: string
  }
  trustedProxies?: string[]
  cors?: {
    enabled: boolean
    origins?: string[]
  }
}

/**
 * 校验结果
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * GatewayValidator 服务
 * 负责网关配置的强校验
 */
export class GatewayValidator {
  /**
   * 校验完整网关配置
   */
  static validate(config: GatewayConfig): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 校验端口
    if (config.port !== undefined) {
      const portResult = this.validatePort(config.port)
      errors.push(...portResult.errors)
      warnings.push(...portResult.warnings)
    }

    // 校验绑定地址
    if (config.bind !== undefined) {
      const bindResult = this.validateBind(config.bind)
      errors.push(...bindResult.errors)
      warnings.push(...bindResult.warnings)
    }

    // 校验认证模式
    if (config.auth) {
      const authResult = this.validateAuth(config.auth)
      errors.push(...authResult.errors)
      warnings.push(...authResult.warnings)
    }

    // 校验 trustedProxies（关键安全项）
    if (config.trustedProxies) {
      const proxiesResult = this.validateTrustedProxies(config.trustedProxies)
      errors.push(...proxiesResult.errors)
      warnings.push(...proxiesResult.warnings)
    }

    // 校验 CORS
    if (config.cors) {
      const corsResult = this.validateCors(config.cors)
      errors.push(...corsResult.errors)
      warnings.push(...corsResult.warnings)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 校验端口
   */
  static validatePort(port: number): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!Number.isInteger(port)) {
      errors.push('端口必须是整数')
    } else if (port < 1 || port > 65535) {
      errors.push('端口必须在 1-65535 范围内')
    } else if (port < 1024) {
      warnings.push('端口 < 1024 需要管理员权限')
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 校验绑定地址
   */
  static validateBind(bind: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const validBinds = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '::']

    if (!validBinds.includes(bind) && !this.isValidIP(bind)) {
      errors.push(`无效的绑定地址: ${bind}`)
    }

    if (bind === '0.0.0.0' || bind === '::') {
      warnings.push('绑定到 0.0.0.0 或 :: 将暴露到所有网络接口，请确保配置了防火墙')
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 校验认证配置
   */
  static validateAuth(auth: GatewayConfig['auth']): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!auth) {
      errors.push('认证配置不能为空')
      return { valid: false, errors, warnings }
    }

    const validModes = ['token', 'password', 'trusted-proxy', 'none']
    if (!validModes.includes(auth.mode)) {
      errors.push(`无效的认证模式: ${auth.mode}`)
    }

    if (auth.mode === 'none') {
      warnings.push('认证模式为 none，网关将不进行任何认证，仅适用于内网环境')
    }

    if (auth.mode === 'token' && !auth.tokenHash) {
      errors.push('token 模式需要提供 tokenHash')
    }

    if (auth.mode === 'password' && !auth.passwordHash) {
      errors.push('password 模式需要提供 passwordHash')
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 校验 trustedProxies（关键安全项）
   */
  static validateTrustedProxies(proxies: string[]): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const dangerousPatterns = ['0.0.0.0/0', '::/0', '0.0.0.0', '*']

    for (const proxy of proxies) {
      const trimmed = proxy.trim()

      // 检查危险值
      if (dangerousPatterns.includes(trimmed)) {
        errors.push(`禁止使用危险代理地址: ${trimmed}`)
        continue
      }

      // 检查 CIDR 网段
      const cidrMatch = trimmed.match(/^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/)
      if (cidrMatch) {
        const prefix = parseInt(cidrMatch[2], 10)
        if (prefix < 24) {
          errors.push(`网段过大 (/${prefix})，最小允许 /24: ${trimmed}`)
        }
        continue
      }

      // 检查精确 IPv4
      const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
      if (ipv4Match) {
        const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number)
        if (octets.some(o => o > 255)) {
          errors.push(`无效 IP 地址: ${trimmed}`)
        }
        continue
      }

      // 检查 IPv6（简单验证）
      if (trimmed.includes(':') && !trimmed.includes('/')) {
        continue // 精确 IPv6 地址，允许
      }

      errors.push(`无法识别的代理地址格式: ${trimmed}`)
    }

    if (proxies.length === 0) {
      warnings.push('trustedProxies 为空，trusted-proxy 模式将无法工作')
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 校验 CORS 配置
   */
  static validateCors(cors: GatewayConfig['cors']): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!cors) {
      return { valid: true, errors, warnings }
    }

    if (cors.enabled && cors.origins) {
      for (const origin of cors.origins) {
        if (origin === '*') {
          warnings.push('CORS 允许所有来源 (*)，可能存在安全风险')
        } else if (!this.isValidOrigin(origin)) {
          errors.push(`无效的 CORS 来源: ${origin}`)
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 检查是否为有效 IP
   */
  private static isValidIP(ip: string): boolean {
    // 简单 IPv4 校验
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    const match = ip.match(ipv4Regex)
    if (match) {
      const octets = [match[1], match[2], match[3], match[4]].map(Number)
      return octets.every(o => o >= 0 && o <= 255)
    }

    // 简单 IPv6 校验（允许包含 :）
    return ip.includes(':')
  }

  /**
   * 检查是否为有效 Origin
   */
  private static isValidOrigin(origin: string): boolean {
    if (origin === '*') return true

    try {
      const url = new URL(origin)
      return ['http:', 'https:'].includes(url.protocol)
    } catch {
      return false
    }
  }
}

export { prisma }
