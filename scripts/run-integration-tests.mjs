import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const prismaDir = join(rootDir, 'prisma')
const dbFile = join(prismaDir, 'integration-test.db')
const DATABASE_URL = 'file:./integration-test.db'

function resolveCommand(binary) {
  return process.platform === 'win32' ? `${binary}.cmd` : binary
}

function run(cmd, args, envOverrides) {
  const fullEnv = { ...process.env, DATABASE_URL, ...envOverrides }
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(resolveCommand(cmd), args, {
      cwd: rootDir,
      env: fullEnv,
      stdio: 'inherit'
    })
    child.on('error', rejectRun)
    child.on('exit', code => resolveRun(code ?? 1))
  })
}

async function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${dbFile}${suffix}`
    if (existsSync(path)) {
      await rm(path, { force: true })
    }
  }
}

async function main() {
  await cleanup()
  const generate = await run('npx', ['prisma', 'generate'], {})
  if (generate !== 0) return process.exit(generate)
  const migrate = await run('npx', ['prisma', 'migrate', 'deploy'], {})
  if (migrate !== 0) return process.exit(migrate)
  const vitest = await run('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {})
  return process.exit(vitest)
}

main().finally(cleanup).catch(err => { console.error(err); process.exit(1) })
