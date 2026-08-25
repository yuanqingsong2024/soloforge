# SoloForge 开发任务规划 (2026 Q3-Q4)

> 基于商业价值分析和未来发展方向，制定详细的技术实现计划。

---

## 一、任务总览

| 阶段 | 周期 | 核心目标 | 优先级 |
|------|------|----------|--------|
| **Phase 1: 完善体验** | Q3 2026 | 多语言 + 主题 + 测试覆盖 | P0 |
| **Phase 2: 能力扩展** | Q3-Q4 2026 | 数据导入/导出 + Webhook + 插件系统 | P1 |
| **Phase 3: 规模化** | Q4 2026+ | 企业级功能 + API 平台 | P2 |

---

## 二、Phase 1: 完善体验 (Q3 2026)

### 1.1 多语言支持 (i18n)

#### 任务 ID: P1-T001
**任务名称**: i18n 基础设施搭建

**详细设计**:
```
技术方案:
- 使用 react-i18next (已有依赖)
- 语言文件目录: resources/locales/{lang}/translation.json
- 初始支持: en-US, zh-CN
- 命名空间: common, navigation, pages, errors, validation

文件结构:
resources/locales/
├── en-US/
│   ├── translation.json      # 主翻译文件
│   └── namespaces/
│       ├── common.json       # 通用标签
│       ├── navigation.json   # 导航
│       └── errors.json       # 错误消息
└── zh-CN/
    └── ...

i18n 配置:
- 默认语言: en-US
- 回退语言: en-US
- 语言检测: localStorage > navigator.language > 默认
- 延迟加载: 按需加载语言包
```

**验收标准**:
- [ ] i18next 配置正确，能在 React 组件中调用 t('key')
- [ ] 语言切换器显示在设置页面
- [ ] 切换语言后整个应用 UI 正确更新
- [ ] 新增页面遵循 i18n 规范

**工作量**: 3 人日

**依赖**: 无

---

#### 任务 ID: P1-T002
**任务名称**: 核心 UI 文本翻译

**详细设计**:
```
翻译范围 (按优先级):

P0 - 核心页面:
1. Dashboard (Dashboard.tsx)
   - 概览卡片标题
   - 状态标签 (Healthy/Degraded/Unreachable)
   - 时间范围选择器

2. 工单管理 (TicketBoard.tsx, TicketDetail.tsx)
   - 状态流标签 (INBOX/SPEC/DEV/TEST/DELIVERY/DONE)
   - 优先级标签 (LOW/MEDIUM/HIGH/URGENT)
   - 操作按钮文本

3. 审批中心 (ApprovalCenter.tsx)
   - 审批状态 (PENDING/APPROVED/REJECTED)
   - 操作按钮

P1 - 配置页面:
4. 连接设置 (ConnectionSettings.tsx)
5. 配置中心 (ConfigCenter.tsx)
6. 部署管理 (Deployments.tsx)

P2 - 其他页面:
7. 团队管理 (TeamManagement.tsx)
8. 审计日志 (AuditLogs.tsx)
...
```

**验收标准**:
- [ ] 所有 P0 页面完成翻译
- [ ] 所有 P1 页面完成翻译
- [ ] P2 页面翻译率达到 80%
- [ ] 翻译文件结构清晰，便于维护

**工作量**: 8 人日

**依赖**: P1-T001

---

### 1.2 主题切换

#### 任务 ID: P1-T003
**任务名称**: 主题系统增强

**详细设计**:
```
当前状态:
- 已实现 Light/Dark/System 三种主题
- 使用 CSS Variables (--color-*)

增强项:

1. 主题预设
┌─────────────────────────────────────────┐
│  预设名    │  主色   │  背景色  │  强调色  │
├───────────┼─────────┼─────────┼─────────┤
│  Classic  │  蓝色   │  白色   │  蓝色   │ (当前默认)
│  Ocean   │  青色   │  深蓝   │  青色   │
│  Forest  │  绿色   │  深绿   │  浅绿   │
│  Sunset  │  橙色   │  米白   │  珊瑚   │
│  Purple  │  紫色   │  深紫   │  粉紫   │
└─────────────────────────────────────────┘

2. 自定义主题
- 用户可自定义主色、背景色、强调色
- 颜色选择器 (hex/rgb 输入)
- 主题预览实时更新

3. 主题管理
- 导出主题配置 (JSON)
- 导入主题配置
- 预设主题重置

技术实现:
- 主题配置存储在 localStorage
- CSS Variables 动态更新
- 支持导入/导出
```

