# SoloForge 1.0 RC 发布检查清单

更新时间：2026-08-27

## 当前决策

当前版本仍为 `0.1.0`，状态为 **内部 RC / No-Go for 1.0**。完成 Fastify 依赖风险关闭或正式豁免、三平台签名、安装回归及负责人签核后，才允许将版本提升为 `1.0.0`。

## 已完成证据

- [x] TypeScript 类型检查通过
- [x] 单元测试 107/107 通过
- [x] 渲染器测试 21/21 通过
- [x] 集成测试已通过（偶发 SQLite hook 超时需稳定性复核）
- [x] 完整 E2E：本地可控场景通过；真实 OpenClaw 场景需外部配置
- [x] Linux electron-builder 构建通过
- [x] 发布制品非空检查通过
- [x] 生产依赖 Critical 漏洞已清零
- [x] Dockerode 5 与安全 overrides 已通过类型/单元回归
- [x] 审批执行失败返回明确状态并写审计
- [x] 外发失败不会伪标记为 SENT

## P0 阻塞项

- [ ] 生产依赖审计通过：当前仍有 Fastify 4 / find-my-way 的 2 个 High，见 `SECURITY_DEPENDENCY_EXCEPTIONS.md`
- [x] 审批执行状态持久化并具备幂等 claim
- [x] Claude Code、离线同步和外发失败路径不再伪成功
- [x] 集成测试在当前干净测试数据库通过

## P1 发布项

- [ ] Windows NSIS 构建、安装和启动验证
- [ ] macOS DMG 构建、安装和启动验证
- [ ] Linux AppImage 安装和启动验证
- [ ] 三平台代码签名状态确认
- [ ] 每个制品生成 SHA256SUMS
- [ ] 数据库迁移、升级和回滚演练
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
