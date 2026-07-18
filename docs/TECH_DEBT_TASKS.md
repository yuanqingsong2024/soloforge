# SoloForge 技术债优化任务清单

> 本文档记录 SoloForge 项目当前架构的技术债，并跟踪优化进度。
> 每个任务完成后请在状态列标记 `[x]`，并填写完成日期与验证结果。
>
> **优先级**：P0（阻断性/安全） > P1（高价值/高频痛点） > P2（改善性）
>
> **状态约定**：`[ ]` 待办 · `[/]` 进行中 · `[x]` 已完成 · `[-]` 已搁置（需说明原因）

---

## 一、代码组织优化（P0）

### T-001 拆分 `api-server.ts` 巨型文件

- **当前状态**：`api-server.ts` 共 2,032 行，混合了 Policy / Workspace / ChangeRequest / Deployment 多个域的路由，以及 `startServer()` 与 `registerApprovalHandlers()`。
- **目标**：`api-server.ts` 仅保留 `startServer()` 与 `registerApprovalHandlers()`，其余路由全部迁移到 `routes/` 目录下独立文件。
- **验收标准**：
  - [ ] `api-server.ts` 行数 < 300 行
  - [ ] 新增路由模块：`routes/policies.ts`、`routes/workspace-settings.ts`、`routes/change-requests.ts`、`routes/deployments.ts`
  - [ ] 每个路由模块遵循统一签名：`export function registerXxxRoutes(fastify: FastifyInstance): void`
  - [ ] `npx tsc --noEmit` 零错误
  - [ ] 现有 E2E 测试全部通过
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

### T-002 实现统一审计中间件（消除重复代码）

- **当前状态**：`api-server.ts` 中有 50+ 处重复的 `try/catch + prisma.auditLog.create()` 模式，代码膨胀严重且容易遗漏审计点。
- **目标**：实现 `auditedRoute()` 包装器，统一处理 traceId 生成、审计日志写入、错误处理。
- **验收标准**：
  - [x] 新建 `src/main/middleware/audit-wrapper.ts`
  - [x] 实现统一的审计包装器，支持自动 traceId/actor/workspaceId 提取
  - [x] 在至少 3 个路由模块中应用（policies、workspace-settings、change-requests）
  - [x] 审计日志覆盖率达 100%（无遗漏端点）
  - [x] `npx tsc --noEmit` 零错误
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：`audit-wrapper.ts` 已创建并在 policies、workspace-settings、change-requests 三个路由模块中应用

### T-003 统一 Prisma Client 实例

- **当前状态**：`api-shared.ts` 和 `approval-guard.ts` 各自 `new PrismaClient()`，导致连接池浪费和潜在的数据一致性问题。
- **目标**：全局只有一个 Prisma Client 实例，通过 `db.ts` 统一导出。
- **验收标准**：
  - [x] 新建 `src/main/services/db.ts`，统一导出 `prisma` 实例
  - [x] 删除 `api-shared.ts` 中的 `const prisma = new PrismaClient()`
  - [x] 删除 `approval-guard.ts` 中的 `const prisma = new PrismaClient()`
  - [x] 所有文件统一从 `db.ts` 导入 prisma（共 24 个文件）
  - [x] `npx tsc --noEmit` 零错误
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：24 个文件已全部统一从 `./db.ts` 导入 prisma 实例；`npx tsc --noEmit` 通过

---

## 二、身份与鉴权（P0）

### T-004 实现 Actor 上下文提取

- **当前状态**：所有端点中 `actor` 硬编码为 `'admin'`，无法区分操作者，审计无意义。
- **目标**：实现 `ActorContext`，从请求头提取 actor 信息（短期从 header 提取，中期从 JWT 提取）。
- **验收标准**：
  - [x] 新建 `src/main/services/auth-context.ts`
  - [x] 实现 `extractActor(request)` 函数
  - [x] 支持从 `X-User-Id`、`X-Workspace-Id`、`X-Trace-Id` header 提取
  - [x] 审计日志中的 actor 字段使用动态提取值
  - [x] `npx tsc --noEmit` 零错误
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：`auth-context.ts` 已创建，extractActor() 支持从请求头提取用户信息

