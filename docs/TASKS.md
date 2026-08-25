# SoloForge 开发任务清单 (GitHub Issues 格式)

> 生成日期: 2026-08-01
> 格式: 可直接复制到 GitHub Issues 或项目管理工具

---

## Phase 1: 完善体验 (Q3 2026)

### P1-T001: i18n 基础设施搭建

```
---
title: "[P1-T001] i18n 基础设施搭建"
labels: enhancement, i18n, phase-1
milestone: Phase 1 - 完善体验
---

## 描述

搭建多语言支持的基础设施，使应用支持中英文切换。

## 验收标准

- [ ] 创建 `resources/locales/` 目录结构
- [ ] 配置 react-i18next，支持按需加载
- [ ] 语言检测: localStorage > navigator.language > 默认
- [ ] 提取 Dashboard 页面硬编码文本作为示例
- [ ] 语言切换器组件 (设置页面)

## 技术方案

```typescript
// 目录结构
resources/locales/
├── en-US/
│   └── translation.json
└── zh-CN/
    └── translation.json

// i18next 配置
{
  lng: 'auto',           // 自动检测
  fallbackLng: 'en-US',
  ns: ['translation'],
  defaultNS: 'translation',
  backend: {
    loadPath: '/locales/{{lng}}/{{ns}}.json'
  },
  interpolation: {
    escapeValue: false
  }
}
```

## 工作量

3 人日

## 依赖

无

## 备注

参考: https://react.i18next.com/
```

---

### P1-T002: 核心 UI 文本翻译

```
---
title: "[P1-T002] 核心 UI 文本翻译"
labels: enhancement, i18n, phase-1
milestone: Phase 1 - 完善体验
---

## 描述

将应用核心页面的硬编码文本提取到翻译文件中，支持中英文切换。

## 验收标准

### P0 - 核心页面 (必须完成)

- [ ] Dashboard (Dashboard.tsx)
  - 概览卡片标题
  - 状态标签 (Healthy/Degraded/Unreachable)
  - 时间范围选择器

- [ ] 工单管理 (TicketBoard.tsx, TicketDetail.tsx)
  - 状态流标签 (INBOX/SPEC/DEV/TEST/DELIVERY/DONE)
  - 优先级标签 (LOW/MEDIUM/HIGH/URGENT)
  - 操作按钮文本

- [ ] 审批中心 (ApprovalCenter.tsx)
  - 审批状态 (PENDING/APPROVED/REJECTED)
  - 操作按钮

### P1 - 配置页面 (尽量完成)

- [ ] 连接设置 (ConnectionSettings.tsx)
- [ ] 配置中心 (ConfigCenter.tsx)
- [ ] 部署管理 (Deployments.tsx)

### P2 - 其他页面 (80% 完成)

- [ ] 团队管理 (TeamManagement.tsx)
- [ ] 审计日志 (AuditLogs.tsx)
- [ ] 其他页面

## 工作量

8 人日

## 依赖

P1-T001

## 备注

翻译键命名规范: `{page}_{section}_{element}`

示例:
- `dashboard_overview_title`
- `ticket_status_inbox`
- `approval_action_approve`
```

---

### P1-T003: 主题系统增强

```
---
title: "[P1-T003] 主题系统增强"
labels: enhancement, ui, phase-1
milestone: Phase 1 - 完善体验
---

## 描述

增强主题系统，提供预设主题和自定义主题功能。

## 验收标准

- [ ] 提供 5 种预设主题 (Classic, Ocean, Forest, Sunset, Purple)
- [ ] 支持自定义主题颜色 (主色、背景色、强调色)
- [ ] 颜色选择器组件
- [ ] 主题预览实时更新
- [ ] 主题切换无闪烁
- [ ] 主题配置可导入/导出 (JSON)
- [ ] 主题偏好跨会话保存 (localStorage)

## 技术方案

```typescript
// 主题预设
interface ThemePreset {
  id: string
  name: string
  colors: {
    primary: string
    background: string
    accent: string
  }
}

