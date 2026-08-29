# SoloForge 项目规则（Project AGENTS.md）

> 本文件定义 SoloForge 项目的开发规范、安全约束、工作流程。
> 优先级：项目规则 > 全局规则（~/.config/opencode/AGENTS.md）

---

## 0. 项目定位与约束（硬性要求）

### 内部使用约束
- **仅内部使用**：不做开源发布、不做外部多租户、不做支付/对公网自助注册
- **默认关闭遥测**：禁止统计/崩溃上报，如需要必须可配置且默认 OFF
- **禁止自动更新**：或默认 OFF，避免供应链风险；如实现，必须支持离线包安装与校验
- **敏感信息保护**：token/password/edge token/provider key 必须存系统 Keychain（Electron safeStorage），禁止明文落盘

### 安全优先策略
1. **最小权限**：Agent 默认无高危工具，必须显式授权
2. **强隔离**：本地数据留在本机，远程仅做编排/同步（视配置）
3. **人工手刹**：所有高危动作必须审批（Approval）
4. **全量审计**：所有关键动作记录到 append-only 审计日志（AuditLog）
5. **密钥安全**：token/API key 仅存 Keychain，UI 仅展示掩码

---

## 1. 技术栈与架构（必须遵循）

### 核心技术
- **桌面框架**：Electron 28 + React 18 + TypeScript + Vite
- **UI**：Tailwind CSS（无外部 UI 库，保持轻量）
- **数据库**：SQLite + Prisma ORM
- **API 服务器**：Fastify v4（主进程内嵌，随机端口）
- **凭证存储**：Electron safeStorage（OS 级加密，跨平台）
- **打包**：electron-builder（Windows NSIS / macOS DMG / Linux AppImage）

### 架构约束
```
┌─────────────────────────────────────────┐
│ Electron Main Process                   │
│  ├─ API Server (Fastify, 随机端口)      │
│  ├─ Keychain (safeStorage)              │
│  ├─ Approval Guard (审批规则引擎)       │
│  ├─ Claude Code Client (REST + WebSocket)  │
│  ├─ Harness Controller (多 Worker 编排)    │
│  ├─ Hermes Adapter（Hermes Worker）      │
│  ├─ Claude Code Adapter（存根）         │
│  └─ Host Agent Adapter（存根）           │
└─────────────────────────────────────────┘
              ↕ IPC (preload)
┌─────────────────────────────────────────┐
│ Renderer Process (React)                │
│  ├─ 45+ Pages (Dashboard, Tickets, etc.)│
│  └─ API Client (fetch via getApiPort()) │
└─────────────────────────────────────────┘
```

**关键约束**：
- Renderer 只能通过本地 API 访问数据，禁止直接操作 SQLite
- 所有 IPC 通信必须通过 preload 暴露的 `electronAPI`
- 开发模式固定端口 13789，生产模式随机端口

---

## 2. 数据模型与安全约束（10 个核心表）

### 表结构（Prisma Schema）

| 表名 | 用途 | 安全约束 |
|---|---|---|
| **Role** | 岗位（Support/PM/Dev/QA/Ops） | 包含 defaultPrompt、outputSchema、riskLevel |
| **Agent** | 员工 | 绑定 Role，配置 model、runtime、enabled |
| **Tool** | 工具 | riskClass（LOW/MEDIUM/HIGH/CRITICAL） |
| **AgentTool** | 授权矩阵 | 最小权限：Agent 默认无高危工具 |
| **Ticket** | 工单 | 状态流：INBOX → SPEC → DEV → TEST → DELIVERY → DONE |
| **Artifact** | 交付物 | 类型：PRD/PLAN/CODE_CHANGE/TEST_CASES/DEPLOY/ROLLBACK/DELIVERY_LIST/CLIENT_MSG |
| **Approval** | 审批 | 高危动作类型：SEND_EXTERNAL/MERGE_MAIN/DEPLOY_PROD/EXPORT_DATA/PURCHASE/CHANGE_CONFIG/ROTATE_TOKEN |
| **AuditLog** | 审计日志 | **append-only**（禁止 update/delete），敏感字段必须 mask |
| **ConnectionProfile** | 连接配置 | Local/Remote，authMode（token/password/trusted-proxy） |
| **ConfigSnapshot** | 配置快照 | 每次 apply 前保存，支持回滚 |

