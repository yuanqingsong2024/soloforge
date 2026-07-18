/**
 * SoloForge 一键启动脚本（跨平台，开发模式）
 * 作用：安装依赖 → 初始化数据库 → 启动开发服务器（Electron/Vite）
 *
 * 用法：
 *   node scripts/one-click-dev.mjs
 *   node scripts/one-click-dev.mjs --init-only
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function writeStep(message) {
  // eslint-disable-next-line no-console
  console.log(`\n==> ${message}`)
}

function writeWarn(message) {
  // eslint-disable-next-line no-console
  console.warn(`\n[警告] ${message}`)
}

function writeError(message) {
  // eslint-disable-next-line no-console
  console.error(`\n[错误] ${message}`)
}

function getBin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function runChecked(command, args, options = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error(`参数不能为空：${command}`)
  }

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-console
    console.log(`$ ${command} ${args.join(' ')}`)

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`命令执行失败（ExitCode=${code ?? 'unknown'}）：${command} ${args.join(' ')}`))
    })
  })
}

function hasNodeModules() {
  return fs.existsSync(path.join(process.cwd(), 'node_modules'))
}

async function runPrismaGenerateWithRetry({ attempts }) {
  const npx = getBin('npx')
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await runChecked(npx, ['prisma', 'generate'])
      return { ok: true }
    } catch (err) {
      writeWarn(`Prisma generate 第 ${i} 次失败：${err instanceof Error ? err.message : String(err)}`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  const prismaClientPath = path.join(process.cwd(), 'node_modules', '@prisma', 'client')
  if (fs.existsSync(prismaClientPath)) {
    writeWarn('Prisma generate 多次失败，但检测到已存在 @prisma/client，继续后续流程。')
    return { ok: true, degraded: true }
  }

  return { ok: false }
}

function parseArgs(argv) {
  const set = new Set(argv)
  return {
    initOnly: set.has('--init-only') || set.has('--initOnly')
  }
}

async function main() {
  const { initOnly } = parseArgs(process.argv.slice(2))

  writeStep('检查运行环境')
  // Node 已在运行；这里主要确保 npm/npx 可用。

  writeStep('安装依赖（如已存在 node_modules 将跳过）')
  if (!hasNodeModules()) {
    await runChecked(getBin('npm'), ['install'])
  } else {
    // eslint-disable-next-line no-console
    console.log('node_modules 已存在，跳过 npm install')
  }

  writeStep('初始化数据库（Prisma migrate + seed）')
  await runChecked(getBin('npx'), ['prisma', 'migrate', 'dev', '--skip-generate'])

  writeStep('生成 Prisma Client（如被占用会重试）')
  const generate = await runPrismaGenerateWithRetry({ attempts: 3 })
  if (!generate.ok) {
    throw new Error('Prisma generate 失败且 @prisma/client 不存在，无法继续。')
  }

  await runChecked(getBin('npx'), ['prisma', 'db', 'seed'])

  if (initOnly) {
    writeStep('InitOnly 模式：初始化完成，跳过启动 dev')
    return
  }

  writeStep('启动开发模式（npm run dev）')
  await runChecked(getBin('npm'), ['run', 'dev'])
}

main().catch((err) => {
  writeError(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
