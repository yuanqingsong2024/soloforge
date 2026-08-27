import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const version = process.env.npm_package_version || '0.1.0'
const appRoot = join(root, 'release', version, 'linux-unpacked', 'resources', 'app')
const requiredFiles = [
  join(appRoot, 'node_modules', '@prisma', 'client', 'index.js'),
  join(appRoot, 'node_modules', '@prisma', 'client', 'runtime', 'library.js'),
  join(appRoot, 'node_modules', '.prisma', 'client', 'default.js')
]

const missing = requiredFiles.filter(file => !existsSync(file))
if (missing.length > 0) {
  throw new Error(`打包运行时缺少 Prisma 文件：\n${missing.join('\n')}`)
}

const engineDirectory = join(appRoot, 'node_modules', '.prisma', 'client')
const engineCandidates = ['.node', '.dll.node', '.dylib.node', '.so.node']
const engineFiles = []
for (const entry of readdirSync(engineDirectory)) {
  if (engineCandidates.some(suffix => entry.endsWith(suffix))) engineFiles.push(entry)
}
if (engineFiles.length === 0) {
  throw new Error(`打包运行时未找到 Prisma native engine：${engineDirectory}`)
}

for (const file of requiredFiles) console.log(`运行时文件已包含: ${file}`)
console.log(`Prisma native engine: ${engineFiles.join(', ')}`)