### 硬性约束
1. **AuditLog 禁止修改/删除**：只允许 `prisma.auditLog.create()`，禁止 `update()` 和 `delete()`
2. **敏感字段 mask**：audit_logs 中的 token/password/key 必须 mask，不记录明文
3. **trace_id 贯穿**：每次操作生成 uuid，贯穿调用链并写入 audit_logs

---

## 3. 风控规则（必须硬性落地）

### 高危动作必须审批

| 动作类型 | 说明 | 审批要求 |
|---|---|---|
| `SEND_EXTERNAL` | 对外发送（邮件/API/webhook） | PENDING → APPROVED 才允许执行 |
| `MERGE_MAIN` | 合并主干 | 同上 |
| `DEPLOY_PROD` | 生产部署 | 同上 |
| `EXPORT_DATA` | 导出数据 | 同上 |
| `PURCHASE` | 购买操作 | 同上 |
| `CHANGE_CONFIG` | OpenClaw 配置变更 | 同上 |
| `ROTATE_TOKEN` | 轮换 token | 同上 |

### 审批流程（强制）
1. 创建 `Approval` 记录（status=PENDING）
2. 人工审批（status=APPROVED/REJECTED）
3. 只有 APPROVED 才允许执行
4. 执行后写入 `AuditLog`（包含结果）

### 失败处理
- 任意远程同步失败不影响本地数据完整性
- 标记"待同步"，并可重试
- 写入 audit_logs 记录失败原因

---

## 4. OpenClaw 双连接（Local + Remote）

### Connection Profiles

#### Local 默认配置
```json
{
  "name": "Local OpenClaw",
  "type": "local",
  "baseUrl": "http://127.0.0.1:18789",
  "wsUrl": "ws://127.0.0.1:18789",
  "authMode": "token",
  "isActive": true
}
```

#### Remote 配置（通过 OpenResty 反代）
```json
{
  "name": "Remote OpenClaw",
  "type": "remote",
  "baseUrl": "https://api.<domain>",
  "wsUrl": "wss://api.<domain>",
  "authMode": "token | password | trusted-proxy",
  "isActive": false
}
```

### 凭证存储约束
- **token/password/X-Edge-Token** 必须存 Keychain（safeStorage）
- SQLite 只存引用/标识（如 `credentialKey`）
- UI 仅显示 mask（如 `sk-****abcd`）

### OpenClawClient 设计

**必须实现**：
1. **trace_id 生成**：每次操作生成 uuid，贯穿调用链
2. **HTTP ping/health**：检测可达性
3. **WebSocket**：handshake + 长连接保活 + 自动重连
4. **降级策略**：WS 不可用时回退 HTTP（仅 ping/基础查询）
5. **鉴权**：支持 token/password/trusted-proxy 三种模式
6. **审计**：所有调用写入 audit_logs

---

## 5. OpenClaw 配置中心（客户端统一管理）

### 必须覆盖的配置项

#### 1. 模型与路由（重点）
- `defaultModel`：默认模型
- `fallbacks`：备用模型列表
- `allowlist`：可用模型清单
- 可选：按 Role/Agent 的模型覆盖映射

#### 2. hooks
- `enabled`：是否启用
- `token`：webhook token（存 Keychain）
- `path`：webhook 路径
- `mappings`：事件映射

#### 3. tools 策略
- `allow`：允许的工具列表
- `deny`：禁止的工具列表（高危默认 deny）

#### 4. gateway 安全
- `auth.mode`：鉴权模式
- `trustedProxies`：信任的代理 IP/网段
  - **输入校验**：只允许精确 IP 或小网段
  - **禁止**：`0.0.0.0/0` 等危险值

