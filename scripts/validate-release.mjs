import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const root = resolve(process.cwd())
const releaseDir = resolve(root, 'release')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const platform = process.argv[2] || process.env.RELEASE_PLATFORM
if (!platform || !['linux', 'win', 'mac'].includes(platform)) throw new Error('必须指定 RELEASE_PLATFORM: linux、win 或 mac')
const versionDir = join(releaseDir, version)
if (!existsSync(versionDir)) throw new Error(`制品版本目录不存在: ${versionDir}`)
const extensions = { linux: ['.AppImage'], win: ['.exe'], mac: ['.dmg'] }[platform]
const artifacts = readdirSync(versionDir).filter(file => extensions.some(ext => file.endsWith(ext)))
if (artifacts.length === 0) throw new Error(`${platform} 未找到期望制品类型: ${extensions.join(', ')}`)
const checksum = join(releaseDir, 'SHA256SUMS.txt')
if (!existsSync(checksum)) throw new Error(`缺少 SHA256SUMS.txt: ${checksum}`)
const signed = platform === 'win'
  ? artifacts.every(file => process.env.WIN_CSC_LINK && process.env.WIN_CSC_KEY_PASSWORD)
  : artifacts.every(file => process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD)
if (process.env.RELEASE_TAG === 'true' && !signed) throw new Error(`${platform} 标签发布缺少签名凭证，禁止继续`)
console.log(`版本 ${version} 与 package.json 一致，制品类型 ${extensions.join('/')}，文件 ${artifacts.join(', ')}`)
console.log(`签名状态: ${signed ? '已提供签名凭证（实际签名结果以平台工具为准）' : '未签名内部构建'}`)