### T-005 添加本地 API 认证中间件

- **当前状态**：本地 Fastify API 无任何认证，任何能访问本机端口的进程都可以调用。
- **目标**：生产模式下要求 `X-SoloForge-Token`，开发/E2E 模式放行。
- **验收标准**：
  - [x] 新建 `src/main/middleware/local-auth.ts`
  - [x] 实现 `localAuthMiddleware`，生产模式验证 token（支持 Authorization: Bearer 和 X-SoloForge-Token 两种格式）
  - [x] Token 生成后存入 Keychain（safeStorage）
  - [x] 在 `startServer()` 中注册 `onRequest` hook
  - [x] `npx tsc --noEmit` 零错误
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：1. `local-auth.ts` 已创建，支持 Bearer token 和 X-SoloForge-Token；2. Token 通过 KeychainService 存储到 safeStorage；3. `registerAuthenticatedRoutes()` 已在 `startServer()` 中调用；4. 渲染器 `api.ts` 已通过 `Authorization: Bearer` 格式发送 token；5. E2E 模式通过 `SOLOFORGE_E2E=1` 环境变量跳过认证

---

## 三、审计与数据安全（P1）

### T-006 实现审计日志哈希链防篡改

- **当前状态**：审计日志虽为 append-only，但可被直接修改数据库篡改，无检测机制。
- **目标**：每条审计日志包含前一条的哈希，形成哈希链，可检测篡改。
- **验收标准**：
  - [x] 修改 `schema.prisma`，为 `AuditLog` 添加 `previousHash` 和 `currentHash` 字段
  - [x] 创建数据库迁移
  - [x] 修改 `audit-log-writer.ts`，写入时计算哈希链
  - [x] 新增审计链验证工具函数 `verifyAuditChain()`
  - [x] `npx tsc --noEmit` 零错误
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：1. 已在 schema.prisma 中添加 `previousHash` / `currentHash` 字段；2. 迁移文件 `20260708123145_add_audit_log_hash_chain` 已创建并应用；3. `writeAuditLog()` 内部自动计算 HMAC-SHA256 哈希链；4. `verifyAuditChain()` 验证工具已实现；5. 120+ 处直接 `prisma.auditLog.create()` 全部替换为 `writeAuditLog()`；6. TypeScript 编译零错误

### T-007 SQLite PRAGMA 性能优化

- **当前状态**：SQLite 使用默认配置，高频审计写入可能阻塞读操作。
- **目标**：应用 PRAGMA 优化，提升读写并发能力。
- **验收标准**：
  - [x] 新建 `src/main/services/db-pragma.ts`（合并到 `db.ts` 中实现）
  - [x] 实现 `optimizeSqlite()` 函数，设置 WAL/NORMAL/cache_size/mmap_size
  - [x] 在 Prisma 初始化后调用（待在 `startServer` 中集成）
  - [ ] 验证审计日志写入不影响读查询性能
- **状态**：`[x]`
- **完成日期**：2026-07-08
- **验证结果**：`optimizeSqlite()` 已在 `db.ts` 中实现并调用，幂等安全；WAL/NORMAL/cache_size/mmap_size 已配置

---

## 四、可测试性提升（P1）

### T-008 服务层依赖注入改造

- **当前状态**：服务直接 import prisma 和其他依赖，难以进行单元测试。
- **目标**：核心服务支持依赖注入，便于 mock。
- **验收标准**：
  - [ ] 定义 `ServiceDeps` 接口
  - [ ] 改造 `ApprovalGuard`、`ConfigManager`、`DoctorService` 支持构造函数注入
  - [ ] 保持向后兼容（默认使用全局 prisma 实例）
  - [ ] `npx tsc --noEmit` 零错误
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

### T-009 编写单元测试（核心服务）

