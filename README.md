# SoloForge（独匠工坊）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![License: Commons Clause](https://img.shields.io/badge/License-Clause-red.svg)](LICENSE.md)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue.svg)](ROADMAP.md)
[![Discord](https://img.shields.io/badge/Discord-Join-blue?logo=discord)](https://discord.gg/soloforge)

> 🎯 **AI Team OS for One-Person Companies** | 安全优先的 AI 团队协作桌面应用

SoloForge 是一个 **PC 桌面端（非网页）** 的 AI 员工工作台 / Team OS，用于”一人公司”场景下创建与管理 AI 团队与员工，并与 **Claude Code（行动网关/调度器）** 联动，实现：

- **工单闭环**：咨询 → 需求澄清 → 方案 → 开发 → 测试 → 交付 → 复盘  
- **安全优先**：最小权限 + 强隔离 + 人工手刹（审批） + 全量审计（可回放）
- **双连接**：同时支持连接 **本地 Claude Code**（127.0.0.1）与 **远程 Claude Code（OpenResty 反代 + 域名）**
- **配置中心**：在客户端配置 Claude Code 常用项（尤其模型/路由/allowlist、hooks、tools 策略、安全配置）

---

## ⚡ 快速链接

| 资源 | 链接 |
|------|------|
| 📖 **文档** | [ROADMAP.md](ROADMAP.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) |
| 💬 **社区** | [Discord](https://discord.gg/soloforge) · [GitHub Issues](https://github.com/soloforge/soloforge/issues) |
| 📦 **下载** | [Releases](https://github.com/soloforge/soloforge/releases) |
| 🔐 **安全** | [安全策略](SECURITY.md) · [security@soloforge.dev](mailto:security@soloforge.dev) |

---

## 目录

- [核心能力](#核心能力)
- [架构与数据流](#架构与数据流)
- [安全模型](#安全模型)
- [技术栈](#技术栈)
- [快速开始（开发）](#快速开始开发)
- [打包发布](#打包发布)
- [连接 OpenClaw](#连接-openclaw)
- [OpenClaw 配置中心](#openclaw-配置中心)
- [Dashboard 总控首页](#dashboard-总控首页)
- [Host Agent / Remote Runner Center](#host-agent--remote-runner-center)
- [数据库与种子数据](#数据库与种子数据)
- [OpenResty 反代要点](#openresty-反代要点)
- [故障排查](#故障排查)
- [开发文档](#开发文档)
- [Roadmap](#roadmap)
- [License](#license)

---

## 核心能力

### 1) 团队与岗位
- **Role（岗位）**：Support / PM&Writer / Dev / QA / Ops
- **Agent（员工）**：绑定岗位、模型、运行环境（local/cloud）、启用开关
- **Tool（工具）+ 最小授权**：工具清单 + AgentTool 授权矩阵（最小权限）

### 2) 工单闭环（Ticket）
- 状态流：`INBOX → SPEC → DEV → TEST → DELIVERY → DONE`
- 看板视图与详情页：时间线、交付物（Artifacts）、审批（Approvals）、审计（AuditLog）

### 3) 交付物沉淀（Artifacts）
在每个工单下沉淀可复用资产（Markdown）：
- PRD、方案A/B、代码改动清单、测试用例、部署/回滚、交付清单、对外沟通稿等

### 4) 人工手刹（Approvals）
高危动作必须审批：
- `SEND_EXTERNAL / MERGE_MAIN / DEPLOY_PROD / EXPORT_DATA / PURCHASE`
- 配置变更相关：
  - `CHANGE_CONFIG / ROTATE_TOKEN`

### 5) 全量审计（AuditLog）
- 所有关键动作写入 append-only 审计日志
- trace_id 贯穿：可按工单回放请求/响应

### 6) Host Agent / Remote Runner Center（新增）
- 为远程宿主机提供**常驻、受控、可审计**的执行代理
- SoloForge 优先通过 **Agent 白名单动作** 与远端通信，SSH 作为 fallback / bootstrap / 临时修复通道保留
- 支持：注册、心跳、结构化任务派发、动作回执、结构化日志、状态采集、健康检查、版本发现
- 与 Workspace、Deployment、Doctor、Activity Feed、Audit 深度整合

---

## 架构与数据流

### 进程与组件（桌面端）
- **Electron Main**：本地服务层（API/DB/安全存储协调）
- **Renderer（React UI）**：只调用本地服务层 API
- **SQLite（本机）**：工单/交付物/审批/审计持久化
- **系统 Keychain**：OpenClaw token/password、X-Edge-Token 等敏感信息（不落明文盘）

### 与 OpenClaw 的联动
- **Local Profile**：`http://127.0.0.1:18789` / `ws://127.0.0.1:18789`
- **Remote Profile**：`https://api.<domain>` / `wss://api.<domain>`（OpenResty 反代）
- 客户端对 OpenClaw 的调用统一封装为 `OpenClawClient`（自动带 trace_id、鉴权头、重连与降级）

### 与 Host Agent 的联动
- **通信方向**：当前阶段采用 Agent 主动 `pull` SoloForge 动作队列，并定时 `heartbeat`
- **注册方式**：Bootstrap Token → 首次注册 → 下发长期 Agent Token（仅存安全存储，不明文落盘）
- **默认边界**：SoloForge 本地 API 默认监听 `127.0.0.1:13789`；远程宿主机要真正接入，必须提供**宿主机可达**的通道（如内网地址、Tailscale、反代或本机测试模式）
- **SSH 关系**：Agent 优先；Agent 不可用或当前动作无 Agent 能力时，仍可回退 SSH

---

## 安全模型

SoloForge 默认以“安全第一”为原则：

1) **最小权限**：Agent 默认无高危工具，必须显式授权  
2) **强隔离**：桌面端本地数据与执行留在本机；远程仅做编排/同步（视配置）  
3) **人工手刹**：所有高危动作、配置变更必须审批  
4) **全量审计**：所有关键动作记录到 append-only 审计日志  
5) **密钥安全**：token/API key 仅存系统 Keychain，UI 仅展示掩码

### Workspace 隔离（新增）

6) **Workspace 隔离**：多工作区支持，每个 workspace 独立管理：
   - 工单、联系人、通信目标、审计日志
   - 连接配置（可关联多个 ConnectionProfile）
   - 策略配置（Policy-as-Code）
   - Keychain 命名空间：`soloforge/<workspaceId>/<secretName>`

7) **Jobs 执行引擎**：可靠的任务执行与监控：
   - 支持类型：APPLY_CONFIG / RUN_TOOL / SYNC_STATE / ROTATE_TOKEN / CUSTOM
   - 幂等性保证（基于 trace_id + request hash）
   - 失败重试机制
   - 完整审计链路

8) **Policy-as-Code**：声明式策略管理：
   - tools_policy：工具白名单/黑名单
   - comms_policy：通信目标白名单
   - config_policy：配置路径白名单
   - approval_policy：审批动作扩展
   - 策略变更需要审批（CHANGE_POLICY）

9) **部署管理**：OpenClaw 部署与运维控制台：
   - 支持 4 种部署模式：本地原生、本地 Docker、远程 SSH、远程 Docker
   - 服务管理：启动/停止/重启/升级/健康检查/日志查看
   - 预检查机制：部署前验证环境（Node.js、Docker、端口、磁盘空间）
   - 审批集成：生产环境操作需要审批
   - 完整审计：所有部署操作记录到审计日志
   - 策略变更需要审批（CHANGE_POLICY）
---

## 技术栈

> 以 MVP 可交付为优先（可按需替换）

- Electron + React + TypeScript + Vite
- Tailwind CSS（Workshop OS 设计系统）
- SQLite + Prisma
- Electron safeStorage（系统级加密凭证存储）
- electron-builder（打包）
- ssh2（SSH 远程执行）
- dockerode（Docker 管理）
- js-yaml（Docker Compose 配置）
- Tailwind CSS（Workshop OS 设计系统）
- SQLite + Prisma
- Electron safeStorage（系统级加密凭证存储）
- electron-builder（打包）

---

## UI/UX 设计

### Workshop OS 设计风格

SoloForge 采用 **Workshop OS**（工坊操作台）设计风格：

- **工业极简** - 以结构与层级表达信息，少装饰多结构
- **控制台感** - 偏工具工作台，强调功能性与可操作性
- **高信息密度** - 默认紧凑但不拥挤，列表更紧凑，正文更舒适
- **强可读性** - 清晰的层次结构，明确的状态指示

### 主题系统

支持三种主题模式：

1. **浅色模式** (Light) - 纯白背景，深灰文字
2. **深色模式** (Dark) - 深灰黑背景，浅灰白文字
3. **跟随系统** (System) - 自动跟随 OS 的 `prefers-color-scheme`

主题切换位于 Topbar 右侧，选择会持久化到 `localStorage`。

### Design Tokens

所有颜色、间距、圆角、阴影均使用 CSS Variables 定义：

- **颜色系统** - HSL 格式，支持浅色/深色主题自动切换
- **间距系统** - 8px 网格（8/12/16/24/32/48）
- **圆角系统** - 4px/8px/12px
- **阴影系统** - 轻阴影（不使用重阴影）

### 布局架构

```
┌─────────────┬─────────────────────────────┐
│             │ Topbar (搜索/连接/主题)      │
│  Sidebar    ├─────────────────────────────┤
│  (导航)     │                             │
│             │  Content (页面内容)          │
│             │                             │
└─────────────┴─────────────────────────────┘
```

- **Sidebar** - 固定宽度 256px，包含导航菜单
- **Topbar** - 固定高度 64px，包含全局搜索、连接状态、主题切换
- **Content** - 弹性布局，包含 PageHeader 和页面内容

### 公共组件

- **PageHeader** - 页面标题与操作区
- **SectionCard** - 内容区块容器
- **DataTable** - 数据表格展示
- **ThemeToggle** - 主题切换按钮

### 表单组件规范

前端表单优先使用共享字段组件，避免在页面里重复拼接 `border/bg/focus/rounded` 等视觉类名。

- **基础字段**：
  - `ThemeInput`
  - `ThemeSelect`
  - `ThemeTextarea`
  - `ThemeCheckbox`
  - `ThemeNumberInput`
- **表单组合**：
  - `FormField`
  - `FormLabel`
  - `FormHint`
  - `FormError`

推荐使用方式：

```tsx
<FormField>
  <FormLabel>连接地址</FormLabel>
  <ThemeInput
    value={baseUrl}
    onChange={e => setBaseUrl(e.target.value)}
    fieldSize="lg"
    fieldShape="pill"
    placeholder="http://127.0.0.1:18789"
  />
  <FormHint>本地默认使用 127.0.0.1 回环地址。</FormHint>
</FormField>
```

字段参数约定：

- `fieldSize`
  - `sm`：紧凑筛选、辅助输入
  - `md`：默认表单尺寸
  - `lg`：主表单、搜索框、需要更强点击面的输入
- `fieldShape`
  - `default`：常规圆角输入
  - `pill`：胶囊形输入，适合筛选条、搜索条、向导表单
- `fieldTone`
  - `default`：通用焦点高亮
  - `primary`：更强调的 hover / focus 反馈，适合主流程表单
- `variant`
  - `ThemeTextarea` 支持 `variant="code"`，用于 JSON、配置片段、清单导入等等宽内容输入

迁移原则：

- 页面里优先只保留布局类：如 `md:col-span-2`、`flex-1`、`w-full`
- 不要在页面重复写字段的边框、背景、焦点、字号和 padding
- 如果某个页面需要新的尺寸、外形或交互语义，优先扩展共享组件，再落回页面使用

详细设计规范请参考 [docs/style-guide.md](./docs/style-guide.md)。

---

> 以 MVP 可交付为优先（可按需替换）

- Electron + React + TypeScript + Vite
- Tailwind CSS
- SQLite + Prisma
- Electron safeStorage（系统级加密凭证存储）
- electron-builder（打包）

---

## 快速开始（开发）
### 1) 安装依赖
```bash
npm install
```
### 2) 初始化数据库
```bash
npx prisma migrate dev
npx prisma db seed
```
### 3) 启动开发服务器
```bash
npm run dev
```
应用将启动 Electron 窗口，并自动连接到本地 API 服务器（随机端口）。
### 4) 构建生产版本
```bash
npm run build
```

## E2E 测试基线（Electron + Playwright）

当前仓库已经补齐一套**可稳定运行**的 Electron + Playwright E2E 基线，优先覆盖 Dashboard 最关键主路径，用于后续 M6 Dashboard drill-down 与交互细化回归保护。

### 运行前置条件

```bash
npm install
npx playwright install chromium
npm run build
```

### 运行命令

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
```

### 当前测试模式

- Playwright 直接启动 **Electron 应用实例**
- Dashboard 基线路径使用 **test-only 固定数据桩**
- 基础 E2E **不依赖真实远程 OpenClaw / SSH / Docker**
- 失败时自动保留：
  - screenshot
  - trace
  - video
  - HTML / JSON 报告

### 当前已覆盖场景

- 应用启动：主窗口、Dashboard、Sidebar、Topbar
- Dashboard 总览：Global Overview、Critical Issues、Pending Actions、Activity Feed Preview
- Dashboard 跳转：Overview 卡片、Critical Issue、Pending Action → 对应模块页 → 返回 Dashboard
- 基础交互：手动刷新、Workspace 切换、主题切换、empty state 降级

### 结果产物

- `test-results/artifacts/`
- `test-results/html/`
- 详细说明见：[`tests/e2e/README.md`](./tests/e2e/README.md)

### 已知限制

- 本轮只优先稳定 Dashboard 主路径基线
- 通讯 / 审批 / 联系人等旧 E2E 尚未纳入新的稳定基线
- 当前测试桩主要覆盖 Dashboard 聚合与 Workspace 查询，不扩展到新的业务能力

## 项目状态
### ✅ 已完成（M0 基础设施层）
- [x] 项目脚手架（Electron + React + Vite + TypeScript）
- [x] 数据库设计（Prisma + SQLite，10 个核心表）
- [x] 种子数据（5 个默认岗位 + 4 工具 + 示例数据）
- [x] 安全凭证存储（Electron safeStorage，跨平台 OS 级加密）
- [x] 本地 API 服务器（Fastify，随机端口，20+ 端点）
- [x] UI 基础（Tailwind + React 组件）
### ✅ 已完成（M1 工单管理）
- [x] 看板视图（拖拽排序、状态列）
- [x] 工单详情页（时间线、交付物、审批、审计）
### ✅ 已完成（M2 团队管理）
- [x] Role/Agent/Tool CRUD
- [x] AgentTool 授权矩阵（最小权限）
### ✅ 已完成（M3 审批流程）
- [x] 审批中心（待审批/已审批列表）
- [x] 审批创建 + 风控规则（approval-guard）
### ✅ 已完成（M4 审计系统）
- [x] 全链路审计日志（append-only）
- [x] 日志过滤与查看
### ✅ 已完成（M5 OpenClaw 连接）
- [x] ConnectionProfile 管理（Local + Remote）
- [x] OpenClawClient（REST + WebSocket）
- [x] 连接诊断（ping、WS 握手、状态指示）
### ✅ 已完成（M6 配置中心）
- [x] 表单编辑 + Raw JSON 编辑器
- [x] Diff 对比
- [x] Apply / 回滚（限频 60s/3次）
- [x] 历史快照
### ✅ 已完成（M7 打包）
- [x] electron-builder 打包（Windows NSIS / macOS DMG / Linux AppImage）
### ✅ 已完成（M8 Workspace 隔离）
- [x] Workspace 数据模型（workspaces/workspace_profiles/workspace_policies）
- [x] 现有表添加 workspace_id 外键
- [x] Keychain 支持 workspace namespace（soloforge/<workspaceId>/<secretName>）
- [x] Workspace CRUD API 端点
- [x] Workspace 导出/导入（不含密钥明文）
- [x] Workspace Switcher UI 组件
- [x] Workspace 管理页面
### ✅ 已完成（M9 Jobs 执行引擎）
- [x] JobExecutor 服务（trace_id 生成、OpenClawClient 调用、结果回写）
- [x] 幂等性保证（基于 workspaceId + type + request hash）
- [x] Jobs CRUD API 端点
- [x] Jobs 执行/重试端点
- [x] Jobs 监控页面（列表、状态、日志、重试）
### ✅ 已完成（M10 Policy-as-Code）
- [x] PolicyGuard 服务（tools/comms/config/approval 四大策略）
- [x] ApprovalGuard 扩展（CHANGE_POLICY 审批类型）
- [x] Policy CRUD API 端点
- [x] Policy 格式验证
- [x] Policy 管理页面（JSON 编辑器）
### ✅ 已完成（M11 Workspace 分级与变更管理）
- [x] Workspace 环境类型（DEV/STAGING/PROD）
- [x] 只读模式与临时解锁（需审批）
- [x] 期望状态快照（Desired Snapshot）
- [x] 实际状态快照（Actual Snapshot）
- [x] 漂移检测（Drift Detection）
- [x] 变更单系统（Change Request）
- [x] 变更单执行与回滚
- [x] 幂等性保证（基于 content_hash）
- [x] Outbox 模式（远程不可达时排队重试）
- [x] 审批强制（CHANGE_WORKSPACE_ENV、UNLOCK_WORKSPACE）
- [x] 变更单管理页面
### ✅ 已完成（M12 配置中心增强版）
- [x] 数据模型扩展（config_drafts, config_editor_history）
- [x] 模型配置增强（Provider 分组、主模型/回退模型管理）
- [x] 网关配置表单化（auth.mode、trustedProxies、hooks）
- [x] 配置草稿机制（Draft/Published/Diff 三态管理）
- [x] Create Change Request 集成
- [x] Undo/Redo 功能（本地编辑历史，最多 100 步）
### 🚧 待实现
- [ ] E2E 测试覆盖
- [ ] 多语言支持
- [ ] 主题切换
详细实现指南请参考：
- [DEVELOPMENT.md](./DEVELOPMENT.md) - 开发文档
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - 实现指南与代码模板
## 打包发布
```bash
npm run build
```
生成的安装包位于 `release/` 目录。
## 连接 OpenClaw
### 本地连接
- baseUrl: `http://127.0.0.1:18789`
- wsUrl: `ws://127.0.0.1:18789`
- authMode: `token`（可选）
### 远程连接（OpenResty 反代）
- baseUrl: `https://api.<domain>`
- wsUrl: `wss://api.<domain>`
- authMode: `token` / `password` / `trusted-proxy`
- 支持自定义 header（X-Edge-Token）
### 连接诊断
- HTTP ping 检测
- WebSocket 握手检测
- 鉴权验证
- 健康检查记录
## OpenClaw 配置中心
支持在客户端配置 OpenClaw 常用项：
1. **模型与路由**：默认模型、fallbacks、allowlist
2. **hooks**：enabled、token、path、mappings
3. **tools 策略**：allow/deny（高危工具默认 deny）
4. **gateway 安全**：auth.mode、trustedProxies
5. **其他常用**：session/threads 相关基础项
配置变更支持：
- 表单化编辑 + Raw JSON 编辑器
- diff 对比
- apply 应用（限频：60秒3次）
- 回滚到历史快照
- 审批流程（CHANGE_CONFIG）
- 审计记录

## Dashboard 总控首页

Dashboard 是 SoloForge 的**总控首页**，不是欢迎页，也不是业务流水线面板。它的职责是把已有控制面能力统一收口，让用户一进入首页就能快速回答以下问题：

1. 哪些 workspace / target 当前不健康
2. 哪些高风险问题仍未处理
3. 哪些关键动作正在执行
4. 哪些 Drift / Alert / Upgrade / Agent 问题需要处理
5. 当前有哪些待审批 / 待收敛事项
6. 最近 24h / 7d 系统整体趋势如何

### 聚合范围

Dashboard 当前统一聚合以下模块：

- Workspaces
- Deployment Targets
- Doctor / Alerts
- State Reconciliation / Drift
- Change Requests / Approvals
- Operations / Jobs
- Auto-Remediation 运行态（基于现有 `DOCTOR_FIX` / 修复链路聚合）
- Release & Upgrade Center
- Host Agents / Heartbeats
- Activity Feed / Event Bus
- Communications / Notifications（仅显示关键结果，不作为首页主视图）

### 页面结构

Dashboard 采用高信息密度、可跳转、可定位的控制台布局：

#### 1) Global Overview

顶部总览卡片统一显示：

- Workspace 数量
- Target 总数 / Healthy / Degraded / Unreachable
- Open Alerts 数
- Critical Drift 数
- Running Operations 数
- Pending Approvals 数
- Online / Offline Agents
- Available Updates 数

每张卡片都可直接跳转到对应模块详情页，不展示写死假数据。

#### 2) Critical Issues

关键问题区按优先级展示最重要的风险项，默认显示前 10 条，覆盖：

- CRITICAL Alerts
- Critical Drift
- Failed Upgrades
- Failed Remediation
- Offline Agents（优先关注高优先级目标）
- Unreachable Targets

每条都包含：类型、workspace / target、摘要、最近发生时间、快捷操作。

#### 3) Runtime Status

运行态区聚合以下子板块：

- **Operations Snapshot**：运行中 / 待审批操作、最近 24h / 7d 成功失败趋势
- **Host Agent Health**：在线 / 降级 / 离线、最近心跳异常
- **Deployment Status**：Target 健康度、最近部署 / 重启 / 升级结果
- **Auto-Remediation Snapshot**：今日修复链路总量、blocked / failed / succeeded / running

#### 4) Pending Actions

待办区统一收口：

- Pending Approvals
- Pending Change Requests
- Pending Upgrade Plans
- Pending Reconcile Plans
- Failed / Blocked Remediation 需要人工介入事项

所有待办都支持一键跳转到原模块继续处理。

#### 5) Activity Feed Preview

首页底部展示最近事件流预览，支持按以下维度过滤：

- 当前 workspace
- severity
- source_type

首页只展示预览条目，点击后跳转完整 Activity Feed 页面。

### Workspace 视角切换

Dashboard 支持两种视角：

1. **全局模式**：聚合所有 workspace
2. **当前 Workspace 模式**：只聚合当前 workspace

切换规则：

- 当前 workspace 默认来自 `localStorage: soloforge-current-workspace`
- 切换到某个 workspace 后，所有板块数据统一按该 workspace 过滤
- 不同 workspace 的数据不会串号
- 若切回全局模式，板块恢复跨 workspace 聚合

### Dashboard Health Score

Dashboard 提供 0-100 的健康分数，用于快速判断当前整体运行态。

评分维度包含：

1. Alerts 严重度
2. Drift 风险
3. Target 可达性
4. Host Agent 在线率
5. 最近 Doctor / CRITICAL 事件
6. Upgrade / Deployment 失败率
7. Remediation 成功率

展示方式：

- **Good**：整体稳定
- **Warning**：存在需要尽快处理的问题
- **Critical**：健康度偏低，需优先处理不可达目标、严重告警与失败链路

Dashboard 同时会展示每个评分因子的**权重、扣分与说明**，避免黑盒评分。

### 刷新机制

Dashboard 支持：

- **手动刷新**：立即重新拉取聚合数据
- **30 秒自动刷新**（可关闭）

设计原则：

- 自动刷新默认关闭
- 自动刷新不会主动打断用户操作
- 某个模块数据暂不可用时，Dashboard 优先保留已加载部分，不要求整页完全依赖所有下游模块成功

### 快捷入口

Dashboard 提供以下快捷操作：

- `Sync Actual`
- `Run Doctor Check`
- `Create Reconcile Plan`
- `Open Pending Approvals`
- `View Offline Agents`
- `View Failed Upgrades`
- `New Deployment Target`
- `Bootstrap Host Agent`

注意：Dashboard 只触发**安全入口动作**或页面跳转；任何高危执行仍然沿用原有审批与审计链路，不在首页直接裸执行。

### 与子模块的跳转关系

Dashboard 主要跳转映射如下：

- Overview 卡片 → `Alerts / Doctor / Operations / Approvals / Host Agents / Releases / Deployments`
- Critical Issues → `Alerts / Doctor / Operations / Upgrade Plans / Host Agents / Deployments`
- Pending Actions → `Approvals / Changes / Upgrade Plans / Doctor / Operations`
- Activity Feed Preview → `Activity Feed`
- Quick Actions → `Doctor / Approvals / Deployments / Host Agents`

### 自测建议（可复现）

1. 打开 Dashboard，确认能看到 Target 总数 / Open Alerts / Pending Approvals / Agent 在线态
2. 切换到不同 Workspace，确认 Overview / Critical Issues / Pending Actions / Activity Feed 同步切换且不串号
3. 制造失败升级、离线 Agent、未解决 Alert 后，确认 Critical Issues 会优先展示
4. 在 Dashboard 上点击概览卡片、问题项、待办项，确认都能跳到正确详情页
5. 开启自动刷新后等待 30 秒，确认页面数据可更新且不影响当前操作

## Host Agent / Remote Runner Center

Host Agent 是部署在远程宿主机上的**轻量常驻服务**，用于让 SoloForge 以**结构化白名单动作**替代大量原始 SSH 命令。

### 定位与边界

Host Agent 不是通用远控木马，也不是业务执行代理。它只服务于 **OpenClaw 控制平面生命周期**：

- 上报宿主机与 Gateway 状态
- 接收 SoloForge 派发的结构化动作
- 回传结构化结果、日志与错误摘要
- 参与 Doctor / Deployment / Release / Upgrade / State Sync

**默认禁止**：

- 任意 shell 执行
- 任意文件浏览
- 未授权目录的 compose 操作
- 未授权容器重启
- 未审批的高危动作

### 与 SSH 的关系

Host Agent 与 SSH 不是互斥关系：

1. **Agent 优先**：有在线 Agent 且能力匹配时，优先通过 Agent 执行 `VERIFY_HEALTH / DETECT_VERSION / COLLECT_STATE / COLLECT_LOGS`
2. **SSH fallback**：Agent 离线、未注册、能力不匹配、超时或当前环境尚未打通可达通道时，继续保留 SSH 作为 fallback
3. **SSH bootstrap**：远程宿主机首次安装 Agent 时，仍可通过 SSH 一键下发安装命令
4. **SSH 临时修复**：Agent 故障时，SSH 可作为应急通道，不直接废弃

### 当前阶段默认值

- SoloForge Local API 开发端口：`127.0.0.1:13789`
- Bootstrap Token 默认有效期：`15 分钟`
- Agent heartbeat 默认间隔：`30 秒`
- Agent pull 默认间隔：`3 秒`
- 心跳降级阈值：`90 秒`
- 心跳离线阈值：`180 秒`
- 默认认证模式：`TOKEN`
- 本地测试 Agent 入口：`npx tsx src/host-agent/index.ts`

### 安全模型

#### 1) 认证

- **Bootstrap Token**：短期有效，只用于首次注册
- **长期 Agent Token**：注册后下发，SoloForge 侧仅存系统安全存储（Keychain / safeStorage），不明文写入 SQLite
- **数据库中仅存 hash / 元数据**：bootstrap token 在库中保存 hash；长期 token 不明文落盘

#### 2) 白名单动作

当前已接入统一策略表，动作具备：

- `risk_level`
- `requires_approval`
- `requires_unlock`
- `timeout_seconds`
- `rollback_supported`
- `allowed_envs`

支持的动作模板：

- `COLLECT_STATE`
- `COLLECT_LOGS`
- `RESTART_GATEWAY`
- `RESTART_CONTAINER`
- `DOCKER_COMPOSE_UP`
- `DOCKER_COMPOSE_RESTART`
- `BACKUP_OPENCLAW`
- `RESTORE_OPENCLAW`
- `APPLY_CONFIG_PATCH`
- `VERIFY_HEALTH`
- `DETECT_VERSION`
- `RUN_DOCTOR_CHECK`
- `CUSTOM_SAFE_ACTION`

> 注意：当前 Agent 运行端已最小实现 `COLLECT_STATE / VERIFY_HEALTH / DETECT_VERSION / COLLECT_LOGS / RESTART_CONTAINER / RESTART_GATEWAY / DOCKER_COMPOSE_UP / DOCKER_COMPOSE_RESTART`。其余高危动作已在控制面建模、策略化与审计化，但运行端仍以后续版本继续补全。

#### 3) PROD 保护

- PROD workspace 下，高危动作默认**不直通**
- 需要动作本身策略允许
- 需要 workspace 已临时解锁
- 需要审批通过
- 不满足时，动作记录会进入 `BLOCKED`

### 数据模型

新增 5 张表：

- `host_agents`
- `agent_registrations`
- `agent_actions`
- `agent_heartbeats`
- `agent_logs`

它们全部带 `workspace_id`；动作链路带 `target_id`、`host_agent_id`、`trace_id`，可从 Audit / Event / Action / Log 回放完整执行链路。

### 页面说明

本阶段新增页面：

- **Host Agents**：列表、状态、能力、最近心跳、创建 bootstrap token、revoke、test action
- **Agent Detail**：基础信息、能力声明、最近动作、最近心跳、最近日志
- **Agent Bootstrap Wizard**：生成 bootstrap token、展示安装命令、说明注册完成后的检查路径
- **Agent Actions**：按 workspace / target / agent / action_type / status 过滤查看 request/result/logs

Dashboard 已新增 Host Agent 在线/离线/心跳健康度指标。

### 安装与注册流程

1. 在 **Host Agents → Bootstrap Wizard** 选择 workspace / target
2. 点击 **Create Bootstrap Token**
3. 获取安装命令，并将其中的 `<soloForge-host>` 替换为远端宿主机可访问的 SoloForge 地址
4. 在远端宿主机执行：

```powershell
$env:SOLOFORGE_SERVER_URL="http://<soloForge-host>:13789"
$env:SOLOFORGE_BOOTSTRAP_TOKEN="***"
$env:SOLOFORGE_AGENT_NAME="soloforge-host-agent"
npx tsx src/host-agent/index.ts
```

5. Agent 会自动：
   - 使用 bootstrap token 注册
   - 获取长期 token
   - 开始 heartbeat
   - 进入动作 pull 循环

### 运行端 allowlist / 风险提示

当前 Agent 运行端通过环境变量控制 allowlist：

- `SOLOFORGE_ALLOWED_CONTAINERS`：允许重启的容器名，英文逗号分隔
- `SOLOFORGE_ALLOWED_COMPOSE_DIRS`：允许执行 compose 的目录，分号分隔
- `SOLOFORGE_ALLOWED_LOG_PATHS`：允许采集的日志路径前缀，分号分隔

如果未配置这些 allowlist：

- `COLLECT_LOGS` 可能被拒绝
- `RESTART_CONTAINER` / `RESTART_GATEWAY` 可能被拒绝
- `DOCKER_COMPOSE_UP` / `DOCKER_COMPOSE_RESTART` 可能被拒绝

### 失败、风险与回退策略

#### 1) SoloForge 不可达

现象：Agent 无法注册或 heartbeat 持续失败

处理：

- 检查 `SOLOFORGE_SERVER_URL`
- 检查宿主机到 SoloForge 的网络可达性
- 若当前仅本地 API `127.0.0.1` 可用，则只能走本机测试模式
- 生产环境请通过内网地址 / Tailscale / 反代提供可达通道

#### 2) 动作被阻止（BLOCKED）

常见原因：

- Agent 能力不匹配
- 目标环境不允许
- PROD workspace 未解锁
- 高危动作需要审批

处理：

- 检查 Agent capabilities
- 检查 Workspace 是否解锁
- 到审批中心通过对应审批后重新创建动作

#### 3) 心跳丢失

处理：

- 90 秒后标记 `DEGRADED`
- 180 秒后标记 `OFFLINE`
- Dashboard / Host Agents / Doctor 都会显示异常
- 业务侧可回退到 SSH fallback

#### 4) capability 不匹配

处理：

- 查看 Agent Detail 中的 `capabilities_json`
- 查看运行端 allowlist 环境变量
- 需要的能力未开启时，动作不会派发

#### 5) 什么时候回退到 SSH

满足任一条件即可考虑 fallback：

- Agent 离线 / 未注册
- Agent 动作超时
- Agent 能力与动作模板不匹配
- 当前阶段尚未为该动作实现 Agent 运行端执行器

### 自测步骤（可复现）

#### A. Bootstrap Wizard 注册 Agent

1. 打开 `Host Agents → Create Bootstrap Token`
2. 选择 workspace / target（或不选 target 做本地测试）
3. 复制命令并在目标环境执行
4. 回到 `Host Agents` 列表刷新
5. 期望：Agent 出现并进入 `ONLINE`

#### B. 通过 Agent 执行低风险动作

1. 在 Host Agents 列表点击 `Run Test Action`
2. 进入 `Agent Actions` 页面
3. 期望看到 `VERIFY_HEALTH` 进入 `PENDING -> DISPATCHED/ACKED -> SUCCEEDED`
4. 进入 Agent Detail，确认最近动作与日志可见

#### C. 版本发现与健康检查优先走 Agent

1. 为 deployment target 绑定并启动在线 Agent
2. 触发健康检查 / 版本发现
3. 期望：有在线 Agent 时优先走 Agent；失败时继续回退原有链路

#### D. PROD 限制

1. 将 workspace 设为 PROD 且未解锁
2. 创建高危动作（如 `RESTART_GATEWAY`）
3. 期望：动作状态为 `BLOCKED`

#### E. 离线回退

1. 停止 Agent 进程
2. 等待超过离线阈值
3. 期望：Dashboard / Host Agents / Doctor 显示 `OFFLINE`
4. 对仍需执行的远程运维动作，可继续使用 SSH fallback
## 数据库与种子数据
### 数据模型
- **Role**（岗位）：Support / PM&Writer / Dev / QA / Ops
- **Agent**（员工）：绑定岗位、模型、运行环境
- **Tool**（工具）：工具清单
- **AgentTool**（授权）：最小权限配置
- **Ticket**（工单）：状态流转
- **Artifact**（交付物）：可复用资产
- **Approval**（审批）：人工手刹
- **AuditLog**（审计）：全量记录
- **ConnectionProfile**（连接配置）：Local + Remote
- **ConfigSnapshot**（配置快照）：回滚支持
- **Workspace**（工作区）：多工作区隔离
- **WorkspaceProfile**（工作区配置）：关联 ConnectionProfile
- **WorkspacePolicy**（工作区策略）：Policy-as-Code
- **Job**（任务）：可靠的任务执行与监控
- **DeploymentTarget**（部署目标）：OpenClaw 部署配置
- **DeploymentJob**（部署作业）：部署操作历史
### 种子数据
每个岗位包含：
- 详细描述
- 默认 Prompt（结构化输出）
- 输出 Schema（JSON）
- 风险等级
## Workspace 隔离与管理
### Workspace 概念
Workspace(工作区)是 SoloForge 的核心隔离单元,每个 workspace 独立管理:
- 工单、联系人、通信目标
- 外发消息、审计日志
- 连接配置(可关联多个 ConnectionProfile)
- 策略配置(Policy-as-Code)
- Jobs 执行记录
### Keychain 命名空间
**格式**:`soloforge/<workspaceId>/<secretName>`
**示例**:
```
soloforge/00000000-0000-0000-0000-000000000001/local-profile-token
soloforge/00000000-0000-0000-0000-000000000001/remote-edge-token
soloforge/abc123-workspace-id/production-token
```
**安全特性**:
- 使用 Electron safeStorage(OS 级加密)
- 切换 workspace 时自动隔离凭证
- UI 仅显示掩码(如 `sk-****abcd`)
### Workspace 导出/导入
**导出**:
- 包含:workspace 配置、工单、联系人、策略
- **不包含**:密钥明文(token/password/edge-token)
- 格式:JSON 文件
**导入**:
- 创建新 workspace(生成新 ID)
- 恢复配置、工单、联系人
- **提示用户重新填写凭证**(安全考虑)
### 切换 Workspace
**切换机制**:
1. 选择 workspace(Sidebar 顶部 WorkspaceSwitcher)
2. 更新 localStorage:`soloforge-current-workspace`
3. 刷新页面(重新加载数据)
**隔离保证**:
- 所有 API 请求自动过滤 workspace
- Keychain 按 workspace 隔离
- 切换后不会串号
---
## Jobs 执行引擎
### Job 类型
- **APPLY_CONFIG**:应用 OpenClaw 配置
- **RUN_TOOL**:执行工具(预留)
- **SYNC_STATE**:同步状态(预留)
- **ROTATE_TOKEN**:轮换 token(预留)
- **CUSTOM**:自定义任务(预留)
### 幂等性保证
**创建幂等**:
- 基于 `workspaceId + type + requestJson` 去重
- 相同请求不会重复创建
**执行幂等**:
- `SUCCEEDED` 状态直接返回结果
- `RUNNING` 状态拒绝重复执行
- `FAILED` 状态可重试
### 审计链路
**trace_id 贯穿**:
- Job 创建时生成 trace_id
- OpenClawClient 调用时传递 trace_id
- 结果回写时记录 trace_id
- 审计日志中可回放完整调用链
**敏感信息脱敏**:
- 结果中的 token/password/apiKey 自动掩码
- provider_receipt 脱敏后存储
### 失败重试
**重试机制**:
- 手动重试:`POST /api/jobs/:id/retry`
- 重置状态为 `PENDING`
- 清空 logs 和 resultJson
- 重新执行
**注意事项**:
- 只有 `FAILED` 状态可重试
- 重试不会改变 trace_id(保持审计链路)
---
## Policy-as-Code
### Policy 结构
```json
{
  "tools_policy": {
    "allow": ["read_file", "write_file"],
    "deny": ["deploy", "delete_database", "execute_shell"]
  },
  "comms_policy": {
    "allowed_targets": ["target-id-1", "target-id-2"]
  },
  "config_policy": {
    "allowed_paths": ["models.*", "hooks.enabled", "tools.allow"]
  },
  "approval_policy": {
    "required_actions": ["DEPLOY_PROD", "EXPORT_DATA"]
  }
}
```
### 策略校验
**四大策略**:
1. **tools_policy**:工具访问控制
   - `deny` 优先级高于 `allow`
   - 默认高危工具拒绝(deploy/delete_database/execute_shell)
2. **comms_policy**:通信目标白名单
   - 只允许向 allowlisted 目标发送消息
   - 空列表表示允许所有(或根据需求设置为拒绝所有)
3. **config_policy**:配置路径白名单
   - 只允许修改 allowlisted 配置路径
   - 支持通配符(如 `models.*`)
4. **approval_policy**:审批动作扩展
   - 扩展 ApprovalGuard 的默认审批列表
   - 可按 workspace 自定义审批规则
### 策略变更
**审批流程**:
1. 创建/更新 policy 需要审批(`CHANGE_POLICY`)
2. 审批通过后才能生效
3. 版本自动递增
**验证**:
- JSON 格式校验
- 必需字段检查(tools_policy/comms_policy/config_policy/approval_policy)
- 实时验证反馈
## Workspace 分级与变更管理

### Workspace 环境类型

SoloForge 支持三种环境类型，用于区分不同的工作环境：

- **DEV**（开发环境）：默认类型，无限制
- **STAGING**（预发布环境）：中等限制
- **PROD**（生产环境）：默认只读，高危操作需审批

### 只读模式与临时解锁

**只读模式**：
- PROD 环境默认开启只读模式
- 只读模式下禁止执行任何配置变更、策略变更
- 可通过 Workspace 设置页面切换只读模式

**临时解锁**：
- 支持临时解锁 PROD 环境（15/30/60 分钟）
- 解锁需要审批（UNLOCK_WORKSPACE）
- 到期自动恢复只读
- 解锁期间可执行变更单

### Desired State 与 Drift Detection

**期望状态快照（Desired Snapshot）**：
- 保存本地编辑后的配置作为期望状态
- 支持版本管理和历史回溯
- 脱敏存储（不含 token/password）

**实际状态快照（Actual Snapshot）**：
- 从 OpenClaw 拉取实际运行配置
- 定期同步或手动触发
- 脱敏存储

**漂移检测（Drift Detection）**：
- 自动比较 Desired vs Actual
- 计算配置差异（使用 JSON Patch）
- 分析严重程度（LOW/MED/HIGH）
- 高危漂移：gateway.auth、trustedProxies、hooks.token、tools.allow/deny

### 变更单系统（Change Request）

**统一变更治理**：
- 所有高危配置变更必须通过变更单执行
- 支持类型：CONFIG、POLICY、TOOLS、COMMS、MIXED
- 状态流：DRAFT → PENDING_APPROVAL → APPROVED → APPLYING → APPLIED/FAILED

**变更单执行**：
1. 创建变更单（包含 diff_json）
2. 提交审批（CHANGE_CONFIG）
3. 审批通过后执行
4. 自动同步实际状态
5. 重新计算漂移
6. 写入审计日志

**幂等性保证**：
- 基于 change_request_id + content_hash 去重
- 相同变更不会重复执行
- 支持失败重试

**Outbox 模式**：
- 远程不可达时变更单进入 Outbox 队列
- 网络恢复后自动重试
- 保证最终一致性

### 从漂移创建变更单

在 Drift 视图中可一键生成变更单：
1. 计算漂移（Compute Drift）
2. 查看差异详情
3. 点击 "Create CR from Drift"
4. 自动生成变更单（包含完整 diff）
5. 提交审批并执行

### 审批强制

以下操作必须审批：
- `CHANGE_WORKSPACE_ENV`：变更 Workspace 环境类型
- `UNLOCK_WORKSPACE`：临时解锁只读模式
- `CHANGE_CONFIG`：应用配置变更
- `CHANGE_POLICY`：变更策略

### 使用流程示例

**DEV 环境**：
1. 编辑配置 → Save as Desired
2. 连接 OpenClaw → Sync Actual
3. Compute Drift → 查看差异
4. Create CR from Drift → 提交审批
5. 审批通过 → 执行变更单
6. 自动 Sync Actual → 漂移收敛

**PROD 环境**：
1. 默认只读，禁止直接变更
2. 申请临时解锁（需审批）
3. 解锁后创建变更单
4. 变更单需要审批
5. 审批通过后执行
6. 解锁到期自动恢复只读

---

---
运行种子数据：
```bash
npx prisma db seed
```

## 通讯增强（模板 / 联系人绑定 / 幂等重试）

本次扩展聚焦三个最小但高增益能力：

1. **模板系统（变量填充）**
2. **联系人绑定（Ticket ↔ Contact ↔ Targets）**
3. **发送幂等 + 退避重试 + 回执入审计（P0）**

### 模板语法与变量

- 语法：`{{variable}}`（扁平变量替换）
- 渲染入口：Ticket 详情页 `Compose & Send`
- 渲染流程：
  1) 选择模板
  2) 合并变量（`defaults + ticket/contact 推导 + 表单输入`）
  3) 生成 `template_runs` 记录
  4) 同步生成 `outbound_messages` 草稿（`DRAFT`）

### 内置模板（seed）

- `需求澄清模板`（REQUIREMENTS_CLARIFY）
- `报价与方案沟通模板`（QUOTE）
- `交付通知模板`（DELIVERY_NOTICE）

> QUOTE 模板内置“**不承诺最终价格/工期**”提示，避免误承诺。

### 联系人绑定

- 新页面：`联系人`（`/contacts`）
- 数据关系：
  - `contacts`：联系人主体
  - `contact_targets`：联系人与通信目标绑定（含 `is_primary`）
  - `tickets.contact_id` / `tickets.primary_target_id`：工单绑定联系人与默认外发目标
- 规则：
  - 工单选中联系人后，默认带出其 `primary target`
  - 工单未绑定联系人时，发送前会弹出二次确认

### 幂等与重试策略

- 幂等关键：`idempotency_key`（SHA256 组合键）
- 内容判重：`content_hash = SHA256(channel + to + subject + body)`
- 发送前去重：
  - 若存在相同 `content_hash` 且状态为 `SENDING/SENT`，直接复用结果，禁止重复发送
- 重试机制：
  - 状态 `FAILED` 且在退避窗口外可重试
  - 指数退避：`1m, 5m, 15m, 1h, 6h`（超出继续按 6h）
  - 最大尝试次数：默认 `8`（可在 `api-server.ts` 中 `MAX_RETRY_ATTEMPTS` 调整）
  - 批量重试入口：`POST /api/outbound-messages/retry-due`

### 审批联动

- 发送按钮行为：
  - `DRAFT` → 创建 `Approval(SEND_EXTERNAL)` → `PENDING_APPROVAL`
  - 审批通过：`APPROVED` → `SENDING` → `SENT`
  - 审批拒绝：`CANCELED`
- 重试发送要求：必须存在且仍有效的 `APPROVED` 审批

### 审计字段与回放

`audit_logs` 增强字段：

- `approval_id`
- `template_id`
- `outbound_message_id`
- `provider_message_id`

审计动作：

- 成功：`OUTBOUND_SENT`
- 失败：`OUTBOUND_FAILED`
- 审批拒绝取消：`OUTBOUND_CANCELED`

审计中目标地址使用掩码（`to_masked` / `maskTarget`），敏感凭证仍仅在 Keychain。

### 默认值与可配置项

默认值：

- Provider：`openclaw`
- 重试阶梯（分钟）：`[1, 5, 15, 60, 360]`
- 最大重试次数：`8`
- 模板格式：`MARKDOWN`

可配置项（代码层）：

- `RETRY_BACKOFF_MINUTES`（`src/main/services/api-server.ts`）
- `MAX_RETRY_ATTEMPTS`（`src/main/services/api-server.ts`）
- 模板 `variables_schema/defaults/channel_constraints`（`message_templates` 表）

### 自测步骤（可复现）

1. 创建/选择 Ticket，绑定联系人与目标（或在 `联系人` 页面先绑定）。
2. 在 Ticket 详情 `Compose & Send`：选择模板 → 填变量 → 点击“生成草稿（DRAFT）”。
3. 点击发送：应进入审批（`PENDING_APPROVAL`）。
4. 在审批中心通过后，消息进入 `SENDING/SENT`，并可在审计页按 `trace_id` 回放。
5. 模拟网络异常后发送：消息应 `FAILED` 并写入 `next_retry_at`；恢复网络后手动重试或调用 `retry-due`。
6. 重复点击发送同内容：应触发幂等去重，不会重复外发。

## 部署管理

SoloForge 支持完整的 OpenClaw 部署与运维管理功能。

### 部署模式

**4 种部署类型**：

1. **本地原生** (LOCAL_HOST)：在本机直接运行 OpenClaw（使用 npm/pm2）
2. **本地 Docker** (LOCAL_DOCKER)：在本机使用 Docker Compose 运行 OpenClaw
3. **远程原生** (REMOTE_HOST)：通过 SSH 在远程服务器运行 OpenClaw（使用 npm/pm2）
4. **远程 Docker** (REMOTE_DOCKER)：通过 SSH 在远程服务器使用 Docker Compose 运行 OpenClaw

### 服务管理

**支持操作**：

- **启动服务** (start)：启动 OpenClaw 服务
- **停止服务** (stop)：停止 OpenClaw 服务
- **重启服务** (restart)：重启 OpenClaw 服务
- **升级服务** (upgrade)：升级到新版本
- **健康检查** (health)：检查服务运行状态
- **查看日志** (logs)：获取服务日志

## Release & Upgrade Center（版本与升级中心）

Release & Upgrade Center 用于统一管理 **OpenClaw 控制平面生命周期**，覆盖：

- 版本发现（Detect only）
- 升级计划（Plan only）
- 审批与执行（Require Approval / Execute）
- 升级后验证（Verify）
- 回滚（Rollback）

> 边界说明：SoloForge 只管理 **OpenClaw / Gateway / Docker Image / Runner / Custom 运行组件** 的版本与升级，不做业务内容升级编排，不接入业务流水线发布系统。

### 版本目录与安装版本关系

Release Center 引入两类核心数据：

1. **version_catalog**：可升级到的“候选版本目录”
   - 支持手动录入
   - 支持本地 manifest JSON 导入
   - 支持 Docker image tag 录入
   - 预留 GitHub Release / Docker Registry 扩展结构

2. **installed_versions**：某个 Target 当前真实检测到的已安装版本
   - Local Native：优先执行 `metadata.versionCommand`，失败时回退 health 检查
   - Local Docker：优先读取 `docker inspect` 的镜像标签
   - Remote Native：通过 SSH 执行版本命令
   - Remote Docker：通过 SSH + `docker inspect` 检测镜像

在 Releases 页面里，系统会展示：

- 当前 target 已安装版本
- 版本目录中的最新可用版本
- `current_version -> target_version` 差异
- 是否存在可升级项

### Upgrade Plan / Dry Run / Verify / Rollback 机制

每个 Upgrade Plan 至少包含以下阶段：

1. **Precheck**：检查 Workspace 解锁状态、维护窗口、备份能力、Docker/SSH/API 可用性
2. **Backup**：导出 Workspace 备份快照，并记录旧版本引用
3. **Stop / Drain**：停止当前服务
4. **Install / Pull**：拉取镜像或执行原生升级命令
5. **Restart**：重启服务
6. **Verify**：健康检查 + Doctor Check
7. **Rollback**：失败时恢复旧版本或执行原生回滚命令

Dry Run 输出至少包括：

- `blocked`
- `requiresApproval`
- `requiresRestart`
- `rollbackSupported`
- 每个检查项的 `passed / blocking / message / details`

升级成功后，系统会尝试自动：

- Sync Actual Snapshot
- Recompute Drift
- Run Doctor Full Diagnostic
- 写入 Event Feed / Audit Log / Operations

如果 Verify 未通过：

- 当策略允许自动回滚且目标支持回滚时：自动触发 Rollback
- 否则：生成 Alert，并将计划标记为 `FAILED`

### Docker / Native / Remote 升级差异

#### 1) Local Docker / Remote Docker

- 默认通过 `DeploymentTemplateFactory` 的 Docker 模板执行
- 升级方式：`docker pull` + compose stop/start/recreate
- 回滚方式：恢复到旧 image tag
- 默认支持自动回滚

#### 2) Local Native / Remote Native

- 升级中心支持 **命令驱动** 的原生升级
- 需要在 `deployment_targets.metadata` 中提供以下命令之一：
  - `versionCommand`
  - `upgradeCommand`
  - `rollbackCommand`（若希望支持自动/手动回滚）
- 支持占位符：`{{version}}`

示例：

```json
{
  "versionCommand": "openclaw-gateway --version",
  "upgradeCommand": "bash /opt/openclaw/bin/upgrade.sh {{version}}",
  "rollbackCommand": "bash /opt/openclaw/bin/rollback.sh {{version}}",
  "workDir": "/opt/openclaw"
}
```

> 默认值说明：若未配置 `upgradeCommand`，原生目标仍可被发现与规划，但**不会自动执行升级**；系统会在 Dry Run / Execute 时明确报错，避免静默失败。

### Release Policy 与 Maintenance Window

每个 Workspace 可定义：

- 允许的 release channel
- 是否自动发现更新
- 是否强制备份
- 是否强制审批
- 是否强制维护窗口
- 是否允许自动回滚

维护窗口当前默认支持简单规则：

```text
weekly:sun:02:00-04:00
```

表示：**每周日 02:00-04:00** 允许执行升级。

默认 seed 中会创建：

- 开发升级策略：允许 `STABLE / BETA / CUSTOM`
- 生产升级策略：仅允许 `STABLE`，并强制审批、维护窗口、备份
- 默认维护窗口：`weekly:sun:02:00-04:00`

### PROD 升级保护规则

PROD Workspace 默认受到以下保护：

1. **未临时解锁**：禁止直接执行升级
2. **未进入维护窗口**：禁止执行升级
3. **需要审批**：升级与回滚都必须审批
4. **默认开启备份**：升级前先校验备份能力
5. **所有关键动作可追溯**：
   - `event_records`
   - `audit_logs`
   - `operations / operation_phases / operation_steps`
   - `trace_id`

### 页面结构

新增页面：

- **Releases**：版本目录、已安装版本、更新发现
- **Upgrade Plans**：计划创建、Dry Run、Execute、Rollback
- **Upgrade Runs**：历史升级执行记录
- **Release Policies**：升级策略管理
- **Maintenance Windows**：维护窗口管理

Dashboard 新增指标：

- Available Updates Count
- Pending Upgrade Plans
- Failed Upgrades
- Last Upgrade Result per target

### 常见失败场景与排查方式

#### 1) Dry Run 提示 Workspace 未解锁

- 现象：`PROD Workspace 未临时解锁，禁止直接执行升级`
- 排查：进入 Workspace 设置，先申请临时解锁并完成审批

#### 2) Dry Run 提示不在维护窗口

- 现象：`当前不在允许的维护窗口内`
- 排查：检查 Maintenance Windows 规则是否匹配当前时间；开发环境可关闭 `requireMaintenanceWindow`

#### 3) Docker 目标升级失败

- 现象：`docker pull` / `docker inspect` / `compose restart` 失败
- 排查：
  - Local Docker：检查 Docker Desktop / daemon 是否启动
  - Remote Docker：检查 SSH 凭据与远端 Docker 可用性
  - 核对 `metadata.imageName / dockerContainerName / projectName`

#### 4) 原生目标无法自动升级

- 现象：`当前原生目标未配置 upgradeCommand，无法自动执行升级`
- 排查：在 `deployment_targets.metadata` 中补充 `upgradeCommand` 与 `rollbackCommand`

#### 5) 升级后无法自动同步 Actual / Drift

- 现象：升级成功但出现 `升级后同步失败` Alert
- 排查：检查 Workspace 是否绑定可用的 ConnectionProfile，OpenClaw API `/health` 与 `/config` 是否可达

#### 6) Verify 失败触发回滚

- 现象：Plan 状态变为 `ROLLED_BACK`
- 排查：查看 Upgrade Runs 页面中的 `resultJson / rollbackResultJson`，以及 Alerts / Activity Feed / Operations 页面中的 trace 链路

### 自测步骤（可复现）

#### A. Local Docker

1. 创建或选择 `LOCAL_DOCKER` Target
2. 在 Releases 页面执行“重新检测”
3. 在 Upgrade Plans 页面创建升级计划
4. 执行 Dry Run，应看到 Docker/备份/兼容性检查结果
5. 执行升级
6. Verify 通过后，到 Dashboard / Upgrade Runs / Activity Feed 查看结果

#### B. Remote Docker

1. 为 `REMOTE_DOCKER` Target 配置 SSH 凭据
2. Releases 页面执行版本检测
3. 创建 Upgrade Plan
4. Dry Run 应通过 SSH + Docker 可用性检查
5. 执行升级，确认远端镜像已更新

#### C. Remote Native

1. 在 `deployment_targets.metadata` 中配置 `versionCommand / upgradeCommand / rollbackCommand`
2. 执行版本检测
3. 创建 Upgrade Plan
4. Dry Run 应通过 SSH + 命令可用性检查
5. 执行升级并验证健康状态

#### D. PROD Workspace 保护

1. 将 Workspace 设为 PROD 且保持只读
2. 不解锁、无维护窗口时执行 Dry Run
3. 应看到阻塞项：未解锁 / 不在维护窗口 / 需要审批

#### E. 回滚验证

1. 故意提供错误版本或错误升级命令
2. 执行升级，Verify 失败
3. 若策略允许自动回滚，应看到计划进入 `ROLLED_BACK`
4. 在 Upgrade Runs 中查看 `rollbackResultJson`

#### F. Event / Audit / Operations 可追溯

1. 创建并执行一个 Upgrade Plan
2. 进入 Activity Feed 查看：
   - `UPDATE_DETECTED`
   - `UPGRADE_PLAN_CREATED`
   - `UPGRADE_APPROVAL_REQUIRED`（若触发）
   - `UPGRADE_STARTED`
   - `UPGRADE_SUCCEEDED / UPGRADE_FAILED`
   - `ROLLBACK_SUCCEEDED / ROLLBACK_FAILED`
3. 进入 Audit Logs 与 Operations 页面，按 `trace_id` 核对链路

### 预检查机制

部署前自动验证环境：

- **Node.js 版本**：检查 Node.js 是否安装且版本符合要求
- **Docker 可用性**：检查 Docker 是否安装并运行（Docker 部署模式）
- **端口可用性**：检查目标端口是否被占用
- **磁盘空间**：检查磁盘空间是否足够
- **SSH 连接**：检查 SSH 凭据是否有效（远程部署模式）

### 审批集成

**生产环境保护**：

- 生产环境 (PROD) 的所有服务管理操作需要审批
- 审批类型：START_SERVICE、STOP_SERVICE、RESTART_SERVICE、UPGRADE_SERVICE
- 开发/预发布环境 (DEV/STAGING) 可直接执行

### 完整审计

**所有部署操作记录到审计日志**：

- 部署目标创建/更新/删除
- 服务启动/停止/重启/升级
- 健康检查结果
- 部署作业执行状态

### 诊断中心集成

Doctor Center 包含部署健康检查：

- **部署目标状态**：检查所有目标的健康状态 (HEALTHY/DEGRADED/UNREACHABLE/UNKNOWN)
- **过期检查**：检测超过 24 小时未检查的目标
- **Docker 可用性**：验证 Docker 环境配置
- **SSH 连接**：检查远程目标的 SSH 凭据
- **端口冲突**：检测多个目标使用相同端口

### 使用流程

1. **创建部署目标**：点击“新建部署”按钮，选择部署类型
2. **配置参数**：填写名称、主机、端口、SSH 凭据等
3. **运行预检查**：系统自动验证环境配置
4. **开始部署**：预检查通过后开始安装 OpenClaw
5. **服务管理**：在详情页面管理服务生命周期

### 安全注意事项

- **SSH 凭据存储**：SH 密码存储在系统 Keychain，不落明文盘
- **生产环境保护**：PROD 环境操作必须审批
- **完整审计**：所有操作记录到 append-only 审计日志
- **端口默认值**：OpenClaw 默认端口 18789，SSH 默认端口 22

## OpenResty 反代要点
### WebSocket 支持
```nginx
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
}
```
### 双层门禁
1. **OpenResty 层**：X-Edge-Token 验证
2. **OpenClaw 层**：token/password 验证
### 安全建议
- 公网只开 443 端口
- 网关端口不直出
- 使用 HTTPS/WSS
- 配置 trustedProxies（精确 IP，禁止 0.0.0.0/0）
## 故障排查
### 应用无法启动
1. 检查 Node.js 版本（推荐 v18+）
2. 删除 `node_modules` 和 `package-lock.json`，重新安装
3. 检查 Prisma 是否生成客户端：`npx prisma generate`
### 数据库错误
1. 检查 `prisma/dev.db` 是否存在
2. 运行迁移：`npx prisma migrate dev`
3. 重置数据库：`npx prisma migrate reset`（开发环境）
### 凭证存储错误
- 使用 Electron safeStorage API（OS 级加密），无需额外系统依赖
- Windows: 使用 DPAPI 加密
- macOS: 使用 Keychain 加密
- Linux: 使用 libsecret 加密
### API 连接失败
1. 检查 Electron 主进程日志（终端输出）
2. 检查 API 端口是否正确
3. 使用 DevTools 查看网络请求
## 开发文档

### 核心文档

- **[AGENTS.md](./AGENTS.md)** — 项目规则、安全约束、工作流程（Ultrawork 模式）
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** — 开发环境配置、调试指南
- **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** — 实现指南与代码模板
- **[docs/EXTENSION_GUIDE.md](./docs/EXTENSION_GUIDE.md)** — 扩展功能开发指南（Ultrawork 标准流程）

### 技能文件

- **[.kiro/skills/soloforge-electron-desktop.md](./.kiro/skills/soloforge-electron-desktop.md)** — 项目专用技能文件，包含完整技术栈、数据模型、API 端点、验证标准

### 开发规范

本项目遵循 **Ultrawork 模式**，强调：

1. **绝对确定性** — 100% 理解需求后再动手
2. **并行探索** — 使用 explore/librarian 代理高效收集上下文
3. **委托优先** — 复杂任务委托给专业代理
4. **验证保证** — 没有证据 = 未完成
5. **零容忍失败** — 交付完整实现，不是演示或骨架

详见 [AGENTS.md](./AGENTS.md) 和 [docs/EXTENSION_GUIDE.md](./docs/EXTENSION_GUIDE.md)。

## Roadmap
### ✅ Phase 1: MVP（已完成）
- [x] 基础设施层（M0）
- [x] 工单管理（M1）
- [x] 团队管理（M2）
### ✅ Phase 2: 核心功能（已完成）
- [x] 审批流程（M3）
- [x] 审计系统（M4）
- [x] Claude Code 连接（M5）
### ✅ Phase 3: 高级功能（已完成）
- [x] 配置中心（M6）
- [x] 打包（M7）
### ✅ Phase 4: 增强（进行中）
- [x] E2E 测试覆盖
- [ ] 多语言支持
- [ ] 主题切换
- [ ] 插件系统
- [ ] 数据导入/导出

详细路线图请查看 [ROADMAP.md](ROADMAP.md)。

## 贡献指南

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细指南。

快速步骤：
1. Fork 项目
2. 创建功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交变更（`git commit -m 'feat: Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 创建 Pull Request

## License

本项目采用 **MIT License + Commons Clause** 双许可，详见 [LICENSE.md](LICENSE.md)。

**核心要点：**
- ✅ 可免费用于个人、教育、内部业务目的
- ✅ 可修改和再分发（需保留版权声明）
- ❌ 禁止商业变现（如 SaaS 服务、售卖产品）

商业使用请联系：[contact@soloforge.dev](mailto:contact@soloforge.dev)

## 联系方式

| 渠道 | 地址 |
|------|------|
| 🌐 **官网** | https://soloforge.dev |
| 💬 **Discord** | https://discord.gg/soloforge |
| 🐛 **Bug 反馈** | https://github.com/soloforge/soloforge/issues |
| 🔐 **安全问题** | security@soloforge.dev |
| 📧 **邮箱** | contact@soloforge.dev |