**验收标准**:
- [ ] 提供 5 种预设主题
- [ ] 支持自定义主题颜色
- [ ] 主题切换无闪烁
- [ ] 主题配置可导入/导出
- [ ] 主题偏好跨会话保存

**工作量**: 5 人日

**依赖**: P1-T001

---

### 1.3 E2E 测试覆盖

#### 任务 ID: P1-T004
**任务名称**: E2E 测试完善

**详细设计**:
```
当前状态:
- 已有 Playwright E2E 测试
- 覆盖 Dashboard 主路径

测试覆盖目标:

优先级 P0 (核心路径):
1. Dashboard 完整流程
   - [ ] 全局总览数据展示
   - [ ] Workspace 切换
   - [ ] 主题切换
   - [ ] Critical Issues 跳转
   - [ ] Pending Actions 跳转

2. 工单管理
   - [ ] 创建工单
   - [ ] 拖拽工单到不同状态
   - [ ] 查看工单详情
   - [ ] 添加标签
   - [ ] 绑定联系人

3. 团队管理
   - [ ] 查看 Agent 列表
   - [ ] 启用/禁用 Agent
   - [ ] 查看工具授权

4. 审批流程
   - [ ] 查看待审批列表
   - [ ] 批准操作
   - [ ] 拒绝操作
   - [ ] 审批后状态更新

优先级 P1 (配置路径):
5. 连接设置
   - [ ] 添加连接配置
   - [ ] 编辑连接配置
   - [ ] 删除连接配置
   - [ ] 连接诊断

6. 配置中心
   - [ ] 查看当前配置
   - [ ] 编辑配置 (表单模式)
   - [ ] 编辑配置 (JSON 模式)
   - [ ] Diff 对比
   - [ ] 保存草稿

7. 部署管理
   - [ ] 创建部署目标
   - [ ] 健康检查
   - [ ] 启动/停止服务
   - [ ] 查看日志

优先级 P2 (高级功能):
8. Host Agent
   - [ ] Bootstrap Wizard
   - [ ] Agent 注册
   - [ ] 心跳监控
   - [ ] 动作派发

9. 升级中心
   - [ ] 版本检测
   - [ ] 创建升级计划
   - [ ] Dry Run
   - [ ] 执行升级

测试基础设施:
- 测试数据工厂 (统一生成测试数据)
- 截图对比 (视觉回归)
- 视频录制 (失败时自动保存)
- 测试报告 (HTML + JSON)
```

**验收标准**:
- [ ] P0 测试覆盖率 > 90%
- [ ] P1 测试覆盖率 > 70%
- [ ] 所有测试稳定可重复
- [ ] CI/CD 集成
- [ ] 测试报告自动生成

**工作量**: 15 人日

**依赖**: 无

---

## 三、Phase 2: 能力扩展 (Q3-Q4 2026)

### 2.1 数据导入/导出

#### 任务 ID: P2-T001
**任务名称**: 数据导入功能

**详细设计**:
```
导入数据范围:

1. 工单数据 (CSV/Excel)
   字段映射:
   ┌────────────┬────────────┬────────────┐
   │  CSV列    │  工单字段   │  必填     │
   ├───────────┼────────────┼────────────┤
   │  title    │  title     │  ✓        │
   │  status   │  status    │  ✓        │
   │  priority │  priority  │  ✗        │
   │  source   │  source    │  ✗        │
   │  assignee │  assignee  │  ✗        │
   │  tags     │  tags      │  ✗        │
   │  notes    │  notes     │  ✗        │
   └────────────┴────────────┴────────────┘

2. 联系人数据 (CSV/Excel)
   字段: name, company, email, phone, tags, notes

3. 配置数据 (JSON/YAML)
   - Workspace 配置
   - 连接配置 (不含敏感信息)
   - 策略配置

导入流程:
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  选择文件 │ -> │  解析文件 │ -> │  字段映射  │ -> │  预览数据 │
└─────────┘    └──────────┘    └───────────┘    └──────────┘
                                                         │
                                                         v
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────┴──────┐
│  导入完成 │ <- │  写入数据库│ <- │  验证数据  │ <- │  确认导入   │
└──────────┘    └───────────┘    └───────────┘    └─────────────┘

错误处理:
- 无效格式: 提示具体行号和错误原因
- 必填字段缺失: 高亮显示缺失字段
- 重复数据: 询问跳过/覆盖/新建
- 编码问题: 自动检测 UTF-8/GBK
```