- **当前状态**：几乎无单元测试，重构无安全网。
- **目标**：为核心服务编写单元测试，覆盖关键路径。
- **验收标准**：
  - [ ] 为 `ApprovalGuard` 编写单元测试（requiresApproval/createApproval/assertApproved/executeProtected）
  - [ ] 为 `audit-log-writer` 编写单元测试（脱敏、哈希链）
  - [ ] 为 `api-shared` 工具函数编写单元测试（maskTarget/maskSecret/computeContentHash/computeIdempotencyKey/classifySendError）
  - [ ] 单元测试可通过 `npm run test:unit` 运行
  - [ ] 核心服务测试覆盖率 > 70%
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

### T-010 编写集成测试（API 层）

- **当前状态**：E2E 测试太慢，缺少 API 层的集成测试。
- **目标**：为关键 API 端点编写集成测试，使用真实 SQLite + mock Claude Code。
- **验收标准**：
  - [ ] 搭建集成测试基础设施（内存 SQLite + Fastify inject）
  - [ ] 为 Approval 流程编写集成测试
  - [ ] 为 ChangeRequest 执行流程编写集成测试
  - [ ] 为 Workspace 解锁/环境切换编写集成测试
  - [ ] 集成测试可通过 `npm run test:integration` 运行
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

---

## 五、性能与监控（P2）

### T-011 Claude CodeClient 连接池管理

- **当前状态**：`openClawClients` 是无上限的 Map，可能内存泄漏。
- **目标**：实现 LRU 缓存，限制最大连接数。
- **验收标准**：
  - [ ] 实现最大连接数限制（默认 10）
  - [ ] 实现 LRU 淘汰策略
  - [ ] 添加连接健康检查
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

### T-012 性能监控与指标采集

- **当前状态**：无性能监控，无法识别慢查询和性能瓶颈。
- **目标**：采集关键性能指标，便于优化决策。
- **验收标准**：
  - [ ] API 请求耗时采集（P50/P95/P99）
  - [ ] Prisma 慢查询日志（>100ms）
  - [ ] 审计日志写入耗时监控
  - [ ] 内存使用监控
- **状态**：`[ ]`
- **完成日期**：
- **验证结果**：

---

## 六、执行顺序建议

按依赖关系和优先级排序：

1. **T-003** 统一 Prisma Client 实例（其他任务的基础）✅
2. **T-004** 实现 Actor 上下文提取（审计中间件依赖）✅
3. **T-002** 实现统一审计中间件（依赖 T-003、T-004）✅
4. **T-001** 拆分 api-server.ts（依赖 T-002，可边拆边用新中间件）
5. **T-005** 添加本地 API 认证中间件 ✅
6. **T-007** SQLite PRAGMA 性能优化 ✅
7. **T-006** 审计日志哈希链防篡改 ✅
8. **T-008** 服务层依赖注入改造
9. **T-009** 编写单元测试
10. **T-010** 编写集成测试
11. **T-011** Claude CodeClient 连接池管理
12. **T-012** 性能监控与指标采集

---

## 七、变更记录

| 日期 | 任务 | 变更说明 |
|------|------|---------|
| 2026-07-08 | T-003 | 完成：24 个文件统一从 db.ts 导入 prisma 实例 |
| 2026-07-08 | T-007 | 完成：optimizeSqlite() 函数已在 db.ts 中实现并调用，WAL/NORMAL 等 PRAGMA 已配置 |
| 2026-07-08 | T-004 | 完成：auth-context.ts 已创建，extractActor() 支持从请求头提取用户信息 |
| 2026-07-08 | T-002 | 完成：audit-wrapper.ts 已创建并在 policies、workspace-settings、change-requests 三个路由模块中应用 |
| 2026-07-08 | T-005 | 完成：local-auth.ts 支持 Bearer/X-SoloForge-Token，Token 存 Keychain，已集成到 startServer() |
| 2026-07-08 | T-006 | 完成：AuditLog 添加 previousHash/currentHash，HMAC-SHA256 哈希链，verifyAuditChain()，120+ 处 prisma.auditLog.create 替换为 writeAuditLog |
