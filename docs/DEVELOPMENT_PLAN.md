# SoloForge 完整开发规划

> 版本：v1.0 | 日期：2026-08-02 | 状态：规划中

---

## 一、项目现状概览

### 1.1 已完成功能（M0-M12）

| 模块 | 状态 | 说明 |
|------|------|------|
| M0 基础设施层 | ✅ | Electron + React + Vite + TypeScript + Prisma + safeStorage |
| M1 工单管理 | ✅ | 看板视图 + 详情页 + 交付物 |
| M2 团队管理 | ✅ | Role/Agent/Tool CRUD + 授权矩阵 |
| M3 审批流程 | ✅ | 审批中心 + approval-guard |
| M4 审计系统 | ✅ | append-only 审计日志 + 哈希链防篡改 |
| M5 Claude Code 连接 | ✅ | Local + Remote + WebSocket + 诊断 |
| M6 配置中心 | ✅ | 表单/JSON 编辑 + Diff + 回滚 + 快照 |
| M7 打包 | ✅ | electron-builder (Windows/macOS/Linux) |
| M8 Workspace 隔离 | ✅ | 多工作区 + Keychain namespace |
| M9 Jobs 执行引擎 | ✅ | 幂等 + 重试 + 监控 |
| M10 Policy-as-Code | ✅ | 四大策略 + Policy Guard |
| M11 变更管理 | ✅ | Workspace 分级 + Drift 检测 + 变更单 |
| M12 配置中心增强版 | ✅ | 模型配置 + 草稿机制 + Undo/Redo |

### 1.2 技术债状态

| 任务 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| T-001 拆分 api-server.ts | P0 | ⏳ | 当前 173 行（已部分拆分），需继续完善路由模块 |
| T-002 统一审计中间件 | P0 | ✅ | audit-wrapper.ts 已创建并应用 |
| T-003 统一 Prisma Client | P0 | ✅ | db.ts 统一导出 |
| T-004 Actor 上下文提取 | P0 | ✅ | auth-context.ts 已创建 |
| T-005 本地 API 认证 | P0 | ✅ | local-auth.ts 已实现 |
| T-006 审计日志哈希链 | P1 | ✅ | previousHash/currentHash 已添加 |
| T-007 SQLite PRAGMA | P1 | ✅ | optimizeSqlite() 已实现 |
| T-008 服务层依赖注入 | P1 | ⏳ | 未开始 |
| T-009 单元测试 | P1 | ⏳ | 未开始 |
| T-010 集成测试 | P1 | ⏳ | 未开始 |
| T-011 连接池管理 | P2 | ⏳ | 未开始 |
| T-012 性能监控 | P2 | ⏳ | 未开始 |

### 1.3 待完成功能

| 功能 | 优先级 | 状态 |
|------|--------|------|
| E2E 测试覆盖 | P1 | ⏳ 16 个测试套件，需稳定 |
| 多语言支持 | P2 | ⏳ |
| 主题切换 | P2 | ⏳ |
| 插件系统 | P2 | ⏳ |
| 数据导入/导出 | P2 | ⏳ |

---

## 二、长期愿景

### 2.1 愿景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SoloForge 发展愿景                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   2026 Q3              2026 Q4              2027 Q1              2027 Q2+│
│  ─────────────        ─────────────        ─────────────        ─────────│
│                                                                          │
│  📦 Foundation         🚀 Growth             🌟 Platform          🏢 Enterprise
│  ├── 技术债清理        ├── 开源核心           ├── 插件系统         ├── 多租户
│  ├── Agent Harness     ├── Agent Harness     ├── 市场平台         ├── SSO/RBAC
│  │   ├── 实时调试台    │   ├── 行动预览       ├── Web 版本        ├── 审计报告
│  │   ├── 行动预览      │   ├── 流水线编排     ├── 团队协作        └── SLA 支持
│  │   ├── 流水线编排    │   └── 多Agent调度    ├── 移动端          │
│  │   └── 多Agent调度   ├── CI/CD             └── AI增强           │
│  └── 安全加固          ├── 单元测试 >80%                           │
│                       └── 性能优化                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心价值主张

> **"Secure, auditable AI team collaboration in a box"**
> 
> **"让人类始终保持对 AI Agent 的掌控力"**

---

## 三、完整开发规划

### 3.1 阶段一：Foundation（2026 Q3）

**目标**：清理技术债，建立 Agent Harness 基础

#### 3.1.1 技术债清理（P0-P1）

