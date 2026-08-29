# SoloForge 1.0 RC 发布检查清单

更新时间：2026-08-28

## 当前决策

当前版本仍为 `0.1.0`，状态为 **内部 RC / No-Go for 1.0**。Electron/Fastify 运行时安全门禁已关闭；完成 Windows/macOS 签名与安装回归及负责人签核后，才允许将版本提升为 `1.0.0`。

## 已完成证据

- [x] TypeScript 类型检查通过
- [x] 单元测试 107/107 通过
- [x] 渲染器测试 21/21 通过（CI 使用单线程参数避免本机 worker 超时）
- [x] 集成测试 68/68 通过
- [x] 离线 E2E 45/46 通过，唯一跳过为真实 OpenClaw 外发场景
- [x] Linux electron-builder 构建通过，已启用 ASAR
- [x] Linux AppImage 启动冒烟通过
- [x] 发布制品非空检查、SHA256 校验和验证通过
- [x] Prisma runtime 在 ASAR/unpacked 布局下校验通过
- [x] 全新 SQLite 数据库 20 个 migration 部署与 seed 通过
- [x] 现有数据库增量迁移、隔离副本备份恢复演练通过
- [x] Dockerode 5 与安全 overrides 已通过类型/单元回归
- [x] 审批执行失败返回明确状态并写审计
- [x] 外发失败不会伪标记为 SENT
- [x] 本地 OpenClaw webhook 回环验证：live E2E 1/1，通过 token 鉴权、`POST /hooks/event`、provider 回执和 `SENT` 状态闭环

## P0 阻塞项

- [x] 生产依赖审计通过：Electron 30.5.1 + Fastify 5.12.1，`npm audit --omit=dev --audit-level=high` 为 0
- [x] 审批执行状态持久化并具备幂等 claim
- [x] Claude Code、离线同步和外发失败路径不再伪成功
- [x] 集成测试在当前干净测试数据库通过

## P1 发布项

- [ ] Windows NSIS 构建、安装和启动验证（需 Windows runner）
- [ ] macOS DMG 构建、安装和启动验证（需 macOS runner）
- [x] Linux AppImage 安装和启动验证（Electron 30.5.1）
- [ ] 三平台代码签名状态确认（需平台签名凭证）
- [x] 当前 Linux 制品已生成并验证 SHA256SUMS；Windows/macOS 制品待生成
- [x] 数据库从零迁移、增量迁移、隔离副本备份恢复演练；跨版本真实回滚仍待上一版本环境
- [ ] 日志目录、敏感值脱敏和崩溃恢复演练
- [ ] Release Notes、已知限制和支持策略完成
- [ ] 版本号、README、ROADMAP、DEVELOPMENT 文档统一

## Go 条件

1. `npm audit --omit=dev --audit-level=high` 通过，或有有效的安全负责人豁免。
2. `npm run build` 在干净工作区连续成功两次。
3. 单元、渲染器、集成、E2E 均通过；条件跳过必须只依赖明确的外部服务。
4. 所有高危动作均能区分 APPROVED、EXECUTING、COMPLETED、FAILED、NOT_IMPLEMENTED。
5. 三平台制品具备安装启动证据和校验值。
6. 发布负责人完成签核并保留审计记录。
