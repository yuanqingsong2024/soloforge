import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checksumFile = resolve(root, process.argv[2] || 'release/SHA256SUMS.txt')
if (!existsSync(checksumFile)) throw new Error(`校验文件不存在: ${checksumFile}`)

const lines = readFileSync(checksumFile, 'utf8').split(/\r?\n/).filter(Boolean)
for (const line of lines) {
  const separator = line.indexOf('  ')
  if (separator < 0) throw new Error(`校验行格式无效: ${line}`)
  const expected = line.slice(0, separator)
  const file = resolve(root, line.slice(separator + 2))
  if (!existsSync(file)) throw new Error(`制品不存在: ${file}`)
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
  if (actual !== expected) throw new Error(`SHA256 不匹配: ${file}`)
  console.log(`校验通过: ${file}`)
}
