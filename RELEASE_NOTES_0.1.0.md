# SoloForge 0.1.0 内部 RC 发布说明

日期：2026-08-27

## 发布定位

本版本用于内部 RC 验证，不是 1.0 正式发布版。应用默认仅本机使用，禁止直接暴露公网。

## 本轮整改

- 修复发布目录清理导致的构建失败，支持重复构建。
- 完成 Linux AppImage 构建和非空制品检查。
- 升级 Dockerode 5，并固定 protobuf/gRPC/fast-uri 的安全补丁版本。
- 将外发发送改为真实 OpenClaw 调用，失败不得标记为 SENT。
- 审批执行增加 EXECUTING、COMPLETED、FAILED、NOT_IMPLEMENTED 持久化状态。
- 离线同步没有真实处理器时明确失败，不再模拟成功。
- 扩展默认 E2E 测试目录，移除本地可控场景的静默跳过。
- 增加安全审计和跨平台构建工作流。

## 验证结果

- TypeScript：通过
- 单元测试：107/107
- 渲染器测试：21/21
- 集成测试：68/68
- E2E：本地可控场景通过；真实 OpenClaw 测试需外部配置
- Linux electron-builder：通过
- 生产依赖审计：Fastify 4 链路仍有 2 个 High，见 `SECURITY_DEPENDENCY_EXCEPTIONS.md`；Fastify 5 因 Electron 28 运行时不兼容暂缓

## 已知限制

- Fastify 4 / find-my-way 的 2 个 High 尚未通过主版本迁移关闭。
- Windows/macOS 构建和签名需要 GitHub Actions runner 实际验证。
- Claude Code Worker、Host Agent 探针和部分高危动作仍依赖对应运行时 handler。
- 真实 OpenClaw、SSH、Docker 的端到端验证不包含在默认本地测试中。

## 升级与回滚

1. 升级前备份当前 Workspace 和数据库。
2. 确认迁移全部成功后再启动应用。
3. 升级失败时停止应用，保留审计日志并恢复上一安装包。
4. 不要手工删除 AuditLog 或修改 SQLite 审计记录。

## 1.0 发布门槛

必须先完成 `RELEASE_CANDIDATE_CHECKLIST.md` 的全部 P0 项，并取得安全负责人对剩余依赖风险的明确签核；在此之前不得将版本号提升到 `1.0.0`。
