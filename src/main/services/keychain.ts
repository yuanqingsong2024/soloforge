import { safeStorage } from 'electron'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

const SERVICE_NAME = 'SoloForge'

/**
 * 使用 Electron safeStorage API 的安全凭证存储
 * safeStorage 在 Windows 使用 DPAPI，macOS 使用 Keychain，Linux 使用 libsecret
 * 加密后的数据存储在本地 JSON 文件中——密钥由操作系统凭据加密，不会明文落盘
 */

function getStoragePath(): string {
  return path.join(app.getPath('userData'), `${SERVICE_NAME}-credentials.json`)
}

function readStore(): Record<string, string> {
  const filePath = getStoragePath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    logger.error('Failed to read credential store, resetting')
  }
  return {}
}

function writeStore(store: Record<string, string>): void {
  const filePath = getStoragePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  fs.chmodSync(tmpPath, 0o600)
  fs.renameSync(tmpPath, filePath)
}

export class KeychainService {
  /**
   * 存储凭证（OS级加密）
   * @param workspaceId 工作区 ID（用于隔离命名空间）。传空字符串 "" 时使用旧格式（兼容历史数据）
   * @param account 账户名（如 "local-profile-token"）
   * @param password 密码/token
   */
  static async setPassword(workspaceId: string, account: string, password: string): Promise<void>
  /**
   * 兼容旧签名：setPassword(account, password)
   * @deprecated 请改用 setPassword(workspaceId, account, password)
   */
  static async setPassword(account: string, password: string): Promise<void>
  static async setPassword(...args: [string, string, string] | [string, string]): Promise<void> {
    const [workspaceId, account, password] =
      args.length === 3 ? args : ['', args[0], args[1]]
    if (!account || typeof account !== 'string' || !account.trim()) {
      throw new Error('Keychain account must be a non-empty string')
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      throw new Error('Keychain password must be a non-empty string')
    }
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS encryption not available')
      }
      const encrypted = safeStorage.encryptString(password)
      const store = readStore()
      const key =
        workspaceId === '' ? `${SERVICE_NAME}/${account}` : `${SERVICE_NAME}/${workspaceId}/${account}`
      store[key] = encrypted.toString('base64')
      writeStore(store)
    } catch (error) {
      logger.error(`Failed to store credential for ${account}: ${error instanceof Error ? error.message : String(error)}`)
      throw new Error(`Keychain storage failed: ${error}`)
    }
  }

  /**
   * 从安全存储读取凭证
   * @param workspaceId 工作区 ID（用于隔离命名空间）。传空字符串 "" 时使用旧格式（兼容历史数据）
   * @param account 账户名
   * @returns 密码/token，不存在返回 null
   */
  static async getPassword(workspaceId: string, account: string): Promise<string | null>
  /**
   * 兼容旧签名：getPassword(account)
   * @deprecated 请改用 getPassword(workspaceId, account)
   */
  static async getPassword(account: string): Promise<string | null>
  static async getPassword(...args: [string, string] | [string]): Promise<string | null> {
    const [workspaceId, account] = args.length === 2 ? args : ['', args[0]]
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return null
      }
      const store = readStore()
      const key =
        workspaceId === '' ? `${SERVICE_NAME}/${account}` : `${SERVICE_NAME}/${workspaceId}/${account}`
      const encoded = store[key]
      if (!encoded) return null
      const buffer = Buffer.from(encoded, 'base64')
      return safeStorage.decryptString(buffer)
    } catch (error) {
      logger.error(`Failed to retrieve credential for ${account}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * 删除凭证
   * @param workspaceId 工作区 ID（用于隔离命名空间）。传空字符串 "" 时使用旧格式（兼容历史数据）
   * @param account 账户名
   */
  static async deletePassword(workspaceId: string, account: string): Promise<boolean>
  /**
   * 兼容旧签名：deletePassword(account)
   * @deprecated 请改用 deletePassword(workspaceId, account)
   */
  static async deletePassword(account: string): Promise<boolean>
  static async deletePassword(...args: [string, string] | [string]): Promise<boolean> {
    const [workspaceId, account] = args.length === 2 ? args : ['', args[0]]
    try {
      const store = readStore()
      const key =
        workspaceId === '' ? `${SERVICE_NAME}/${account}` : `${SERVICE_NAME}/${workspaceId}/${account}`
      if (key in store) {
        delete store[key]
        writeStore(store)
        return true
      }
      return false
    } catch (error) {
      logger.error(`Failed to delete credential for ${account}: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 列出所有存储的账户
   * @param workspaceId 可选：工作区 ID。传入后仅列出该工作区；不传则列出所有（含历史旧格式）
   */
  static async findCredentials(workspaceId?: string): Promise<Array<{ account: string; password: string }>> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return []
      }
      const store = readStore()
      const prefix =
        workspaceId === undefined
          ? `${SERVICE_NAME}/`
          : workspaceId === ''
            ? `${SERVICE_NAME}/`
            : `${SERVICE_NAME}/${workspaceId}/`
      const results: Array<{ account: string; password: string }> = []
      for (const [key, encoded] of Object.entries(store)) {
        if (!key.startsWith(prefix)) continue

        // 当 workspaceId 为空字符串（旧格式）时，仅匹配 legacy：SoloForge/<account>
        if (workspaceId === '' && key.slice(prefix.length).includes('/')) continue

        if (key.startsWith(prefix)) {
          try {
            const buffer = Buffer.from(encoded, 'base64')
            const password = safeStorage.decryptString(buffer)
            results.push({ account: key.slice(prefix.length), password })
          } catch {
            // skip corrupted entries
          }
        }
      }
      return results
    } catch (error) {
      logger.error(`Failed to list credentials: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  /**
   * 掩码显示（用于 UI）
   * @param value 原始值
   * @returns 掩码后的值（如 "sk-****"）
   */
  static maskValue(value: string | null): string {
    if (!value) return '(未设置)'
    if (value.length <= 8) return '****'
    return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`
  }
}
