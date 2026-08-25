# SoloForge 发布流水线设计

## 1. 发布输入与冻结

发布必须从干净的 release 分支或发布提交开始：

- `git status --short` 为空，或所有差异都有明确审查记录。
- 版本统一于 `package.json`、`package-lock.json`、应用显示、变更日志和 Git tag。
- 只允许范围冻结文档中列出的 P0/P1 修复进入候选版。
- Node、npm、Electron、Prisma、操作系统 runner 和锁文件版本全部记录。
- 不把 `dist`、`release`、测试截图、临时目录和本地数据库当作源码提交。

## 2. 标准验证顺序

在干净工作树执行：

```bash
npm ci
npx prisma generate
npx prisma validate
npx tsc --noEmit
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:e2e
```

如需真实 OpenClaw/外部渠道测试，单独执行并明确环境、凭证来源和是否产生外部副作用。没有配置真实服务时不得伪造通过。

## 3. 构建矩阵

| 平台 | 制品 | 构建环境 | 必测 |
|---|---|---|---|
| Windows x64 | NSIS | Windows 原生 runner | 安装、启动、卸载、升级 |
| macOS | DMG | macOS 原生 runner | 打开、权限、签名/公证 |
| Linux x64 | AppImage | Linux 原生 runner | 启动、数据目录、依赖诊断 |

当前 `npm run build` 已串联 `tsc`、Vite 和 electron-builder，但不能把一次本地成功视为三平台发布证明。每个平台都需产生独立日志和制品。

## 4. 制品命名和归档

建议命名：

```text
SoloForge-{version}-{platform}-{arch}.{ext}
SoloForge-{version}-{platform}-{arch}.sha256
SoloForge-{version}-release-metadata.json
```

metadata 至少包含：版本、Git commit、构建时间、runner、Node/npm/Electron 版本、Prisma migration 列表、测试摘要、签名状态和已知限制。

制品进入内部仓库前必须：

1. 计算 SHA-256。
2. 验证签名（若配置）。
3. 在干净机器安装并启动。
4. 检查应用版本和数据目录。
5. 归档日志、hash、截图和验收结果。

## 5. 数据库验证

- 在临时 SQLite 数据库上从零执行迁移。
- 使用上一候选版生成数据，验证升级到当前版本。
- 执行备份、恢复和迁移失败演练。
- 不把 `dev.db` 或测试数据库打入安装包。
- 迁移文件必须完整纳入提交，命名不能含歧义空后缀。

详细规则见 [数据库与升级方案](./DATABASE_RELEASE_MIGRATION_PLAN.md)。

## 6. CI 目标门禁

当前 CI 主要运行 E2E，未覆盖完整构建和发行。目标流水线应按以下阶段执行：

```text
静态检查
  -> unit/renderer
  -> integration
  -> E2E
  -> migration smoke
  -> platform build
  -> artifact hash/sign
  -> install smoke
  -> archive/release decision
```

本地发布可以暂时代替 CI，但必须使用同一命令、同一清单和同一证据格式。禁止出现本地 E2E 白名单和 CI 全量 E2E 结果无法对比的情况。

## 7. 失败处理

- 任意 P0 失败立即 No-Go。
- 构建失败不得手工上传旧制品冒充新制品。
- 迁移失败保留数据库备份和日志，停止升级。
- 测试不稳定必须区分产品失败与测试环境失败，不得删除测试。
- 版本重新发布必须增加修订号并保留失败记录。

## 8. 发布退出条件

- 三平台目标制品存在且可安装启动。
- 测试和迁移门禁通过。
- hash/签名可独立验证。
- 安装、升级、回滚和恢复有证据。
- 发布负责人完成 Go/No-Go 签字。