// 预设主题
const presets: ThemePreset[] = [
  { id: 'classic', name: 'Classic', colors: { primary: '#3B82F6', background: '#FFFFFF', accent: '#3B82F6' } },
  { id: 'ocean', name: 'Ocean', colors: { primary: '#06B6D4', background: '#0F172A', accent: '#06B6D4' } },
  { id: 'forest', name: 'Forest', colors: { primary: '#22C55E', background: '#14532D', accent: '#86EFAC' } },
  { id: 'sunset', name: 'Sunset', colors: { primary: '#F97316', background: '#FFFBEB', accent: '#FB923C' } },
  { id: 'purple', name: 'Purple', colors: { primary: '#A855F7', background: '#1E1B4B', accent: '#F0ABFC' } }
]
```

## 工作量

5 人日

## 依赖

P1-T001

## 备注

参考 Tailwind CSS 自定义主题配置
```

---

### P1-T004: E2E 测试完善

```
---
title: "[P1-T004] E2E 测试完善"
labels: testing, e2e, phase-1
milestone: Phase 1 - 完善体验
---

## 描述

完善 Playwright E2E 测试覆盖，确保核心路径稳定可靠。

## 验收标准

### P0 - 核心路径 (测试覆盖率 > 90%)

- [ ] Dashboard 完整流程
  - [ ] 全局总览数据展示
  - [ ] Workspace 切换
  - [ ] 主题切换
  - [ ] Critical Issues 跳转
  - [ ] Pending Actions 跳转

- [ ] 工单管理
  - [ ] 创建工单
  - [ ] 拖拽工单到不同状态
  - [ ] 查看工单详情
  - [ ] 添加标签
  - [ ] 绑定联系人

- [ ] 团队管理
  - [ ] 查看 Agent 列表
  - [ ] 启用/禁用 Agent
  - [ ] 查看工具授权

- [ ] 审批流程
  - [ ] 查看待审批列表
  - [ ] 批准操作
  - [ ] 拒绝操作
  - [ ] 审批后状态更新

### P1 - 配置路径 (测试覆盖率 > 70%)

- [ ] 连接设置
- [ ] 配置中心
- [ ] 部署管理

### P2 - 高级功能

- [ ] Host Agent
- [ ] 升级中心

## 技术方案

```typescript
// 测试数据工厂
class TestDataFactory {
  static createTicket(overrides?: Partial<Ticket>): Ticket {
    return {
      id: `ticket_${Date.now()}`,
      title: `测试工单 ${Date.now()}`,
      status: 'INBOX',
      priority: 'MEDIUM',
      ...overrides
    }
  }
  
  static createAgent(overrides?: Partial<Agent>): Agent {
    return {
      id: `agent_${Date.now()}`,
      name: `测试 Agent ${Date.now()}`,
      roleId: 'role_dev',
      model: 'claude-3-5-sonnet-20240620',
      runtime: 'cloud',
      enabled: true,
      ...overrides
    }
  }
}
```

## 工作量

15 人日

## 依赖

无

## 备注

测试稳定性要求: 连续运行 5 次无失败
```

---

## Phase 2: 能力扩展 (Q3-Q4 2026)

### P2-T001: 数据导入功能

```
---
title: "[P2-T001] 数据导入功能"
labels: enhancement, data, phase-2
milestone: Phase 2 - 能力扩展
---

## 描述

支持 CSV/Excel/JSON 格式的数据导入，包括工单、联系人和配置数据。

## 验收标准

- [ ] 支持 CSV/Excel 导入工单
  - [ ] 字段映射可视化配置
  - [ ] 必填字段验证
  - [ ] 重复数据处理 (跳过/覆盖/新建)

- [ ] 支持 CSV/Excel 导入联系人
- [ ] 支持 JSON 导入配置
- [ ] 导入预览确认
- [ ] 错误报告详细 (行号、错误原因)
- [ ] 编码自动检测 (UTF-8/GBK)

## 技术方案

```typescript
// 导入配置
interface ImportConfig {
  type: 'tickets' | 'contacts' | 'config'
  format: 'csv' | 'excel' | 'json'
  fieldMapping: Record<string, string>
  onDuplicate: 'skip' | 'overwrite' | 'create'
  encoding?: 'utf-8' | 'gbk'
}

