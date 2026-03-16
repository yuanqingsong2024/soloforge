# SoloForge 开发文档

## 项目概述

SoloForge 是一个基于 Electron 的 PC 桌面应用，用于管理 AI 团队与员工，并与 OpenClaw（本地与远程）联动。

## 已完成功能（M0 基础设施层）

### ✅ M0.1: 项目脚手架
- Electron + React + Vite + TypeScript
- 完整的开发环境配置
- 支持热重载开发模式

### ✅ M0.2: 数据库设计
- Prisma + SQLite
- 8 个核心数据模型：
  - Role（岗位）
  - Agent（员工）
  - Tool（工具）
  - AgentTool（授权）
  - Ticket（工单）
  - Artifact（交付物）
  - Approval（审批）
  - AuditLog（审计日志）
  - ConnectionProfile（连接配置）
  - ConfigSnapshot（配置快照）

### ✅ M0.3: 种子数据
- 5 个默认岗位（Support / PM&Writer / Dev / QA / Ops）
- 每个岗位包含：
  - 详细描述
  - 默认 Prompt
  - 结构化输出 Schema
  - 风险等级
- 4 个示例工具
- 1 个示例 Agent
- 默认本地连接配置

### ✅ M0.4: Keychain 集成
- 跨平台密钥存储（Windows/macOS/Linux）
- KeychainService 封装
- 支持存储/读取/删除/列表操作
- UI 掩码显示功能

### ✅ M0.5: 本地 API 服务器
- Fastify 服务器（随机端口）
- RESTful API 端点：
  - `/api/roles` - 岗位管理
  - `/api/agents` - 员工管理
  - `/api/tools` - 工具管理
  - `/api/tickets` - 工单管理
  - `/api/artifacts` - 交付物管理
  - `/api/approvals` - 审批管理
  - `/api/audit-logs` - 审计日志
  - `/api/profiles` - 连接配置
  - `/api/health` - 健康检查

### ✅ M0.6: UI 基础
- Tailwind CSS 配置
- React 基础组件
- 展示岗位和员工列表
- 响应式布局

## 快速开始

### 安装依赖
```bash
npm install
```

### 初始化数据库
```bash
npx prisma migrate dev
npx prisma db seed
```

### 开发模式
```bash
npm run dev
```

应用将启动 Electron 窗口，并自动连接到本地 API 服务器。

### 构建生产版本
```bash
npm run build
```

## 项目结构

