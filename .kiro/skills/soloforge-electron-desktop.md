# SoloForge Electron Desktop App 开发技能

## 触发条件

当用户请求以下任何操作时，自动加载此技能：

- 修改、增强、调试 SoloForge 项目
- 添加新功能、页面、API 端点
- 修复 bug、优化性能
- 数据库 schema 变更
- Electron 主进程/渲染进程相关工作
- 提到 "SoloForge"、"Team OS"、"AI 员工"、"工单"、"审批"、"审计"

## 项目概述

**SoloForge（独匠工坊）** 是一个 **Electron 桌面应用**，用于管理 AI 团队与员工，实现工单闭环、审批流程、审计追踪，并与 OpenClaw（行动网关）联动。

### 核心特性
- **工单管理**：INBOX → SPEC → DEV → TEST → DELIVERY → DONE 全流程
- **团队管理**：Role（岗位）、Agent（员工）、Tool（工具）、最小权限授权矩阵
- **审批流程**：高危操作必须人工审批（SEND_EXTERNAL、MERGE_MAIN、DEPLOY_PROD、CHANGE_CONFIG 等）
- **审计系统**：append-only 审计日志，trace_id 全链路追踪
- **OpenClaw 连接**：支持本地（127.0.0.1）和远程（HTTPS/WSS）双连接
- **配置中心**：可视化编辑 OpenClaw 配置（模型、hooks、tools、安全策略），支持 diff、回滚、快照

## 技术栈

### 前端
- **框架**：React 18 + TypeScript + Vite
- **路由**：react-router-dom v7
- **样式**：Tailwind CSS（无外部 UI 库）
- **拖拽**：@dnd-kit（工单看板）
- **构建**：Vite + vite-plugin-electron

### 后端（Electron 主进程）
- **API 服务器**：Fastify v4（内置 CORS）
- **数据库**：SQLite + Prisma ORM
- **凭证存储**：Electron safeStorage（OS 级加密，跨平台）
- **WebSocket**：ws 库（OpenClaw 连接）

### 打包
- **electron-builder**：支持 Windows NSIS、macOS DMG、Linux AppImage

## 项目结构

