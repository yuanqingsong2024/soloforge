import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const releaseDir = join(process.cwd(), 'release')
if (!existsSync(releaseDir)) {
  throw new Error('发布目录不存在，请先运行 npm run build')
}

const artifacts = []
function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) collect(path)
    else if (stats.size > 0) artifacts.push({ path, size: stats.size })
  }
}
collect(releaseDir)
if (artifacts.length === 0) throw new Error('发布目录没有有效制品')
for (const artifact of artifacts) {
  console.log(`${artifact.path}\t${artifact.size} bytes`)
}
console.log(`检查通过：${artifacts.length} 个非空发布制品`)