**验收标准**:
- [ ] 支持 CSV/Excel 导入工单
- [ ] 支持 CSV/Excel 导入联系人
- [ ] 支持 JSON 导入配置
- [ ] 字段映射可视化配置
- [ ] 导入预览确认
- [ ] 错误报告详细

**工作量**: 8 人日

**依赖**: P1-T001

---

#### 任务 ID: P2-T002
**任务名称**: 数据导出功能

**详细设计**:
```
导出数据范围:

1. 工单数据
   格式: CSV, Excel, JSON
   字段: 用户可选
   筛选: 日期范围、状态、优先级、标签

2. 审计日志
   格式: CSV, JSON
   字段: trace_id, actor, action, timestamp, (敏感字段已掩码)
   筛选: 日期范围、操作类型、操作者

3. 统计报表
   格式: Excel, PDF
   内容:
   - 工单处理统计 (按人/按状态/按时段)
   - 审批通过率
   - Agent 工作量

4. 全量备份
   格式: JSON (压缩包)
   内容: 完整 Workspace 数据 (不含 Keychain)

导出流程:
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐
│  选择数据 │ -> │  配置导出 │ -> │  生成导出  │ -> │  下载文件 │
└──────────┘    └──────────┘    └───────────┘    └───────────┘

导出历史:
- 记录导出历史
- 重新下载历史导出
- 导出文件过期自动清理 (7 天)
```

**验收标准**:
- [ ] 支持多格式导出 (CSV/Excel/JSON/PDF)
- [ ] 字段可选择
- [ ] 筛选条件丰富
- [ ] 导出历史记录
- [ ] 导出进度显示

**工作量**: 5 人日

**依赖**: P2-T001

---

### 2.2 Webhook 事件订阅

#### 任务 ID: P2-T003
**任务名称**: Webhook 系统

**详细设计**:
```
Webhook 配置:

1. 事件类型
┌──────────────────────────────────────────────────────────┐
│  事件类型              │  触发时机                      │
├───────────────────────┼───────────────────────────────┤
│  ticket.created        │  新建工单                      │
│  ticket.updated        │  工单更新                      │
│  ticket.status_changed │  工单状态变更                  │
│  approval.created      │  创建审批请求                  │
│  approval.approved     │  审批通过                      │
│  approval.rejected     │  审批拒绝                      │
│  deployment.started    │  部署开始                      │
│  deployment.completed  │  部署完成                      │
│  deployment.failed     │  部署失败                      │
│  agent.online          │  Agent 上线                    │
│  agent.offline         │  Agent 离线                    │
│  alert.created         │  创建告警                      │
│  alert.resolved        │  告警恢复                      │
└──────────────────────────────────────────────────────────┘

2. Webhook 配置
{
  "id": "wh_xxx",
  "name": "生产环境通知",
  "url": "https://example.com/webhook",
  "events": ["ticket.created", "deployment.*"],
  "secret": "whsec_xxx",
  "headers": {
    "X-Custom-Header": "value"
  },
  "enabled": true,
  "retryPolicy": {
    "maxRetries": 3,
    "backoff": "exponential",
    "timeout": 30
  }
}

3. 签名验证
- 使用 HMAC-SHA256 签名
- 签名头: X-SoloForge-Signature-256
- 签名内容: timestamp + "." + payload
- 验证: (timestamp 在 5 分钟内) && (签名匹配)

4. 投递日志
- 记录每次投递的 request/response
- 记录重试次数
- 记录失败原因

页面设计:
- Webhook 列表页
- Webhook 创建/编辑页
- Webhook 日志页
- 事件类型说明页
```