```
E:\forever\soloforge\
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts            # 主进程入口
│   │   └── services/
│   │       ├── api-server.ts   # Fastify API（20+ 端点）
│   │       ├── keychain.ts     # 凭证存储（safeStorage）
│   │       ├── approval-guard.ts  # 审批规则引擎
│   │       ├── openclaw-client.ts # OpenClaw REST/WS 客户端
│   │       └── config-manager.ts  # 配置管理（限频、diff、快照）
│   ├── preload/
│   │   └── index.ts            # 预加载脚本（IPC 桥接）
│   └── renderer/               # React 渲染进程
│       ├── App.tsx             # 路由配置（8 个页面）
│       ├── main.tsx            # React 入口
│       ├── lib/
│       │   └── api.ts          # getApiPort() 工具函数
│       ├── pages/              # 8 个页面（全部完成）
│       │   ├── Dashboard.tsx
│       │   ├── TicketBoard.tsx
│       │   ├── TicketDetail.tsx
│       │   ├── TeamManagement.tsx
│       │   ├── ApprovalCenter.tsx
│       │   ├── AuditLogs.tsx
│       │   ├── ConnectionSettings.tsx
│       │   └── ConfigCenter.tsx
│       └── components/
│           ├── TicketCard.tsx
│           └── SortableTicketCard.tsx
├── prisma/
│   ├── schema.prisma           # 10 个表
│   ├── seed.ts                 # 种子数据
│   └── dev.db                  # SQLite 数据库
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 数据库 Schema（10 个核心表）

### 1. Role（岗位）
- 5 个默认岗位：Support、PM&Writer、Dev、QA、Ops
- 字段：name, description, defaultPrompt, outputSchema, riskLevel

### 2. Agent（员工）
- 绑定 Role，配置 model、runtime（cloud/local）、enabled
- 关联：tools（通过 AgentTool）、tickets

### 3. Tool（工具）
- 字段：name, scope, riskClass（LOW/MEDIUM/HIGH/CRITICAL）, configSchema

### 4. AgentTool（授权矩阵）
- 最小权限：Agent 默认无高危工具，必须显式授权
- 字段：agentId, toolId, config

### 5. Ticket（工单）
- 状态流：INBOX → SPEC → DEV → TEST → DELIVERY → DONE
- 字段：title, source, status, priority, assigneeAgentId, dueAt, customerMeta
- 关联：assignee（Agent）、artifacts、approvals、auditLogs

### 6. Artifact（交付物）
- 类型：PRD、PLAN、CODE_CHANGE、TEST_CASES、DEPLOY、ROLLBACK、DELIVERY_LIST、CLIENT_MSG
- 字段：ticketId, type, content（Markdown）, version

### 7. Approval（审批）
- 高危动作类型：SEND_EXTERNAL、MERGE_MAIN、DEPLOY_PROD、EXPORT_DATA、PURCHASE、CHANGE_CONFIG、ROTATE_TOKEN
- 字段：ticketId, actionType, status（PENDING/APPROVED/REJECTED）, requestedBy, approvedBy, decidedAt

### 8. AuditLog（审计日志）
- **append-only**（禁止 update/delete）
- 字段：ticketId, traceId, actor, action, targetType, targetId, before, after, metadata

### 9. ConnectionProfile（连接配置）
- 支持本地和远程 OpenClaw
- 字段：name, type（local/remote）, baseUrl, wsUrl, authMode（token/password/trusted-proxy）, isActive

### 10. ConfigSnapshot（配置快照）
- 字段：profileId, config（JSON）, appliedBy, appliedAt

## API 端点（Fastify）

### Roles
- `GET /api/roles` — 获取所有岗位
- `POST /api/roles` — 创建岗位
- `PUT /api/roles/:id` — 更新岗位

### Agents
- `GET /api/agents` — 获取所有员工
- `POST /api/agents` — 创建员工
- `PUT /api/agents/:id` — 更新员工
- `DELETE /api/agents/:id` — 删除员工

### Tools
- `GET /api/tools` — 获取所有工具

### AgentTools
- `GET /api/agent-tools` — 获取授权矩阵
- `POST /api/agent-tools` — 授权工具
- `PUT /api/agent-tools/:id` — 更新授权
- `DELETE /api/agent-tools/:id` — 撤销授权

### Tickets
- `GET /api/tickets` — 获取所有工单（包含 assignee、artifacts、approvals）
- `POST /api/tickets` — 创建工单（自动填充默认值：status='INBOX', source='manual', priority='MEDIUM', customerMeta='{}'）
- `PUT /api/tickets/:id` — 更新工单

### Artifacts
- `POST /api/artifacts` — 创建交付物

### Approvals
- `GET /api/approvals?status=PENDING` — 获取审批列表（可按状态过滤）
- `POST /api/approvals` — 创建审批
- `PUT /api/approvals/:id` — 审批决策（更新 status、approvedBy、decidedAt）

### AuditLogs
- `GET /api/audit-logs?ticketId=&traceId=&actor=` — 获取审计日志（支持过滤）
- `POST /api/audit-logs` — 写入审计日志

### ConnectionProfiles
- `GET /api/profiles` — 获取所有连接配置
- `POST /api/profiles` — 创建连接配置
- `PUT /api/profiles/:id` — 更新连接配置
- `DELETE /api/profiles/:id` — 删除连接配置
- `GET /api/profiles/:id/credentials` — 获取凭证（掩码显示）

### OpenClaw
- `POST /api/openclaw/ping` — 健康检查
- `POST /api/openclaw/connect` — 建立连接
- `POST /api/openclaw/disconnect` — 断开连接
- `GET /api/openclaw/:profileId/status` — 获取连接状态
- `GET /api/openclaw/:profileId/config` — 获取配置

### Config
- `POST /api/config/apply` — 应用配置（限频：60 秒 3 次）
- `POST /api/config/rollback` — 回滚配置
- `GET /api/config/snapshots` — 获取快照历史
- `GET /api/config/rate-limit` — 获取限频状态

### Health
- `GET /api/health` — 健康检查

## 关键实现细节

### 1. API 端口管理
- **开发模式**：固定端口 13789（`!app.isPackaged`）
- **生产模式**：随机端口（`listen(0)`）
- **前端获取端口**：`src/renderer/lib/api.ts` 的 `getApiPort()` 函数
  - Electron 环境：通过 `window.electronAPI.getApiPort()` IPC 获取
  - 浏览器开发模式：返回固定端口 13789

### 2. 凭证存储（keychain.ts）
- **使用 Electron safeStorage**（不再使用 keytar）
- **加密方式**：
  - Windows: DPAPI
  - macOS: Keychain
  - Linux: libsecret
- **存储位置**：`{userData}/SoloForge-credentials.json`（加密后的 base64 字符串）
- **API**：
  - `setCredential(key, value)` — 加密存储
  - `getCredential(key)` — 解密读取
  - `deleteCredential(key)` — 删除凭证

### 3. 审批流程（approval-guard.ts）
- **高危动作必须审批**：
  - `SEND_EXTERNAL` — 对外发送
  - `MERGE_MAIN` — 合并主干
  - `DEPLOY_PROD` — 生产部署
  - `EXPORT_DATA` — 导出数据
  - `PURCHASE` — 购买操作
  - `CHANGE_CONFIG` — 配置变更
  - `ROTATE_TOKEN` — 轮换 token
- **流程**：
  1. 创建 Approval（status=PENDING）
  2. 人工审批（status=APPROVED/REJECTED）
  3. 只有 APPROVED 才允许执行
  4. 写入 AuditLog

### 4. 配置中心（config-manager.ts）
- **限频**：60 秒内最多 3 次写入
- **功能**：
  - 表单编辑 + Raw JSON 编辑器
  - Diff 对比（jsondiffpatch）
  - Apply / Rollback
  - 历史快照
- **配置项**：
  - 模型与路由（defaultModel、fallbacks、allowlist）
  - hooks（enabled、token、path、mappings）
  - tools 策略（allow/deny）
  - gateway 安全（auth.mode、trustedProxies）

### 5. OpenClaw 连接（openclaw-client.ts）
- **双连接支持**：
  - Local: `http://127.0.0.1:18789` / `ws://127.0.0.1:18789`
  - Remote: `https://api.<domain>` / `wss://api.<domain>`
