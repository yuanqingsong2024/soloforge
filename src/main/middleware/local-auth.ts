import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { KeychainService } from '../services/keychain'
import { logger } from '../services/logger'
import { isE2ETestMode } from '../runtime-mode'

/**
 * SoloForge 本地 API 认证中间件
 *
 * 职责：
 * 1. 生成并存储本地 API Token（仅生成一次，持久化到 Keychain）
 * 2. 生产模式验证请求头 X-SoloForge-Token
 * 3. 开发/E2E 模式放行（renderer 进程在本地，安全边界由 OS 层保证）
 *
 * 安全设计：
 * - Token 仅存在 Keychain（OS 级加密），不在磁盘明文存储
 * - E2E 模式跳过验证（通过环境变量 SOLOFORGE_E2E=1 判定）
 * - 开发模式同样需要 token（renderer 跨进程 HTTP 调用仍需鉴权）
 * - 验证失败返回 401，不泄露具体原因
 */

const KEYCHAIN_NAMESPACE = 'local-api-token'

/** 当前加载的 Token（内存缓存，避免每次从 Keychain 读取） */
let cachedToken: string | null = null

/**
 * 判断是否跳过认证
 * - E2E 测试模式（SOLOFORGE_E2E=1）：跳过（Playwright 直接调用 API）
 * - 其他模式均需认证（包括开发模式）
 */
function shouldBypassAuth(): boolean {
  return isE2ETestMode()
}

/**
 * 生成一个安全的随机 Token
 * 格式：sf_local_ + UUID v4（无连字符）
 */
function generateToken(): string {
  return `sf_local_${uuidv4().replace(/-/g, '')}`
}

/**
 * 获取当前 API Token（从缓存或 Keychain 加载）
 * 首次调用时若 Keychain 中不存在，则生成并存储
 */
export async function getOrCreateLocalApiToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken
  }

  // 尝试从 Keychain 读取
  try {
    const stored = await KeychainService.getPassword('', KEYCHAIN_NAMESPACE)
    if (stored) {
      cachedToken = stored
      return stored
    }
  } catch {
    // Keychain 读取失败，继续创建
  }

  // 生成新 Token 并存储
  const newToken = generateToken()
  try {
    await KeychainService.setPassword('', KEYCHAIN_NAMESPACE, newToken)
    cachedToken = newToken
    logger.info('[LocalAuth] 本地 API Token 已生成并存储到 Keychain')
  } catch (error) {
    // Keychain 写入失败（非阻断，但记录警告）
    logger.warn(
      `[LocalAuth] 无法存储 API Token 到 Keychain: ${error instanceof Error ? error.message : String(error)}`
    )
    // 降级：使用内存 Token（重启后失效，但不影响核心功能）
    cachedToken = newToken
  }

  return newToken
}

/**
 * 获取当前 Token 的掩码版本（用于 UI 显示）
 */
export function getMaskedToken(token: string): string {
  return KeychainService.maskValue(token)
}

/**
 * Fastify preHandler hook：验证本地 API Token
 *
 * 使用方式：
 * ```typescript
 * fastify.get('/api/xxx', { preHandler: localAuthHook }, async (request, reply) => { ... })
 * ```
 *
 * 或全局注册（不建议，影响健康检查等内部端点）：
 * ```typescript
 * fastify.addHook('onRequest', localAuthHook)
 * ```
 */
export async function localAuthHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // E2E 模式跳过验证
  if (shouldBypassAuth()) {
    return
  }

  const token = await getOrCreateLocalApiToken()

  // 支持两种格式：Authorization: Bearer <token> 和 X-SoloForge-Token
  const authHeader = request.headers.authorization as string | undefined
  const provided = authHeader ? extractBearerToken(authHeader) : (request.headers['x-soloforge-token'] as string | undefined)

  if (!provided) {
    logger.debug('[LocalAuth] 请求缺少认证 token')
    reply.code(401).send({ error: 'Unauthorized', message: 'Missing authentication token' })
    return
  }

  // 使用常量时间比较防止时序攻击
  if (!timingSafeEqual(provided, token)) {
    logger.debug('[LocalAuth] Token 验证失败')
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' })
    return
  }
}

/**
 * 从 Authorization header 中提取 Bearer token
 * 例如："Bearer sf_local_xxx" → "sf_local_xxx"
 */
function extractBearerToken(authHeader: string): string | null {
  const prefix = 'Bearer '
  if (authHeader.startsWith(prefix)) {
    return authHeader.substring(prefix.length).trim()
  }
  return null
}

/**
 * 注册需要认证的路由前缀
 * 默认对 /api/ 开头的路由启用认证（排除健康检查）
 */
export function registerAuthenticatedRoutes(fastify: FastifyInstance): void {
  // 健康检查端点（无需认证）- 使用简单路由定义
  fastify.get('/health', async (_request, reply) => reply.send({ status: 'ok' }))
  fastify.get('/ready', async (_request, reply) => reply.send({ ready: true }))

  // 其他所有 /api/ 路由默认需要认证
  fastify.addHook('onRequest', async (request, reply) => {
    // 跳过健康检查路径
    if (request.url === '/health' || request.url === '/ready') {
      return
    }

    // 跳过 E2E 模式
    if (shouldBypassAuth()) {
      return
    }

    const token = await getOrCreateLocalApiToken()

    // 支持两种格式：Authorization: Bearer <token> 和 X-SoloForge-Token
    const authHeader = request.headers.authorization as string | undefined
    const provided = authHeader
      ? extractBearerToken(authHeader)
      : (request.headers['x-soloforge-token'] as string | undefined)

    if (!provided || !timingSafeEqual(provided, token)) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  logger.info('[LocalAuth] 本地 API 认证中间件已注册')
}

/**
 * 常量时间字符串比较（防止时序攻击）
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