**验收标准**:
- [ ] 创建/编辑/删除 Webhook
- [ ] 支持多种事件类型订阅
- [ ] HMAC-SHA256 签名
- [ ] 自动重试机制
- [ ] 投递日志完整记录
- [ ] Webhook 测试功能

**工作量**: 10 人日

**依赖**: 无

---

### 2.3 插件系统

#### 任务 ID: P2-T004
**任务名称**: 插件架构设计

**详细设计**:
```
插件架构:

1. 插件定义
┌─────────────────────────────────────────────────────────┐
│  plugin.json                                            │
├─────────────────────────────────────────────────────────┤
│  {                                                      │
│    "id": "plugin-example",                             │
│    "name": "示例插件",                                  │
│    "version": "1.0.0",                                 │
│    "description": "这是一个示例插件",                   │
│    "author": "Author Name",                            │
│    "homepage": "https://example.com",                   │
│    "main": "dist/index.js",                            │
│    "permissions": ["tickets:read", "tickets:write"],   │
│    "dependencies": {                                   │
│      "@soloforge/api": "^1.0.0"                        │
│    },                                                  │
│    "contributes": {                                     │
│      "pages": [                                        │
│        { "path": "/plugins/example", "component": "..." } │
│      ],                                                 │
│      "actions": [                                      │
│        { "id": "example-action", "label": "执行示例" }   │
│      ],                                                 │
│      "webhooks": [                                      │
│        { "event": "ticket.created", "handler": "..." }  │
│      ]                                                  │
│    }                                                   │
│  }                                                      │
└─────────────────────────────────────────────────────────┘

2. 插件 API
```typescript
// 插件可使用的 API
interface PluginAPI {
  // 数据访问
  tickets: {
    list(filter: TicketFilter): Promise<Ticket[]>
    get(id: string): Promise<Ticket>
    create(data: CreateTicketInput): Promise<Ticket>
    update(id: string, data: UpdateTicketInput): Promise<Ticket>
  }
  
  // 通知
  notifications: {
    show(message: string, type: 'info' | 'success' | 'warning' | 'error'): void
    toast(message: string, duration?: number): void
  }
  
  // 存储
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
  }
  
  // UI 扩展
  ui: {
    registerPage(page: PageConfig): void
    registerAction(action: ActionConfig): void
    showModal(config: ModalConfig): Promise<any>
  }
}
```

3. 插件生命周期
┌─────────────┐
│  installing  │  插件正在安装
└──────┬──────┘
       v
┌─────────────┐
│  installed   │  插件已安装但未启用
└──────┬──────┘
       v
┌─────────────┐
│  enabled    │  插件已启用，运行中
└──────┬──────┘
       v
┌─────────────┐
│  disabled   │  插件已禁用
└──────┬──────┘
       v
┌─────────────┐
│  uninstalled │  插件已卸载
└─────────────┘

4. 安全模型
- 插件运行在沙箱环境
- 权限声明与审批
- API 访问受限
- 不允许直接访问 Node.js API
```

**验收标准**:
- [ ] 插件目录结构定义
- [ ] 插件安装/卸载/启用/禁用
- [ ] 插件 API 定义
- [ ] 插件沙箱安全隔离
- [ ] 插件市场 UI (预留)
- [ ] 至少一个示例插件

**工作量**: 20 人日

**依赖**: P1-T004

---

## 四、Phase 3: 企业级功能 (Q4 2026+)

### 3.1 多租户 SaaS (可选)

#### 任务 ID: P3-T001
**任务名称**: SaaS 架构设计

**详细设计**:
```
架构设计:

1. 部署模式
┌─────────────────────────────────────────────────────────┐
│                    单租户部署                            │
│  (当前架构，适合企业内部)                               │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  SoloForge Desktop                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │
│  │  │ User A  │  │ User B  │  │ User C  │        │   │
│  │  └─────────┘  └─────────┘  └─────────┘        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    多租户 SaaS                          │
│  (Phase 3 可选)                                        │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              SoloForge Cloud                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │   │
│  │  │Tenant A  │ │Tenant B  │ │Tenant C  │        │   │
│  │  │Org/Team │ │Org/Team │ │Org/Team │        │   │
│  │  │┌──────┐ │ │┌──────┐ │ │┌──────┐ │        │   │
│  │  ││User  │ │ ││User  │ │ ││User  │ │        │   │
│  │  │└──────┘ │ │└──────┘ │ │└──────┘ │        │   │
│  │  └──────────┘ └──────────┘ └──────────┘        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

2. 数据库设计
- 租户隔离: workspace_id 外键关联
- 共享表: users, organizations, subscriptions
- 租户表: tickets, contacts, audit_logs 等

3. 计费系统
- Seat-based 订阅
- 按月/年计费
- 免费试用 14 天
```