- **鉴权模式**：
  - `token` — Bearer token
  - `password` — Basic auth
  - `trusted-proxy` — X-Edge-Token header
- **功能**：
  - REST API 调用（自动带 trace_id、鉴权头）
  - WebSocket 连接（自动重连、降级）
  - 健康检查、配置获取

## 开发规范

### 代码风格
- **TypeScript strict mode**
- **Tailwind CSS only**（无外部 UI 库）
- **中文注释、中文文档、中文 UI 标签**
- **代码标识符**：英文（遵循既有约定）

### 数据库操作
- **使用 Prisma Client**
- **AuditLog 禁止 update/delete**（append-only）
- **所有关键操作写入审计日志**

### 安全原则
1. **最小权限**：Agent 默认无高危工具
2. **强隔离**：本地数据留在本机
3. **人工手刹**：高危动作必须审批
4. **全量审计**：append-only 日志
5. **密钥安全**：token/API key 仅存 safeStorage，UI 仅展示掩码

### 错误处理
- **边界条件/空值/异常链路要覆盖**
- **错误信息用中文且可定位**（包含必要上下文，但不含敏感信息）
- **禁止空 catch 块**

### 类型安全
- **禁止 `as any`、`@ts-ignore`、`@ts-expect-error`**
- **所有 API 响应必须有类型定义**

