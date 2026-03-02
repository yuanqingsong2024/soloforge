# SoloForge（独匠工坊）

SoloForge 是一个 **PC 桌面端（非网页）** 的 AI 员工工作台 / Team OS，用于“一人公司”场景下创建与管理 AI 团队与员工，并与 **OpenClaw（行动网关/调度器）** 联动，实现：

- **工单闭环**：咨询 → 需求澄清 → 方案 → 开发 → 测试 → 交付 → 复盘  
- **安全优先**：最小权限 + 强隔离 + 人工手刹（审批） + 全量审计（可回放）
- **双连接**：同时支持连接 **本地 OpenClaw**（127.0.0.1）与 **远程 OpenClaw（OpenResty 反代 + 域名）**
- **配置中心**：在客户端配置 OpenClaw 常用项（尤其模型/路由/allowlist、hooks、tools 策略、安全配置）

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
- [数据库与种子数据](#数据库与种子数据)
- [OpenResty 反代要点](#openresty-反代要点)
- [故障排查](#故障排查)
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

---

## 安全模型

SoloForge 默认以“安全第一”为原则：

1) **最小权限**：Agent 默认无高危工具，必须显式授权  
2) **强隔离**：桌面端本地数据与执行留在本机；远程仅做编排/同步（视配置）  
3) **人工手刹**：所有高危动作、配置变更必须审批  
4) **全量审计**：所有关键动作记录到 append-only 审计日志  
5) **密钥安全**：token/API key 仅存系统 Keychain，UI 仅展示掩码

---

## 技术栈

> 以 MVP 可交付为优先（可按需替换）

- Electron + React + TypeScript + Vite
- Tailwind + shadcn/ui（或等价组件库）
- SQLite + Prisma（或 Drizzle）
- keytar（系统 Keychain）
- electron-builder（打包）

---

## 快速开始（开发）

> 以下命令以你实际工程脚手架为准（OpenCode 会生成对应 scripts）

### 1) 安装依赖
```bash
pnpm install