### 编辑体验

**80% 表单 + 20% Raw JSON**
- 表单：常用配置项可视化编辑
- Raw JSON：
  - 基础校验（JSON 结构/必填字段）
  - diff 预览（前后对比，使用 jsondiffpatch）
  - 生成 patch（可复制的 JSON Patch）

### 应用机制（必须）

1. **写入限频**：60 秒内最多 3 次写入，超限需退避并显示 retryAfter
2. **apply 流程**：
   - 保存 lastKnownGood（本地快照 + hash）
   - 通过 OpenClaw 的配置写入能力（config.patch/config.apply）
   - 回读校验（get config）
   - 写入 audit_logs
3. **回滚**：
   - 属于高危动作，必须走 Approval(CHANGE_CONFIG)
   - 恢复到 lastKnownGood 快照

### 密钥/敏感值（必须）

- **只存 Keychain**：OpenClaw token/password、X-Edge-Token、hooks token、provider keys
- **UI 仅显示 mask**：如 `sk-****abcd`
- **变更必须二次确认**：+ Approval(ROTATE_TOKEN/CHANGE_CONFIG)
- **audit_logs 仅记录字段名与 mask**：不记录明文

---

## 6. 开发规范

### 代码风格
- **TypeScript strict mode**：禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- **Tailwind CSS only**：无外部 UI 库
- **中文注释、中文文档、中文 UI 标签**
- **代码标识符**：英文（遵循既有约定）

### 错误处理
- **边界条件/空值/异常链路要覆盖**
- **错误信息用中文且可定位**（包含必要上下文，但不含敏感信息）
- **禁止空 catch 块**：`catch(e) {}` 是反模式

### 数据库操作
- **使用 Prisma Client**
- **AuditLog 禁止 update/delete**（append-only）
- **所有关键操作写入审计日志**

### API 端点规范
- **所有端点必须有类型定义**
- **高危操作调用 approval-guard 检查审批**
- **写入 AuditLog**（包含 trace_id、actor、action、before/after）

---

## 7. 工作流程（Ultrawork 模式）

### Phase 0: 意图识别（每次必做）

**在开始任何工作前，必须明确**：
1. 用户的真实意图是什么？（不是表面请求）
2. 这是研究/实现/修复/评估？
3. 需要哪些上下文？

**触发条件**：
- 外部库/源提到 → 立即启动 `librarian` 背景任务
- 2+ 模块涉及 → 立即启动 `explore` 背景任务
- 模糊/复杂请求 → 先咨询 Metis 再规划
- 工作计划创建 → 调用 Momus 审查

### Phase 1: 探索与研究（并行执行）

**工具选择**：
- `explore` agent — 内部代码库搜索（免费）
- `librarian` agent — 外部文档/示例搜索（便宜）
- `oracle` agent — 架构咨询（昂贵，只在必要时用）

**并行执行（默认行为）**：
```typescript
// 正确：并行启动多个背景任务
task(subagent_type="explore", run_in_background=true, load_skills=[], description="查找认证实现", prompt="...")
task(subagent_type="explore", run_in_background=true, load_skills=[], description="查找错误处理模式", prompt="...")
task(subagent_type="librarian", run_in_background=true, load_skills=[], description="查找 JWT 安全文档", prompt="...")
// 继续工作，稍后用 background_output 收集结果
```

### Phase 2: 实施（委托优先）

**委托决策表**：

| 任务类型 | 委托目标 | 原因 |
|---|---|---|
| 架构决策 | `oracle` | 多系统权衡、不熟悉的模式 |
| 自我审查 | `oracle` | 完成重要实现后 |
| 困难调试 | `oracle` | 2+ 次失败尝试后 |
| 前端工作 | `category="visual-engineering", load_skills=["ui-ux-pro-max"]` | 领域优化模型 |
| 复杂逻辑 | `category="ultrabrain"` | 高难度任务 |
| 快速修复 | `category="quick", load_skills=["soloforge-electron-desktop"]` | 简单任务 |

