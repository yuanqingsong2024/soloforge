import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const releaseDir = resolve(root, process.argv[2] || 'release')
const output = resolve(releaseDir, 'SHA256SUMS.txt')
if (!existsSync(releaseDir)) throw new Error(`发布目录不存在: ${releaseDir}`)

const files = []
function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry)
    if (file === output) continue
    if (statSync(file).isDirectory()) collect(file)
    else files.push(file)
  }
}
collect(releaseDir)
if (files.length === 0) throw new Error('发布目录没有可校验制品')
const lines = files.sort().map(file => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${relative(root, file)}`)
writeFileSync(output, `${lines.join('\n')}\n`)
console.log(`已生成 ${output}，包含 ${files.length} 个文件`)
