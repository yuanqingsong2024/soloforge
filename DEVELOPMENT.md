# SoloForge 开发文档

> 当前版本：`0.1.0`（内部技术预览）。本文只描述当前仓库可复现的开发入口；设计文档和历史报告不代表发布证据。

## 前置条件

- Node.js 18+、npm 9+
- Linux 本地开发可运行 Electron；Windows/macOS 需对应原生环境
- SQLite 由 Prisma 使用，凭证必须通过 Electron safeStorage/系统 Keychain

## 安装与初始化

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

开发启动：

```bash
npm run dev
```

开发 Vite 地址通常为 `http://localhost:5173`；本地 API 使用 `127.0.0.1:13789`（以实际日志为准）。

## 类型检查、测试与构建

```bash
npx tsc --noEmit
npm test                         # unit + renderer + integration
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:e2e                 # 需先 npm run build
npm run test:coverage            # 需要已安装 @vitest/coverage-v8
npm run build
```

`npm test` 不包含 E2E、真实 OpenClaw、SSH 或 Docker 测试。`test:coverage` 当前统计 Renderer/Vitest 测试，不应被解读为全链路覆盖率。真实外部链路必须单独配置并执行，失败不得改写为成功。

## 当前能力与限制

核心页面和控制面能力已在仓库中实现，包括工单、团队、审批、审计、连接、配置、Workspace、Jobs、Policy、变更和 Dashboard。部分动作依赖外部运行时 handler 或真实环境，仍属于受限/待验证状态。Linux AppImage 有本地构建证据；Windows/macOS 构建、签名和安装启动尚未验证。

禁止将测试桩、Dry Run、已入队或审批通过误报为真实执行完成；高危动作必须遵循审批和审计链路。

## 数据库迁移与回滚

开发环境可使用：

```bash
npx prisma migrate dev
npx prisma migrate deploy
npx prisma migrate reset   # 仅开发环境，会清空数据
```

发布升级、备份、恢复和回滚请按 [`docs/RELEASE_RUNBOOK_INTERNAL.md`](./docs/RELEASE_RUNBOOK_INTERNAL.md) 执行。不得手工修改或删除 AuditLog。

## 常见调试

- 主进程/API：查看启动终端和 Electron 主进程日志
- Renderer：打开 DevTools
- 连接失败：确认 OpenClaw 地址、凭证 Keychain、网络和端口
- Agent：确认宿主机可达、bootstrap token 未过期及 allowlist 配置

## 不再使用的命令

- `npm run test` 和 `npm run test:coverage` 现已提供，不要再引用“脚本不存在”的旧说明。
- 不要使用 `npm run test:all`、`npm run coverage`、`npm run start`：这些命令未在 `package.json` 定义。
- 不要以 `npm run build` 成功作为 Windows/macOS 已验证的证据。
