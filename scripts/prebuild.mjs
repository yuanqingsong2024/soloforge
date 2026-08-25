import { existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = join(root, 'release')

if (existsSync(release)) {
  const entries = readdirSync(release)
  for (const entry of entries) {
    rmSync(join(release, entry), { recursive: true, force: true })
  }
}
