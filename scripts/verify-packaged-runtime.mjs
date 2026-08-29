import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const version = process.env.npm_package_version || '0.1.0'
const resourcesRoot = join(root, 'release', version, 'linux-unpacked', 'resources')
const appRoot = join(resourcesRoot, 'app')
const unpackedRoot = join(resourcesRoot, 'app.asar.unpacked')
const requiredFiles = [
  [join(appRoot, 'node_modules', '@prisma', 'client', 'index.js'), join(unpackedRoot, 'node_modules', '@prisma', 'client', 'index.js')],
  [join(appRoot, 'node_modules', '@prisma', 'client', 'runtime', 'library.js'), join(unpackedRoot, 'node_modules', '@prisma', 'client', 'runtime', 'library.js')],
  [join(appRoot, 'node_modules', '.prisma', 'client', 'default.js'), join(unpackedRoot, 'node_modules', '.prisma', 'client', 'default.js'), join(unpackedRoot, 'node_modules', '@prisma', 'client', 'default.js')]
]
const resolvedFiles = requiredFiles.map(candidates => candidates.find(file => existsSync(file)))
const missing = resolvedFiles.flatMap((file, index) => file ? [] : requiredFiles[index])
if (missing.length > 0) {
  throw new Error(`打包运行时缺少 Prisma 文件：\n${missing.join('\n')}`)
}

const engineDirectories = [
  join(appRoot, 'node_modules', '.prisma', 'client'),
  join(unpackedRoot, 'node_modules', '.prisma', 'client')
]
const engineCandidates = ['.node', '.dll.node', '.dylib.node', '.so.node']
const engineFiles = engineDirectories.flatMap(directory => existsSync(directory)
  ? readdirSync(directory).filter(entry => engineCandidates.some(suffix => entry.endsWith(suffix)))
  : [])
if (engineFiles.length === 0) {
  throw new Error(`打包运行时未找到 Prisma native engine：${engineDirectories.join(' 或 ')}`)
}

for (const file of resolvedFiles) console.log(`运行时文件已包含: ${file}`)
console.log(`Prisma native engine: ${engineFiles.join(', ')}`)