| 任务 | 工作量 | 依赖 | 验收标准 |
|------|--------|------|---------|
| T-001 完成 api-server.ts 路由拆分 | 中 | - | api-server.ts < 200 行，路由模块独立 |
| T-008 服务层依赖注入改造 | 大 | T-001 | 核心服务支持 DI，便于测试 |
| T-009 单元测试 | 大 | T-008 | 核心服务测试覆盖率 > 70% |
| T-010 集成测试 | 中 | T-009 | 关键 API 集成测试通过 |

**执行顺序**：
```
T-001 路由拆分 → T-008 DI 改造 → T-009 单元测试 → T-010 集成测试
```

#### 3.1.2 Agent Harness Phase 1：实时调试台

| 任务 | 工作量 | 依赖 | 验收标准 |
|------|--------|------|---------|
| WebSocket 流式事件接收 | 中 | M5 Claude Code 连接 | 支持接收 Claude Code 流式输出 |
| 流式输出展示组件 | 中 | - | 实时显示思考过程 |
| 工具调用树状图 | 中 | - | 展示 tool_call/tool_result |
| 消息历史回放 | 小 | - | 支持回放会话历史 |
| 性能统计面板 | 小 | - | Token 消耗、工具调用耗时统计 |

**数据模型**：
```prisma
model AgentSession {
  id          String   @id @default(uuid())
  agentId     String
  workspaceId String
  status      String
  startedAt   DateTime
  events      AgentStreamEvent[]
}

model AgentStreamEvent {
  id        String   @id @default(uuid())
  sessionId String
  type      String   // thinking, tool_call, tool_result, message, error
  content   String?  // JSON
  latency   Int?
  createdAt DateTime
}
```

**新增页面**：
- `/agent-console`：实时调试台主页

#### 3.1.3 安全加固

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| 第三方安全审计 | 大 | 安全审计报告 |
| 渗透测试 | 中 | 渗透测试报告 |
| Dependabot 依赖扫描 | 小 | CI 集成 |
| 代码签名 | 中 | Release 签名 |

#### 3.1.4 阶段一交付物

```
✅ T-001 api-server.ts 路由拆分完成
✅ T-008 服务层 DI 改造完成
✅ T-009 单元测试 > 70%
✅ T-010 集成测试通过
✅ Agent Harness 实时调试台上线
✅ 安全加固完成
```

---

### 3.2 阶段二：Growth（2026 Q4）

**目标**：开源核心 + Agent Harness 控制层 + 行动预览

#### 3.2.1 开源发布准备

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| 清理内部代码/注释 | 中 | 无内部信息泄露 |
| 创建安装脚本 | 小 | npm/Homebrew/Winget |
| API 文档 | 大 | Swagger/OpenAPI |
| 演示视频 | 中 | 5 分钟 Demo |
| CI/CD 流水线 | 中 | GitHub Actions |

#### 3.2.2 Agent Harness Phase 2：行动预览 + 审批

| 任务 | 工作量 | 依赖 | 验收标准 |
|------|--------|------|---------|
| 行动计划生成器 | 大 | Phase 1 | 生成完整执行计划 |
| 风险评估器 | 中 | - | 自动评估每步风险 |
| 预览审批流 | 中 | M3 审批 | 高风险步骤自动审批 |
| 模拟执行（dry-run） | 中 | - | 验证计划可行性 |
| 计划修改与对比 | 小 | - | 人工调整计划 |

**数据模型**：
```prisma
model ActionPlan {
  id              String   @id @default(uuid())
  workspaceId     String
  task            String
  status          String   // draft, reviewing, approved, executing
  totalRisk       String
  steps           ActionStep[]
}

model ActionStep {
  id              String   @id @default(uuid())
  planId          String
  "order"         Int
  type            String   // tool_call, reasoning, approval_gate
  description     String
  riskLevel       String
  requiresApproval Boolean
  status          String
}
```

**新增页面**：
- `/action-plan`：行动计划预览与审批

#### 3.2.3 Agent Harness Phase 3：流水线编排器

| 任务 | 工作量 | 依赖 | 验收标准 |
|------|--------|------|---------|
| 流水线定义 DSL | 中 | - | YAML/JSON 定义 |
| 可视化流水线编辑器 | 大 | - | 拖拽编排 |
| 顺序/并行/条件执行 | 中 | Phase 1 | 支持三种执行模式 |
| 错误处理与回滚 | 中 | M11 变更管理 | 失败回滚 |
| 流水线市场模板 | 小 | - | 预设模板 |

**数据模型**：
```prisma
model Pipeline {
  id          String   @id @default(uuid())
  name        String
  definition  String   // YAML/JSON
  enabled     Boolean
  executions  PipelineExecution[]
}

model PipelineExecution {
  id          String   @id @default(uuid())
  pipelineId  String
  status      String   // running, completed, failed
  inputs      String   // JSON
  outputs     String?
  stageResults PipelineStageResult[]
}
```