**委托提示词结构（强制 6 部分）**：
```
1. TASK: 原子化、具体目标（一次一个动作）
2. EXPECTED OUTCOME: 具体交付物 + 成功标准
3. REQUIRED TOOLS: 显式工具白名单（防止工具泛滥）
4. MUST DO: 详尽要求 - 不留任何隐含内容
5. MUST NOT DO: 禁止动作 - 预判并阻止越界行为
6. CONTEXT: 文件路径、现有模式、约束
```

**会话连续性（强制）**：
- 每个 `task()` 返回 `session_id`，**必须使用**
- 任务失败/不完整 → `task(session_id="{id}", prompt="修复: {具体错误}")`
- 后续问题 → `task(session_id="{id}", prompt="另外: {问题}")`
- 多轮对话 → 始终使用 `session_id`，永不重新开始

### Phase 3: 验证（强制证据）

**任务未完成的标志**：
- [ ] 文件编辑 → `lsp_diagnostics` 清洁
- [ ] 构建命令 → 退出码 0
- [ ] 测试运行 → 通过（或明确说明预存在的失败）
- [ ] 委托 → 收到并验证代理结果

**无证据 = 未完成**

---

## 8. 验证清单（每次修改后必做）

### 类型检查
```bash
npx tsc --noEmit
```
**要求**：零错误

### LSP 诊断
```bash
# 对修改的文件运行
lsp_diagnostics(filePath="...", severity="error")
```
**要求**：无诊断错误

### 开发服务器
```bash
npm run dev
```
**要求**：
- Vite 启动成功（http://localhost:5173）
- Fastify 启动成功（http://127.0.0.1:13789 或随机端口）
- Electron 窗口打开

### 生产构建
```bash
npm run build
```
**要求**：
- `tsc` 成功
- `vite build` 成功
- `electron-builder` 成功生成安装包

### 功能测试
- 相关页面功能正常
- API 端点返回预期结果
- 审批流程正常工作
- 审计日志正确记录

---

## 9. 禁止事项（零容忍）

### 代码质量
- ❌ **类型错误抑制**：`as any`、`@ts-ignore`、`@ts-expect-error`
- ❌ **空错误处理**：`catch(e) {}`
- ❌ **删除失败测试**：修复代码，不是测试

### 安全
- ❌ **明文存储敏感信息**：必须用 Keychain
- ❌ **SQL 拼接**：必须参数化
- ❌ **日志泄露敏感信息**：必须 mask

### 工作流程
- ❌ **未经探索就实施**：对单行拼写错误或明显语法错误启动代理
- ❌ **霰弹枪调试**：随机更改希望某些东西能工作
- ❌ **3 次连续失败后继续**：必须停止、回滚、咨询 Oracle

### 审计
- ❌ **修改/删除 AuditLog**：只允许 create
- ❌ **跳过审批**：高危动作必须走 Approval 流程

---

## 10. 故障恢复

### 修复失败时

1. **修复根本原因**，不是症状
2. **每次修复尝试后重新验证**
3. **永不霰弹枪调试**（随机更改）

### 3 次连续失败后

1. **立即停止**所有进一步编辑
2. **回滚**到最后已知工作状态（git checkout / 撤消编辑）
3. **记录**尝试的内容和失败的内容
4. **咨询 Oracle**，提供完整失败上下文
5. 如果 Oracle 无法解决 → **询问用户**再继续

**永不**：
- 将代码留在损坏状态
- 继续希望它能工作
- 删除失败的测试以"通过"

---

## 11. 扩展新功能指南

### 添加新页面

1. **探索现有模式**：
   ```typescript
   task(subagent_type="explore", run_in_background=true, load_skills=[], 
        description="查找页面模式", 
        prompt="查找 src/renderer/pages/ 中的页面实现模式...")
   ```