## 常见任务

### 添加新页面
1. 在 `src/renderer/pages/` 创建 `.tsx` 文件
2. 使用 `getApiPort()` 获取 API 端口
3. 在 `App.tsx` 添加路由
4. 在导航栏添加链接

### 添加新 API 端点
1. 在 `src/main/services/api-server.ts` 添加路由
2. 使用 Prisma Client 操作数据库
3. 高危操作调用 `approval-guard.ts` 检查审批
4. 写入 `AuditLog`

### 修改数据库 Schema
1. 编辑 `prisma/schema.prisma`
2. 运行 `npx prisma migrate dev --name <migration_name>`
3. 更新 `prisma/seed.ts`（如需要）
4. 运行 `npx prisma db seed`

### 调试
- **开发模式**：`npm run dev`
  - Vite: `http://localhost:5173`
  - API: `http://127.0.0.1:13789`
  - Electron 自动启动
- **类型检查**：`npx tsc --noEmit`
- **LSP 诊断**：`lsp_diagnostics` 工具
- **浏览器 DevTools**：Electron 窗口内 F12

### 打包
- **构建**：`npm run build`
- **输出**：`release/0.1.0/SoloForge Setup 0.1.0.exe`（Windows）
- **验证**：
  1. `npx tsc --noEmit` — 零错误
  2. `npm run build` — 成功生成安装包
  3. 手动测试安装包

## 已知问题与解决方案

### Fastify 版本
- **必须使用 Fastify v4**（v5 与 Electron 28 的 Node.js 不兼容）
- **`@fastify/cors` 必须使用 v9**（v10 需要 Fastify 5）

### keytar 替换
- **已弃用 keytar**（Windows 文件锁问题）
- **使用 Electron safeStorage**（内置，零依赖）

### 端口冲突
- 开发时如遇 `EADDRINUSE: address already in use 127.0.0.1:13789`
- 查找进程：`netstat -ano | grep 13789`
- 杀死进程：`taskkill //F //PID <pid>`

### CORS
- 浏览器开发模式需要 CORS
- Electron 渲染进程绕过 CORS
- 已在 `api-server.ts` 注册 `@fastify/cors`

## 验证清单

每次修改后必须验证：

- [ ] `npx tsc --noEmit` — 零类型错误
- [ ] `lsp_diagnostics` — 修改文件无诊断错误
- [ ] `npm run dev` — 开发服务器正常启动
- [ ] 浏览器测试 — 相关页面功能正常
- [ ] `npm run build` — 成功生成安装包

## 项目状态

### ✅ 已完成（M0-M7）
- [x] 基础设施层（Electron + React + Vite + TypeScript + Prisma + safeStorage）
- [x] 工单管理（看板 + 详情页）
- [x] 团队管理（Role/Agent/Tool CRUD + 授权矩阵）
- [x] 审批流程（审批中心 + approval-guard）
- [x] 审计系统（全链路日志 + 过滤查看）
- [x] OpenClaw 连接（Local + Remote + 诊断）
- [x] 配置中心（表单/JSON 编辑 + Diff + 回滚 + 快照）
- [x] 打包（electron-builder）

### 🚧 待实现
- [ ] E2E 测试覆盖
- [ ] 多语言支持
- [ ] 主题切换
- [ ] 插件系统

## 工作流程

当接到 SoloForge 相关任务时：

1. **理解需求**：明确要修改/添加什么
2. **定位文件**：根据项目结构找到相关文件
3. **检查依赖**：
   - 数据库 schema 是否需要变更？
   - API 端点是否需要新增/修改？
   - 前端页面是否需要更新？
4. **实施修改**：
   - 遵循既有代码风格
   - 保持类型安全
   - 添加中文注释
5. **验证**：
   - 类型检查
   - LSP 诊断
   - 开发服务器测试
   - 构建验证
6. **文档更新**：如有必要，更新 README.md