**新增页面**：
- `/pipelines`：流水线管理
- `/pipeline/:id/edit`：流水线编辑器

#### 3.2.4 性能优化

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| T-011 连接池管理 | 中 | LRU 限制最大连接数 |
| T-012 性能监控 | 中 | P50/P95/P99 指标 |
| 数据库查询优化 | 中 | 慢查询 < 100ms |
| UI 渲染优化 | 小 | 列表虚拟滚动 |

#### 3.2.5 阶段二交付物

```
✅ 开源核心发布
✅ Agent Harness 行动预览上线
✅ Agent Harness 流水线编排器上线
✅ T-011 连接池管理完成
✅ T-012 性能监控完成
✅ CI/CD 流水线完成
```

---

### 3.3 阶段三：Platform（2027 Q1）

**目标**：插件系统 + 多 Agent 协作调度 + 商业化准备

#### 3.3.1 Agent Harness Phase 4：多 Agent 协作调度

| 任务 | 工作量 | 依赖 | 验收标准 |
|------|--------|------|---------|
| 自然语言任务解析 | 大 | - | 解析用户意图 |
| 任务自动拆解 | 大 | - | 拆解为子任务 |
| Agent 智能匹配 | 中 | M2 团队管理 | 角色/能力匹配 |
| 协作上下文管理 | 中 | Phase 1 | 共享内存 |
| 冲突解决策略 | 中 | - | 多 Agent 输出冲突处理 |
| 结果聚合与输出 | 小 | - | 汇总结果 |

**数据模型**：
```prisma
model OrchestrationTask {
  id          String   @id @default(uuid())
  workspaceId String
  rawInput    String
  parsedIntent String?
  status      String
  subtasks    OrchestrationSubTask[]
}

model OrchestrationSubTask {
  id              String   @id @default(uuid())
  taskId          String
  description     String
  requiredRole    String
  dependencies    String   // JSON array
  assignedAgentId String?
  status          String
  outputs         String?  // JSON
}
```

**新增页面**：
- `/orchestrator`：多 Agent 协作调度器

#### 3.3.2 插件系统

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| 插件 API 设计 | 中 | 清晰的扩展点 |
| 插件沙箱安全 | 大 | 隔离执行 |
| 插件市场后端 | 中 | 插件列表/搜索 |
| 官方插件 | 小 | GitHub, Slack, Notion |
| 插件审核流程 | 中 | 审核工作流 |

#### 3.3.3 商业化准备

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| Pro 套餐设计 | 小 | $29/月 |
| 支付集成 | 中 | Stripe |
| 许可证管理 | 中 | 许可证密钥 |
| 使用分析 | 小 | 使用统计 |
| 客户支持 | 小 | 工单系统 |

#### 3.3.4 移动端

| 任务 | 工作量 | 验收标准 |
|------|--------|---------|
| iOS App | 大 | React Native |
| Android App | 大 | React Native |
| 推送通知 | 中 | 实时通知 |
| 快捷操作 | 小 | Widget |

#### 3.3.5 阶段三交付物

```
✅ Agent Harness 多 Agent 协作调度上线
✅ 插件系统上线
✅ Pro 商业化套餐发布
✅ 移动端 App 上架
```

---

### 3.4 阶段四：Enterprise（2027 Q2+）

**目标**：企业级功能 + 全球扩张

#### 3.4.1 企业特性

| 功能 | 说明 |
|------|------|
| 多租户架构 | 完全隔离的租户环境 |
| SSO 集成 | SAML/OIDC 支持 |
| RBAC | 细粒度角色权限控制 |
| 审计报告导出 | SIEM 集成 |
| 合规报告 | SOC 2, GDPR |

#### 3.4.2 团队协作

| 功能 | 说明 |
|------|------|
| 实时协作 | 多用户同时操作 |
| 共享工作区 | 团队共享配置 |
| @提及 | 团队成员通知 |
| 活动聚合 | 跨用户活动汇总 |

#### 3.4.3 高级集成

| 集成 | 说明 |
|------|------|
| Jira/Linear | 项目管理同步 |
| GitHub/GitLab | 代码管理同步 |
| PagerDuty | 告警通知 |
| Datadog/Splunk | 日志分析 |

#### 3.4.4 AI 增强

| 功能 | 说明 |
|------|------|
| 智能工单路由 | AI 自动分配 |
| 异常检测 | 运行时异常识别 |
| 预测性维护 | 提前预警 |
| 自然语言查询 | NL2SQL |