2. **创建页面文件**：`src/renderer/pages/NewPage.tsx`
   - 使用 `getApiPort()` 获取 API 端口
   - 遵循现有页面结构（useState、useEffect、fetch）

3. **添加路由**：在 `App.tsx` 中添加路由

4. **添加导航链接**：在 `App.tsx` 的导航栏添加链接

5. **验证**：
   - `npx tsc --noEmit`
   - `lsp_diagnostics`
   - 浏览器测试

### 添加新 API 端点

1. **探索现有端点**：
   ```typescript
   task(subagent_type="explore", run_in_background=true, load_skills=[], 
        description="查找 API 端点模式", 
        prompt="查找 src/main/services/api-server.ts 中的端点实现...")
   ```

2. **在 `api-server.ts` 添加路由**：
   ```typescript
   fastify.post('/api/new-endpoint', async (request) => {
     const data = request.body as NewEndpointRequest
     // 高危操作检查审批
     // 使用 Prisma Client 操作数据库
     // 写入 AuditLog
     return result
   })
   ```

3. **类型定义**：在相关页面添加接口定义

4. **验证**：
   - `npx tsc --noEmit`
   - `lsp_diagnostics`
   - curl 测试端点

### 修改数据库 Schema

1. **编辑 `prisma/schema.prisma`**

2. **创建迁移**：
   ```bash
   npx prisma migrate dev --name <migration_name>
   ```

3. **更新种子数据**（如需要）：编辑 `prisma/seed.ts`

4. **运行种子**：
   ```bash
   npx prisma db seed
   ```

5. **更新相关代码**：
   - API 端点
   - 前端页面
   - 类型定义

6. **验证**：
   - 数据库迁移成功
   - 种子数据正确
   - 相关功能正常

---

## 12. OpenResty 反代配置（内部部署参考）

### 最小配置样例

```nginx
upstream openclaw_backend {
    server 127.0.0.1:18789;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # WebSocket 支持
    location / {
        proxy_pass http://openclaw_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 可选：第二道门禁（X-Edge-Token）
        # set $edge_token $http_x_edge_token;
        # if ($edge_token != "your-secret-token") {
        #     return 403;
        # }
    }
}
```

### 安全检查清单

- [ ] 公网只开 443 端口
- [ ] OpenClaw 18789 不直出
- [ ] 使用 HTTPS/WSS
- [ ] 配置 `trustedProxies`（精确 IP，禁止 `0.0.0.0/0`）
- [ ] 可选：配置 X-Edge-Token 第二道门禁
- [ ] WebSocket 超时足够长（24h+）
- [ ] 清理并重建转发头，避免 XFF 伪造

---

## 13. 项目状态

### ✅ 已完成（M0-M12）
- [x] 基础设施层（Electron + React + Vite + TypeScript + Prisma + safeStorage）
- [x] 工单管理（看板 + 详情页）
- [x] 团队管理（Role/Agent/Tool CRUD + 授权矩阵）
- [x] 审批流程（审批中心 + approval-guard）
- [x] 审计系统（全链路日志 + 过滤查看）
- [x] Claude Code 连接（Local + Remote + 诊断）
- [x] 配置中心（表单/JSON 编辑 + Diff + 回滚 + 快照）
- [x] 打包（electron-builder - Linux AppImage 已验证，Windows/macOS 待平台验证）
- [x] M8 Workspace 隔离（多工作区 + Keychain 命名空间）
- [x] M9 Jobs 执行引擎（幂等 + 重试 + 监控）
- [x] M10 Policy-as-Code（四大策略 + PolicyGuard）
- [x] M11 Workspace 分级与变更管理（Desired/Actual Snapshot + Drift Detection + Change Request + Outbox）
- [x] M12 配置中心增强版（Draft/Published 三态 + Undo/Redo + 模型分组 + 网关表单化）
- [x] Host Agent / Remote Runner Center（Bootstrap + 心跳 + 动作派发）
- [x] Release & Upgrade Center（版本目录 + 升级计划 + Dry Run + Rollback）
- [x] 部署管理（4 种部署模式 + 服务生命周期）
- [x] 通讯增强（模板 + 联系人绑定 + 幂等重试）
- [x] Dashboard 总控首页（高信息密度聚合 + Health Score）
- [x] Hermes Worker 系统（Harness 编排）
- [x] 多 Worker 类型支持（Harness + Hermes/Claude Code/Host Agent 适配器）
- [x] 诊断中心（Doctor + Alerts + Health Monitoring）
- [x] 事件中心（Activity Feed + Event Records）