**验收标准**:
- [ ] 架构设计文档完成
- [ ] 数据模型扩展设计
- [ ] SSO/LDAP 集成设计
- [ ] 计费系统设计

**工作量**: 待定

**依赖**: Phase 1 + Phase 2 完成

---

### 3.2 API 开放平台

#### 任务 ID: P3-T002
**任务名称**: 开发者 API

**详细设计**:
```
API 能力:

1. REST API
- 工单管理: CRUD
- 审批管理: 列表/批准/拒绝
- 审计日志: 查询/导出
- Webhook: 配置管理

2. 认证方式
- API Key (主方式)
- OAuth 2.0 (企业版)
- JWT Token

3. 限流策略
┌──────────────────────────────────────┐
│  套餐         │  限流              │
├───────────────┼─────────────────────┤
│  Free        │  100 req/hour       │
│  Pro         │  1000 req/hour      │
│  Enterprise  │  10000 req/hour     │
└──────────────────────────────────────┘

4. 开发者文档
- OpenAPI 3.0 规范
- Swagger UI
- 代码示例 (多种语言)
```

**验收标准**:
- [ ] OpenAPI 规范定义
- [ ] API Key 管理 UI
- [ ] 使用文档
- [ ] 限流实现

**工作量**: 15 人日

**依赖**: Phase 2 完成

---

## 五、任务依赖关系图

```
Phase 1: 完善体验 (Q3 2026)
├── P1-T001: i18n 基础设施
│   └── P1-T002: 核心 UI 翻译
│       └── P1-T003: 主题系统增强
└── P1-T004: E2E 测试完善
    └── P2-T004: 插件系统 (部分)

Phase 2: 能力扩展 (Q3-Q4 2026)
├── P2-T001: 数据导入
│   └── P2-T002: 数据导出
├── P2-T003: Webhook 系统
└── P2-T004: 插件系统

Phase 3: 企业级功能 (Q4 2026+)
├── P3-T001: SaaS 架构设计
└── P3-T002: 开发者 API
```

---

## 六、工作量汇总

| 阶段 | 任务 | 工作量 | 累计 |
|------|------|--------|------|
| **Phase 1** | P1-T001 i18n 基础设施 | 3 人日 | 3 人日 |
| | P1-T002 核心 UI 翻译 | 8 人日 | 11 人日 |
| | P1-T003 主题系统增强 | 5 人日 | 16 人日 |
| | P1-T004 E2E 测试完善 | 15 人日 | 31 人日 |
| **Phase 2** | P2-T001 数据导入 | 8 人日 | 39 人日 |
| | P2-T002 数据导出 | 5 人日 | 44 人日 |
| | P2-T003 Webhook 系统 | 10 人日 | 54 人日 |
| | P2-T004 插件系统 | 20 人日 | 74 人日 |
| **Phase 3** | P3-T001 SaaS 架构 | 待定 | - |
| | P3-T002 开发者 API | 15 人日 | 89 人日 |

**总计**: 约 89 人日 (Phase 1 + Phase 2)

---

## 七、下一步行动

### 立即执行 (本周)

1. **P1-T001**: 开始 i18n 基础设施搭建
   - 创建 `resources/locales/` 目录结构
   - 配置 react-i18next
   - 提取现有硬编码文本

2. **P1-T004**: 完善 E2E 测试
   - 补充 Dashboard 完整测试
   - 添加工单管理测试

### 规划中 (下周)

1. 启动 P1-T002 核心 UI 翻译
2. 启动 P1-T003 主题系统设计评审

---

*最后更新: 2026-08-01*