---

## 四、详细任务分解

### 4.1 2026 Q3 详细计划（8月-9月）

#### 8月：技术债清理

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | T-001 完成路由拆分 | api-server.ts < 200 行 |
| W3 | T-008 服务层 DI 改造 | ServiceDeps 接口 |
| W4 | T-009 单元测试框架搭建 | 测试基础设施 |

#### 9月：实时调试台 + 安全

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | WebSocket 流式事件接收 | AgentStreamEvent 模型 |
| W2 | 流式输出展示组件 | StreamingView 组件 |
| W3 | 工具调用树状图 | ToolCallTree 组件 |
| W4 | 安全加固 + 审计 | 安全报告 |

### 4.2 2026 Q4 详细计划（10月-12月）

#### 10月：行动预览

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | 行动计划生成器 | ActionPlan 模型 |
| W3 | 风险评估器 | Risk Assessor |
| W4 | 预览审批流 | 集成 Approval Guard |

#### 11月：流水线编排

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | 流水线定义 DSL | Pipeline 模型扩展 |
| W3 | 可视化编辑器 | Pipeline Editor |
| W4 | 错误处理与回滚 | Rollback 机制 |

#### 12月：开源 + 性能

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | 开源发布准备 | GitHub Release |
| W3 | T-011 连接池管理 | LRU Cache |
| W4 | T-012 性能监控 | Metrics Dashboard |

### 4.3 2027 Q1 详细计划（1月-3月）

#### 1月：多 Agent 调度

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | 自然语言解析 | Task Parser |
| W3-W4 | 任务拆解引擎 | Task Decomposer |

#### 2月：Agent 协作

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | Agent 匹配与调度 | Agent Matcher |
| W3-W4 | 协作上下文管理 | Shared Memory |

#### 3月：商业化 + 插件

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-W2 | 插件系统 | Plugin API |
| W3-W4 | Pro 套餐 | Stripe 集成 |

---

## 五、里程碑

| 版本 | 目标 | 日期 | 状态 |
|------|------|------|------|
| v0.1.0 | MVP 核心功能 | ✅ 2026-07 | 完成 |
| v0.2.0 | 开源发布 | 📅 2026-10 | 规划 |
| v0.3.0 | Agent Harness 完整 | 📅 2026-12 | 规划 |
| v1.0.0 | 商业化发布 | 📅 2027-01 | 规划 |
| v1.1.0 | 企业特性 | 📅 2027-04 | 规划 |
| v2.0.0 | 平台生态 | 📅 2027-10 | 规划 |

---

## 六、资源估算

### 6.1 开发工作量

| 阶段 | 任务数 | 预估人天 |
|------|--------|---------|
| Phase 1 (Q3) | 12 | 45 |
| Phase 2 (Q4) | 15 | 55 |
| Phase 3 (Q1) | 10 | 40 |
| Phase 4 (Q2+) | 15 | 60 |
| **总计** | **52** | **200** |

### 6.2 团队需求

| 角色 | Q3 | Q4 | Q1 | Q2+ |
|------|----|----|----|-----|
| 前端工程师 | 1 | 1 | 1 | 1 |
| 后端工程师 | 1 | 1 | 1 | 1 |
| 全栈工程师 | 1 | 1 | 2 | 2 |
| DevOps | 0.5 | 0.5 | 0.5 | 1 |
| UI/UX | 0.5 | 0.5 | 0.5 | 0.5 |
| 测试 | 0.5 | 1 | 1 | 1 |

---

## 七、风险与对策

| 风险 | 影响 | 概率 | 对策 |
|------|------|------|------|
| Claude Code API 变更 | 高 | 中 | 保持与官方同步，抽象适配层 |
| 技术债清理超期 | 中 | 高 | 预留 20% buffer，定期回顾 |
| 开源社区反馈 | 中 | 中 | 快速响应，建立社区治理 |
| 安全漏洞 | 高 | 低 | 定期安全审计，依赖更新 |
| 商业化不达预期 | 高 | 中 | MVP 验证，持续迭代 |

---

## 八、附录

### A. 相关文档

- [AGENT_HARNESS_DESIGN.md](./AGENT_HARNESS_DESIGN.md) - Agent Harness 详细设计
- [TECH_DEBT_TASKS.md](./docs/TECH_DEBT_TASKS.md) - 技术债清单
- [ROADMAP.md](./ROADMAP.md) - 产品路线图

### B. 参考资料

- Claude Code 官方文档
- Agent 系统设计最佳实践
- 安全审计标准 (OWASP)

---

*文档版本：v1.0 | 最后更新：2026-08-02*