// 导入流程
async function importData(config: ImportConfig, file: File): Promise<ImportResult> {
  const parser = getParser(config.format)
  const records = await parser.parse(file, config.encoding)
  const mapped = config.fieldMapping ? mapFields(records, config.fieldMapping) : records
  const validated = validateRecords(mapped, config.type)
  const preview = await showPreview(validated)
  if (await confirm(preview)) {
    return writeToDatabase(config.type, validated)
  }
}
```

## 工作量

8 人日

## 依赖

P1-T001

## 备注

使用 papaparse 解析 CSV，xlsx 解析 Excel
```

---

### P2-T002: 数据导出功能

```
---
title: "[P2-T002] 数据导出功能"
labels: enhancement, data, phase-2
milestone: Phase 2 - 能力扩展
---

## 描述

支持多种格式的数据导出，包括工单、审计日志和统计报表。

## 验收标准

- [ ] 支持多格式导出 (CSV/Excel/JSON/PDF)
- [ ] 字段可选择
- [ ] 筛选条件丰富 (日期范围、状态、优先级、标签)
- [ ] 导出历史记录
- [ ] 导出进度显示
- [ ] 审计日志导出 (敏感字段已掩码)
- [ ] 统计报表导出 (Excel/PDF)

## 技术方案

```typescript
// 导出配置
interface ExportConfig {
  type: 'tickets' | 'audit_logs' | 'report'
  format: 'csv' | 'excel' | 'json' | 'pdf'
  fields?: string[]
  filter?: {
    dateRange?: { start: Date; end: Date }
    status?: string[]
    priority?: string[]
    tags?: string[]
  }
  includeHeaders?: boolean
}

// 导出历史
interface ExportHistory {
  id: string
  config: ExportConfig
  status: 'pending' | 'processing' | 'completed' | 'failed'
  downloadUrl?: string
  expiresAt: Date
  createdAt: Date
}
```

## 工作量

5 人日

## 依赖

P2-T001

## 备注

使用 jsPDF + jspdf-autotable 生成 PDF 报表
```

---

### P2-T003: Webhook 事件订阅

```
---
title: "[P2-T003] Webhook 事件订阅系统"
labels: enhancement, integration, phase-2
milestone: Phase 2 - 能力扩展
---

## 描述

实现 Webhook 系统，支持事件订阅、签名验证、自动重试和投递日志。

## 验收标准

- [ ] 创建/编辑/删除 Webhook 配置
- [ ] 支持多种事件类型订阅:
  - [ ] ticket.created, ticket.updated, ticket.status_changed
  - [ ] approval.created, approval.approved, approval.rejected
  - [ ] deployment.started, deployment.completed, deployment.failed
  - [ ] agent.online, agent.offline
  - [ ] alert.created, alert.resolved
- [ ] HMAC-SHA256 签名验证
- [ ] 自动重试机制 (指数退避)
- [ ] 投递日志完整记录
- [ ] Webhook 测试功能

## 技术方案

```typescript
// Webhook 配置
interface Webhook {
  id: string
  name: string
  url: string
  events: string[]
  secret: string
  headers: Record<string, string>
  enabled: boolean
  retryPolicy: {
    maxRetries: number
    backoff: 'linear' | 'exponential'
    timeout: number
  }
}

// 签名验证
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const timestamp = signature.split('.')[0]
  if (Date.now() - parseInt(timestamp) > 5 * 60 * 1000) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  return `sha256=${expected}` === signature
}

// 投递日志
interface WebhookDeliveryLog {
  id: string
  webhookId: string
  event: string
  request: { headers: object; body: string }
  response: { status: number; body: string }
  attempts: number
  status: 'success' | 'failed' | 'retrying'
  error?: string
  deliveredAt: Date
}
```

## 工作量

10 人日

## 依赖

无

## 备注

参考 GitHub Webhook 设计
```

---

### P2-T004: 插件系统

```
---
title: "[P2-T004] 插件系统"
labels: enhancement, extensibility, phase-2
milestone: Phase 2 - 能力扩展
---

## 描述

实现可扩展的插件系统，支持第三方开发者扩展功能。

## 验收标准

- [ ] 插件目录结构定义 (plugin.json)
- [ ] 插件安装/卸载/启用/禁用
- [ ] 插件 API 定义 (PluginAPI)
- [ ] 插件沙箱安全隔离
- [ ] 插件权限声明与审批
- [ ] 至少一个示例插件

## 技术方案

```typescript
// 插件定义 (plugin.json)
interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  main: string
  permissions: string[]
  contributes: {
    pages?: { path: string; component: string }[]
    actions?: { id: string; label: string; handler: string }[]
    webhooks?: { event: string; handler: string }[]
  }
}

