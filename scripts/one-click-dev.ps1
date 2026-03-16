# SoloForge 一键启动脚本（开发模式）
# 作用：安装依赖 → 初始化数据库 → 启动开发服务器（Electron/Vite）
# 使用：在项目根目录执行：
#   powershell -ExecutionPolicy Bypass -File scripts/one-click-dev.ps1

param(
  [switch]$InitOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host ("\n==> " + $Message) -ForegroundColor Cyan
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  if (-not $Arguments -or $Arguments.Count -eq 0) {
    throw "ArgumentList 不能为空：$FilePath"
  }

  $escaped = ($Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
  Write-Host ("$FilePath $escaped") -ForegroundColor DarkGray

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令执行失败（ExitCode=$LASTEXITCODE）：$FilePath $escaped"
  }
}

try {
  Write-Step "检查运行环境"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未找到 node，请先安装 Node.js（建议 v18+）"
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "未找到 npm，请先安装 Node.js（包含 npm）"
  }

  Write-Step "安装依赖（如已存在 node_modules 将跳过）"
  if (-not (Test-Path -Path "node_modules")) {
    Invoke-Checked "npm" @("install")
  } else {
    Write-Host "node_modules 已存在，跳过 npm install" -ForegroundColor DarkGray
  }

  Write-Step "初始化数据库（Prisma migrate + seed）"
  Invoke-Checked "npx" @("prisma", "migrate", "dev", "--skip-generate")

  Write-Step "生成 Prisma Client（如被占用会重试）"
  $generateOk = $false
  for ($i = 1; $i -le 3; $i++) {
    try {
      Invoke-Checked "npx" @("prisma", "generate")
      $generateOk = $true
      break
    } catch {
      Write-Host ("Prisma generate 第 $i 次失败：" + $_.Exception.Message) -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }

  if (-not $generateOk) {
    if (Test-Path -Path "node_modules/@prisma/client") {
      Write-Host "Prisma generate 多次失败，但检测到已存在 @prisma/client，继续启动流程。" -ForegroundColor Yellow
    } else {
      throw "Prisma generate 失败且 @prisma/client 不存在，无法继续。"
    }
  }

  Invoke-Checked "npx" @("prisma", "db", "seed")

  if ($InitOnly) {
    Write-Step "InitOnly 模式：初始化完成，跳过启动 dev"
    exit 0
  }

  Write-Step "启动开发模式（npm run dev）"
  Invoke-Checked "npm" @("run", "dev")
} catch {
  Write-Host ("\n启动失败：" + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