## 关键文件速查

| 文件 | 用途 |
|---|---|
| `src/main/index.ts` | Electron 主进程入口 |
| `src/main/services/api-server.ts` | Fastify API 服务器（20+ 端点） |
| `src/main/services/keychain.ts` | 凭证存储（safeStorage） |
| `src/preload/index.ts` | IPC 桥接（暴露 electronAPI） |
| `src/renderer/App.tsx` | React 路由配置 |
| `src/renderer/lib/api.ts` | getApiPort() 工具函数 |
| `prisma/schema.prisma` | 数据库 schema（10 表） |
| `prisma/seed.ts` | 种子数据 |
| `package.json` | 依赖、脚本、electron-builder 配置 |
| `vite.config.ts` | Vite + Electron 插件配置 |

## 联系与支持

- **项目路径**：`E:\forever\soloforge\`
- **数据库**：`E:\forever\soloforge\prisma\dev.db`
- **构建输出**：`E:\forever\soloforge\release/`
- **开发服务器**：Vite `http://localhost:5173` + API `http://127.0.0.1:13789`

---

**记住**：SoloForge 是一个 **Electron 桌面应用**，不是网页应用。所有修改必须同时考虑主进程（Node.js）和渲染进程（React）的协同工作。

---

## Ultrawork 工作流程（强制遵循）

### Phase 0: 绝对确定性要求

**在写任何代码前，必须 100% 确定：**

1. **完全理解**用户真正想要什么（不是假设）
2. **探索**代码库以理解现有模式、架构、上下文
3. **有清晰的工作计划** - 如果计划模糊，工作会失败
4. **解决所有歧义** - 如果有任何不清楚的，询问或调查

**不确定的信号：**
- 对需求做假设
- 不确定要修改哪些文件
- 不理解现有代码如何工作
- 计划中有"可能"或"也许"
- 无法解释将要采取的确切步骤

**当有疑问时：**
```typescript
// 1. 探索代码库
task(subagent_type="explore", run_in_background=true, load_skills=[], 
     description="查找现有实现模式",
     prompt="我正在实现 [任务描述]，需要理解 [具体知识缺口]。查找 [X] 模式 - 显示文件路径、实现方法、使用的约定。我将用这个来 [如何使用结果]。重点关注 src/ 目录，跳过测试文件（除非特别需要测试模式）。返回具体文件路径和每个文件的简要说明。")

// 2. 查找外部文档
task(subagent_type="librarian", run_in_background=true, load_skills=[], 
     description="查找库文档",
     prompt="我正在使用 [库/技术]，需要 [具体信息]。查找官方文档和生产级示例 - 特别是：API 参考、配置选项、推荐模式、常见陷阱。跳过初学者教程。我将用这个来 [这将影响的决策]。")

// 3. 架构咨询
task(subagent_type="oracle", run_in_background=false, load_skills=[], 
     description="架构审查",
     prompt="我需要对 [任务] 的方法进行架构审查。这是我的计划：[描述具体文件和更改的计划]。我的担忧是：[列出具体的不确定性]。请评估：方法的正确性、我遗漏的潜在问题、是否存在更好的替代方案。")
```

**只有在以下情况后才能开始实施：**
- 通过代理收集了足够的上下文
- 解决了所有歧义
- 创建了精确的、逐步的工作计划
- 对理解达到 100% 信心

### Phase 1: 并行探索与研究

**默认行为：并行启动多个背景任务**

```typescript
// 正确：同时启动多个探索任务
task(subagent_type="explore", run_in_background=true, load_skills=[], 
     description="查找认证实现", prompt="...")
task(subagent_type="explore", run_in_background=true, load_skills=[], 
     description="查找错误处理模式", prompt="...")
task(subagent_type="librarian", run_in_background=true, load_skills=[], 
     description="查找 JWT 安全文档", prompt="...")

// 继续你的工作，稍后用 background_output 收集结果
```