```
soloforge/
├── prisma/
│   ├── schema.prisma          # 数据库 Schema
│   ├── seed.ts                # 种子数据
│   └── migrations/            # 数据库迁移
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 主进程入口
│   │   └── services/
│   │       ├── api-server.ts  # Fastify API 服务器
│   │       └── keychain.ts    # Keychain 服务
│   ├── preload/               # 预加载脚本
│   │   └── index.ts           # IPC 桥接
│   └── renderer/              # React UI
│       ├── App.tsx            # 主应用组件
│       ├── main.tsx           # React 入口
│       └── index.css          # 全局样式
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 待实现功能

### M1: 工单管理
- [ ] M1.1: 工单看板（按状态列展示 + 拖拽流转）
- [ ] M1.2: 工单详情页（时间线 + Artifacts）

### M2: 团队管理
- [ ] M2.1: Role/Agent/Tool CRUD 页面
- [ ] M2.2: AgentTool 授权矩阵

### M3: 审批流程
- [ ] M3.1: Approval 创建与审批逻辑
- [ ] M3.2: 审批中心页面
- [ ] M3.3: 硬编码风控规则

### M4: 审计系统
- [ ] M4.1: AuditLog 全链路记录
- [ ] M4.2: 审计日志页面

### M5: OpenClaw 连接
- [ ] M5.1: Connection Profiles 管理
- [ ] M5.2: OpenClawClient 封装
- [ ] M5.3: 连接诊断页面

### M6: 配置中心
- [ ] M6.1: OpenClaw 配置读取与展示
- [ ] M6.2: 配置 diff + apply + 回滚
- [ ] M6.3: 配置限频处理
- [ ] M6.4: 密钥管理

### M7: 打包与测试
- [ ] M7.1: electron-builder 配置
- [ ] M7.2: 完善 README
- [ ] M7.3: 自测清单

## API 端点说明

### Roles（岗位）
- `GET /api/roles` - 获取所有岗位
- `GET /api/roles/:id` - 获取单个岗位

### Agents（员工）
- `GET /api/agents` - 获取所有员工
- `POST /api/agents` - 创建员工
- `PUT /api/agents/:id` - 更新员工
- `DELETE /api/agents/:id` - 删除员工

### Tools（工具）
- `GET /api/tools` - 获取所有工具

### Tickets（工单）
- `GET /api/tickets` - 获取所有工单
- `POST /api/tickets` - 创建工单
- `PUT /api/tickets/:id` - 更新工单

### Artifacts（交付物）
- `POST /api/artifacts` - 创建交付物

### Approvals（审批）
- `GET /api/approvals?status=PENDING` - 获取审批列表
- `POST /api/approvals` - 创建审批
- `PUT /api/approvals/:id` - 更新审批状态

### Audit Logs（审计日志）
- `GET /api/audit-logs?ticketId=xxx&traceId=xxx&actor=xxx` - 查询审计日志
- `POST /api/audit-logs` - 创建审计日志

### Connection Profiles（连接配置）
- `GET /api/profiles` - 获取所有连接配置
- `POST /api/profiles` - 创建连接配置
- `GET /api/profiles/:id/credentials` - 获取凭证（掩码）

## 安全说明

### 密钥存储
- 所有敏感信息（token/password）存储在系统 Keychain
- 数据库中不存储明文密钥
- UI 只展示掩码值（如 `sk-****`）

### 审批机制
- 高危操作必须经过审批：
  - SEND_EXTERNAL（对外发送）
  - MERGE_MAIN（合并主干）
  - DEPLOY_PROD（生产部署）
  - EXPORT_DATA（导出数据）
  - PURCHASE（购买）
  - CHANGE_CONFIG（修改配置）
  - ROTATE_TOKEN（轮换令牌）

### 审计日志
- 所有关键操作记录到 AuditLog
- trace_id 贯穿整个操作链路
- 审计日志为 append-only（禁止修改/删除）
- 敏感字段自动掩码

## OpenClaw 连接说明

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

## 开发注意事项

### Electron 安全
- 启用 `contextIsolation`
- 启用 `sandbox`
- 禁用 `nodeIntegration`
- 使用 `contextBridge` 暴露 API

### 数据库迁移
```bash
# 创建新迁移
npx prisma migrate dev --name <migration_name>

# 应用迁移
npx prisma migrate deploy

# 重置数据库（开发环境）
npx prisma migrate reset
```

### 调试
- 主进程日志：查看终端输出
- 渲染进程日志：打开 DevTools（F12）
- API 日志：Fastify 自动记录到终端

## 常见问题

### Q: 如何修改数据库 Schema？
A: 编辑 `prisma/schema.prisma`，然后运行 `npx prisma migrate dev`

### Q: 如何添加新的 API 端点？
A: 在 `src/main/services/api-server.ts` 中添加新的路由

### Q: 如何存储新的密钥？
A: 使用 `KeychainService.setPassword(account, password)`

### Q: 如何添加新的审批类型？
A: 在 Prisma Schema 的 `Approval.actionType` 中添加新类型

## 下一步计划

1. 实现工单看板（拖拽功能可使用 `@dnd-kit/core`）
2. 实现 OpenClawClient（WebSocket 重连可使用 `reconnecting-websocket`）
3. 实现配置中心（JSON diff 可使用 `jsondiffpatch`）
4. 完善 UI 组件（可考虑集成 shadcn/ui）
5. 添加路由（可使用 `react-router-dom`）

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交变更
4. 推送到分支
5. 创建 Pull Request

## License

MIT
