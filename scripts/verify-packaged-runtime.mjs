import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const version = process.env.npm_package_version || '0.1.0'
const appRoot = join(root, 'release', version, 'linux-unpacked', 'resources', 'app')
const requiredFiles = [
  join(appRoot, 'node_modules', '@prisma', 'client', 'index.js'),
  join(appRoot, 'node_modules', '@prisma', 'client', 'runtime', 'library.js'),
  join(appRoot, 'node_modules', '.prisma', 'client', 'default.js'),
  join(appRoot, 'node_modules', '.prisma', 'client', 'libquery_engine-debian-openssl-3.0.x.so.node')
]

const missing = requiredFiles.filter(file => !existsSync(file))
if (missing.length > 0) {
  throw new Error(`打包运行时缺少 Prisma 文件：\n${missing.join('\n')}`)
}

for (const file of requiredFiles) console.log(`运行时文件已包含: ${file}`)