**停止搜索的条件：**
- 有足够的上下文可以自信地继续
- 相同信息在多个来源中出现
- 2 次搜索迭代没有产生新的有用数据
- 找到了直接答案

### Phase 2: 委托优先实施

**默认行为：委托。不要自己做所有事情。**

| 任务类型 | 委托目标 | 原因 |
|---|---|---|
| 架构决策 | `oracle` | 多系统权衡、不熟悉的模式 |
| 自我审查 | `oracle` | 完成重要实现后 |
| 困难调试 | `oracle` | 2+ 次失败尝试后 |
| 前端工作 | `category="visual-engineering", load_skills=["ui-ux-pro-max"]` | 领域优化模型 |
| 复杂逻辑 | `category="ultrabrain"` | 高难度任务 |
| 快速修复 | `category="quick", load_skills=["soloforge-electron-desktop"]` | 简单任务 |

**委托提示词结构（强制 6 部分）：**

```
1. TASK: 原子化、具体目标（一次一个动作）
2. EXPECTED OUTCOME: 具体交付物 + 成功标准
3. REQUIRED TOOLS: 显式工具白名单（防止工具泛滥）
4. MUST DO: 详尽要求 - 不留任何隐含内容
5. MUST NOT DO: 禁止动作 - 预判并阻止越界行为
6. CONTEXT: 文件路径、现有模式、约束
```

**会话连续性（强制）：**
- 每个 `task()` 返回 `session_id`，**必须使用**
- 任务失败/不完整 → `task(session_id="{id}", prompt="修复: {具体错误}")`
- 后续问题 → `task(session_id="{id}", prompt="另外: {问题}")`
- 多轮对话 → 始终使用 `session_id`，永不重新开始

### Phase 3: 验证保证（不可协商）

**没有证据 = 未完成**

#### 实施前：定义成功标准

在写任何代码前，必须定义：

| 标准类型 | 描述 | 示例 |
|---|---|---|
| **功能性** | 必须工作的具体行为 | "按钮点击触发 API 调用" |
| **可观察** | 可以测量/看到的内容 | "控制台显示 'success'，无错误" |
| **通过/失败** | 二元，无歧义 | "返回 200 OK" 而不是 "应该工作" |

#### 执行与证据要求

| 阶段 | 动作 | 必需证据 |
|---|---|---|
| **构建** | 运行构建命令 | 退出码 0，无错误 |
| **测试** | 执行测试套件 | 所有测试通过（截图/输出） |
| **手动验证** | 测试实际功能 | 演示它工作（描述观察到的内容） |
| **回归** | 确保没有破坏 | 现有测试仍然通过 |

**验证反模式（阻塞）：**

| 违规 | 为什么失败 |
|---|---|
| "现在应该工作了" | 没有证据。运行它。 |
| "我添加了测试" | 它们通过了吗？显示输出。 |
| "修复了 bug" | 你怎么知道？你测试了什么？ |
| "实现完成" | 你对照成功标准验证了吗？ |
| 跳过测试执行 | 测试存在是为了运行，不只是编写 |

**没有证据就不要声称任何事情。执行。验证。显示证据。**

---

## 零容忍失败

- **禁止范围缩减**：永不制作"演示"、"骨架"、"简化"、"基础"版本 - 交付完整实现
- **禁止模拟工作**：当用户要求"移植 A"时，你必须"移植 A"，完全、100%。无额外功能，无减少功能，无模拟数据，完全工作的 100% 移植。
- **禁止部分完成**：永不在 60-80% 停止说"你可以扩展这个..." - 完成 100%
- **禁止假设捷径**：永不跳过你认为"可选"或"可以稍后添加"的需求
- **禁止过早停止**：永不在所有 TODO 完成并验证前声明完成
- **禁止删除测试**：永不删除或跳过失败的测试以使构建通过。修复代码，不是测试。

**用户要求 X。交付确切的 X。不是子集。不是演示。不是起点。**