// 插件 API
interface PluginAPI {
  tickets: {
    list(filter: TicketFilter): Promise<Ticket[]>
    get(id: string): Promise<Ticket>
    create(data: CreateTicketInput): Promise<Ticket>
  }
  notifications: {
    show(message: string, type: 'info' | 'success' | 'warning' | 'error'): void
    toast(message: string, duration?: number): void
  }
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }
  ui: {
    registerPage(config: PageConfig): void
    registerAction(config: ActionConfig): void
  }
}

// 插件沙箱
class PluginSandbox {
  constructor(plugin: PluginManifest, api: PluginAPI) {
    this.context = vm.createContext({
      ...api,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    })
  }
  
  load(code: string): PluginInstance {
    return vm.runInContext(code, this.context)
  }
}
```

## 工作量

20 人日

## 依赖

P1-T004

## 备注

参考 VS Code 插件系统设计
```

---

## Phase 3: 企业级功能 (Q4 2026+)

### P3-T001: SaaS 架构设计

```
---
title: "[P3-T001] SaaS 多租户架构设计"
labels: architecture, enterprise, phase-3
milestone: Phase 3 - 企业级功能
---

## 描述

设计多租户 SaaS 架构，支持企业级部署。

## 验收标准

- [ ] 架构设计文档完成
- [ ] 数据模型扩展设计 (多租户隔离)
- [ ] SSO/LDAP 集成设计
- [ ] 计费系统设计

## 技术方案

```typescript
// 多租户数据隔离
// 方案1: Shared Database, Shared Schema
// 方案2: Shared Database, Separate Schema
// 方案3: Separate Database (推荐用于高安全需求)

// 推荐方案: Shared Database + workspace_id
interface Tenant {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  settings: TenantSettings
  createdAt: Date
}

// 所有租户数据表都包含 workspace_id
interface Ticket {
  id: string
  workspaceId: string  // 租户隔离字段
  title: string
  // ...
}
```

## 工作量

待定 (架构设计阶段)

## 依赖

Phase 1 + Phase 2 完成

## 备注

可选功能，非必做
```

---

### P3-T002: 开发者 API

```
---
title: "[P3-T002] 开发者 API 开放平台"
labels: enhancement, api, enterprise, phase-3
milestone: Phase 3 - 企业级功能
---

## 描述

开放 REST API，支持第三方系统集成。

## 验收标准

- [ ] OpenAPI 3.0 规范定义
- [ ] API Key 管理 UI
- [ ] REST API 实现:
  - [ ] 工单管理: CRUD
  - [ ] 审批管理: 列表/批准/拒绝
  - [ ] 审计日志: 查询/导出
  - [ ] Webhook: 配置管理
- [ ] OAuth 2.0 认证 (企业版)
- [ ] 限流实现 (100-10000 req/hour)
- [ ] 使用文档和代码示例

## 技术方案

```yaml
# OpenAPI 规范片段
openapi: 3.0.0
info:
  title: SoloForge API
  version: 1.0.0
  description: REST API for SoloForge
paths:
  /api/tickets:
    get:
      summary: List tickets
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [INBOX, SPEC, DEV, TEST, DELIVERY, DONE]
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Ticket'
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
  schemas:
    Ticket:
      type: object
      properties:
        id:
          type: string
        title:
          type: string
        status:
          type: string
```

## 工作量

15 人日

## 依赖

Phase 2 完成

## 备注

需要配合 P2-T003 Webhook 实现完整的事件通知能力
```

---

## 任务统计

| 阶段 | 任务数 | 总工作量 |
|------|--------|----------|
| Phase 1 | 4 | 31 人日 |
| Phase 2 | 4 | 43 人日 |
| Phase 3 | 2 | 15+ 人日 |
| **总计** | **10** | **89+ 人日** |

---

## 任务依赖

```
P1-T001 ─┬─> P1-T002 ─> P1-T003
         │
         └─> P1-T004 ─> P2-T004

P2-T001 ─> P2-T002
P2-T003
P2-T004

(P2 完成) ─> P3-T001
         ─> P3-T002
```

---

*生成时间: 2026-08-01*
