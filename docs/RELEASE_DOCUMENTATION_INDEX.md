# SoloForge 发布文档索引

> 文档状态：发布硬化基线
> 当前软件状态：No-Go，仍需完成 P0 门禁
> 适用版本：当前工作树对应的内部发布规划

## 推荐阅读顺序

1. [发布范围与产品定位](./RELEASE_SCOPE_AND_PRODUCT_POSITIONING.md)
2. [发布就绪总方案](./RELEASE_READINESS_PLAN.md)
3. [技术硬化设计](./RELEASE_HARDENING_DESIGN.md)
4. [数据库与升级方案](./DATABASE_RELEASE_MIGRATION_PLAN.md)
5. [发布流水线设计](./RELEASE_PIPELINE_DESIGN.md)
6. [测试与验收矩阵](./RELEASE_TEST_AND_ACCEPTANCE_MATRIX.md)
7. [内部发布操作手册](./RELEASE_RUNBOOK_INTERNAL.md)

## 权威性

上述 7 份文档共同组成发布设计基线：

- 范围文档决定本版本做什么、不做什么。
- 总方案决定 Go/No-Go 和问题优先级。
- 技术硬化文档决定关键代码行为和验收目标。
- 数据库文档决定迁移、备份、恢复和回滚。
- 流水线文档决定可复现构建和制品归档。
- 测试矩阵决定发布门禁。
- Runbook 决定实际执行步骤。

## 当前事实口径

基于本次审查和当前工作树：

- `package.json` 当前版本是 `0.1.0`，但 Git 历史和旧文档存在其他版本口径；发布前必须统一。
- TypeScript 检查通过。
- 单元测试和 Renderer 测试通过。
- 集成测试仍有 2 项失败。
- `npm run build` 的编译阶段通过，但 electron-builder 当前失败。
- 工作树有大量修改和未跟踪文件，不能直接作为可复现发布源。
- 出站、配置应用、审批执行和审计可靠性仍有发布阻断风险。

## 现有文档处理建议

以下旧文档继续保留作为历史或背景资料，但不作为当前发布状态的唯一依据：

- `README.md` / `README.en.md`：用户和开发入口，需在发布前按本索引统一状态。
- `DEVELOPMENT.md`：开发说明，部分 M0-M7 清单已过时。
- `CONTRIBUTING.md`：协作规范，不替代发布 Runbook。
- `docs/DEVELOPMENT_PLAN.md`：长期路线图，不替代范围冻结。
- `docs/ROADMAP_2026_H2.md`、`docs/ROADMAP_TASKS.md`：未来规划，不得作为已完成能力证明。
- `docs/M7_*`：历史阶段报告，需按当前证据重新核对。
- `docs/TASKS.md`、`docs/TASK_LIST.md`、`docs/TECH_DEBT_TASKS.md`：任务池，不能替代 P0/P1 发布门禁。
- `tests/e2e/README.md`：测试背景说明，最终门禁以测试矩阵和实际命令为准。

不删除旧文档，避免丢失历史；发布前可在各旧文档顶部增加“状态以本索引为准”的链接。

## 发布评审材料

发布评审至少需要：

- 发布 commit、版本和变更日志
- P0/P1 清单及关闭证据
- 静态、单元、Renderer、集成、E2E 测试报告
- 三平台构建日志和制品 hash/签名
- 数据库迁移、备份、恢复和回滚证据
- 安全回归结果
- 已知限制和发布公告
- 技术、安全、发布负责人的 Go/No-Go 结论

## 维护规则

- 每次版本候选变更都要更新当前事实口径和已知限制。
- 不得把设计目标改写成已实现功能。
- 不得删除失败证据；失败需要进入问题清单并有修复后新证据。
- 文档版本、软件版本和 Git tag 必须一致。