### 🚧 待实现（1.0 前需完成）
- [ ] E2E 测试覆盖（当前仅 Dashboard 基线，需扩展至 Jobs/Policy/HostAgents）
- [ ] 多语言支持（i18next 已引入，UI 字符串仍需提取）
- [ ] 主题切换（基础实现存在，非生产就绪）
- [ ] 插件系统（数据模型 + 路由 + UI 存在，动态加载器刚实现）
- [ ] 数据导入/导出（部分存在，缺统一 UI 页面）
- [ ] Windows/macOS 平台构建验证

---

## 14. 关键文件速查

| 文件 | 用途 |
|---|---|
| `src/main/index.ts` | Electron 主进程入口 |
| `src/main/services/api-server.ts` | Fastify API 服务器（60+ 端点） |
| `src/main/services/keychain.ts` | 凭证存储（safeStorage） |
| `src/main/services/approval-guard.ts` | 审批规则引擎 |
| `src/main/services/openclaw-client.ts` | Claude Code REST/WS 客户端 |
| `src/main/services/config-manager.ts` | 配置管理（限频、diff、快照、漂移检测） |
| `src/main/services/harness-controller.ts` | 任务编排（Harness，多 Worker 适配器） |
| `src/main/services/worker-registry.ts` | Worker 注册中心（Hermes/Claude Code/Host Agent） |
| `src/main/services/worker-adapter.ts` | Worker 适配器接口（统一抽象） |
| `src/main/services/hermes-adapter.ts` | Hermes Worker 适配器 |
| `src/main/services/claude-code-adapter.ts` | Claude Code Worker 适配器（存根） |
| `src/main/services/host-agent-adapter.ts` | Host Agent Worker 适配器（存根） |
| `src/main/services/job-executor.ts` | Jobs 执行引擎 |
| `src/main/services/policy-guard.ts` | Policy-as-Code 策略守卫 |
| `src/main/services/doctor-service.ts` | 诊断中心（健康检查 + 告警） |
| `src/main/services/retry-service.ts` | 重试服务（指数退避 + 幂等） |
| `src/main/services/deployment-manager.ts` | 部署管理器（4 种部署模式） |
| `src/main/services/release-upgrade-service.ts` | Release & Upgrade 服务 |
| `src/preload/index.ts` | IPC 桥接（暴露 electronAPI） |
| `src/renderer/App.tsx` | React 路由配置（45+ 页面） |
| `src/renderer/lib/api.ts` | getApiPort() 工具函数 |
| `prisma/schema.prisma` | 数据库 schema（50+ 张表） |
| `prisma/seed.ts` | 种子数据 |
| `package.json` | 依赖、脚本、electron-builder 配置 |
| `vite.config.ts` | Vite + Electron 插件配置 |
| `.kiro/skills/soloforge-electron-desktop.md` | 项目专用技能文件 |

---

## 15. 联系与支持

- **项目路径**：`E:\forever\soloforge\`
- **数据库**：`E:\forever\soloforge\prisma\dev.db`
- **构建输出**：`E:\forever\soloforge\release/`
- **开发服务器**：Vite `http://localhost:5173` + API `http://127.0.0.1:13789`

---

**记住**：SoloForge 是一个 **Electron 桌面应用**，不是网页应用。所有修改必须同时考虑主进程（Node.js）和渲染进程（React）的协同工作。安全优先，审批必须，审计完整。
