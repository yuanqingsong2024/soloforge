import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = join(root, 'release')

if (existsSync(release)) {
  const archive = `${release}.previous-${Date.now()}`
  try {
    renameSync(release, archive)
    mkdirSync(release, { recursive: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`准备发布目录失败: ${release}。请关闭占用发布文件的进程后重试。原始错误: ${message}`)
  }
} else {
  mkdirSync(release, { recursive: true })
}
