# SoloForge 扩展功能开发指南

> 本文档定义如何使用 Ultrawork 模式为 SoloForge 添加新功能

---

## 目录

1. [开发前准备](#开发前准备)
2. [标准开发流程](#标准开发流程)
3. [常见扩展场景](#常见扩展场景)
4. [验证清单](#验证清单)
5. [故障排查](#故障排查)

---

## 开发前准备

### 必读文档

在开始任何开发前，必须阅读：

1. **AGENTS.md** — 项目规则、安全约束、架构约束
2. **.kiro/skills/soloforge-electron-desktop.md** — 项目技能文件、技术栈、数据模型
3. **README.md** — 项目概述、快速开始、已完成功能

### 环境检查

```bash
# 1. 依赖安装
npm install

# 2. 数据库初始化
npx prisma migrate dev
npx prisma db seed

# 3. 类型检查
npx tsc --noEmit

# 4. 开发服务器
npm run dev
```

**要求**：所有命令必须成功执行，零错误。

---

## 标准开发流程

### Phase 0: 意图识别与探索（强制）

**在写任何代码前：**

1. **明确真实意图**
   - 用户要解决什么问题？
   - 这是新功能/修复/优化？
   - 涉及哪些模块？

2. **并行探索**（如果不熟悉相关代码）
   ```typescript
   // 启动多个背景探索任务
   task(subagent_type="explore", run_in_background=true, load_skills=[], 
        description="查找现有页面模式",
        prompt="查找 src/renderer/pages/ 中的页面实现模式，重点关注：useState/useEffect 使用、API 调用方式、错误处理。返回 3-5 个代表性文件路径和关键模式。")
   
   task(subagent_type="explore", run_in_background=true, load_skills=[], 
        description="查找 API 端点模式",
        prompt="查找 src/main/services/api-server.ts 中的端点实现，重点关注：请求验证、Prisma 使用、审计日志写入。返回端点实现的标准模式。")
   ```

3. **收集结果**
   ```typescript
   // 稍后收集
   background_output(task_id="...")
   ```

### Phase 1: 规划（强制创建 TODO）

**对于 2+ 步骤的任务，必须创建 TODO：**

```typescript
todowrite({
  todos: [
    {content: "探索现有实现模式", status: "completed", priority: "high"},
    {content: "修改数据库 schema（如需要）", status: "pending", priority: "high"},
    {content: "添加 API 端点", status: "pending", priority: "high"},
    {content: "创建前端页面/组件", status: "pending", priority: "high"},
    {content: "类型检查验证", status: "pending", priority: "medium"},
    {content: "功能测试", status: "pending", priority: "medium"},
    {content: "构建验证", status: "pending", priority: "medium"}
  ]
})
```

### Phase 2: 实施（遵循既有模式）

#### 2.1 数据库变更（如需要）

1. **编辑 schema**
   ```bash
   # 编辑 prisma/schema.prisma
   ```

2. **创建迁移**
   ```bash
   npx prisma migrate dev --name add_new_feature
   ```

3. **更新种子数据**（如需要）
   ```bash
   # 编辑 prisma/seed.ts
   npx prisma db seed
   ```

4. **验证**
   ```bash
   # 检查数据库
   npx prisma studio
   ```

#### 2.2 添加 API 端点

**模板**（参考 `src/main/services/api-server.ts`）：

```typescript
// GET 端点
fastify.get('/api/new-resource', async (request) => {
  const { filter } = request.query as { filter?: string }
  return await prisma.newResource.findMany({
    where: filter ? { status: filter } : undefined,
    include: { relatedData: true }
  })
})

// POST 端点（带审批检查）
fastify.post('/api/new-resource', async (request) => {
  const data = request.body as NewResourceRequest
  
  // 高危操作检查审批（如需要）
  // const approval = await checkApproval(...)
  
  // 创建资源
  const result = await prisma.newResource.create({
    data: {
      ...data,
      createdAt: new Date()
    },
    include: { relatedData: true }
  })
  
  // 写入审计日志
  await prisma.auditLog.create({
    data: {
      traceId: generateTraceId(),
      actor: 'system',
      action: 'CREATE_NEW_RESOURCE',
      targetType: 'NewResource',
      targetId: result.id,
      after: JSON.stringify(result)
    }
  })
  
  return result
})
```

**验证**：
```bash
# 类型检查
npx tsc --noEmit

# LSP 诊断
lsp_diagnostics(filePath="src/main/services/api-server.ts", severity="error")

# 手动测试
curl -X POST http://127.0.0.1:13789/api/new-resource \
  -H 'Content-Type: application/json' \
  -d '{"name": "test"}'
```

#### 2.3 创建前端页面

**模板**（参考 `src/renderer/pages/Dashboard.tsx`）：

```typescript
import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'

interface NewResource {
  id: string
  name: string
  status: string
  createdAt: string
}

export function NewResourcePage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [resources, setResources] = useState<NewResource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchResources(port)
    })
  }, [])

  const fetchResources = async (port: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/new-resource`)
      const data = await response.json()
      setResources(data)
    } catch (error) {
      console.error('Failed to fetch resources:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">新资源管理</h1>
      <div className="grid gap-4">
        {resources.map(resource => (
          <div key={resource.id} className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold">{resource.name}</h3>
            <p className="text-sm text-gray-500">{resource.status}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**添加路由**（`src/renderer/App.tsx`）：

```typescript
import { NewResourcePage } from './pages/NewResourcePage'

// 在 Routes 中添加
<Route path="/new-resource" element={<NewResourcePage />} />

// 在导航栏添加链接
<Link to="/new-resource" className="...">新资源</Link>
```

**验证**：
```bash
# 类型检查
npx tsc --noEmit

# 浏览器测试
# 访问 http://localhost:5173/#/new-resource
```

### Phase 3: 验证（强制证据）

#### 3.1 类型检查
```bash
npx tsc --noEmit
```
**要求**：零错误

#### 3.2 LSP 诊断
```bash
# 对所有修改的文件运行
lsp_diagnostics(filePath="...", severity="error")
```
**要求**：无诊断错误

#### 3.3 功能测试

**手动测试清单**：
- [ ] 页面正常加载
- [ ] API 调用成功
- [ ] 数据正确显示
- [ ] 错误处理正常
- [ ] 审计日志正确记录（如适用）

#### 3.4 构建验证
```bash
npm run build
```
**要求**：
- `tsc` 成功
- `vite build` 成功
- `electron-builder` 成功生成安装包

---

## 常见扩展场景

### 场景 1: 添加新的工单状态

**涉及文件**：
- `prisma/schema.prisma` — Ticket 模型的 status 字段注释
- `src/renderer/pages/TicketBoard.tsx` — STATUSES 常量
- `prisma/seed.ts` — 种子数据（如需要）

**步骤**：
1. 更新 `TicketBoard.tsx` 的 `STATUSES` 数组
2. 更新 schema 注释（文档用途）
3. 测试看板拖拽功能
4. 验证状态流转逻辑

### 场景 2: 添加新的审批类型

**涉及文件**：
- `prisma/schema.prisma` — Approval 模型的 actionType 注释
- `src/main/services/approval-guard.ts` — 审批规则
- `src/renderer/pages/ApprovalCenter.tsx` — 审批中心 UI

**步骤**：
1. 在 `approval-guard.ts` 添加新的审批类型检查
2. 更新 schema 注释
3. 测试审批流程（创建 → 审批 → 执行）
4. 验证审计日志记录

### 场景 3: 添加新的配置项到配置中心

**涉及文件**：
- `src/renderer/pages/ConfigCenter.tsx` — 配置表单
- `src/main/services/config-manager.ts` — 配置管理逻辑

**步骤**：
1. 在 `ConfigCenter.tsx` 添加表单字段
2. 更新配置验证逻辑
3. 测试 diff/apply/回滚流程
4. 验证限频机制（60 秒 3 次）

### 场景 4: 添加新的 OpenClaw 连接类型

**涉及文件**：
- `prisma/schema.prisma` — ConnectionProfile 模型
- `src/main/services/openclaw-client.ts` — 连接客户端
- `src/renderer/pages/ConnectionSettings.tsx` — 连接管理 UI

**步骤**：
1. 扩展 ConnectionProfile schema（如需要）
2. 在 `openclaw-client.ts` 实现新的连接逻辑
3. 更新 UI 表单
4. 测试连接诊断功能

---

## 验证清单

### 代码质量

- [ ] 零 TypeScript 错误（`npx tsc --noEmit`）
- [ ] 零 LSP 诊断错误
- [ ] 遵循既有代码风格（Tailwind、中文注释）
- [ ] 无 `as any`、`@ts-ignore`、`@ts-expect-error`
- [ ] 无空 catch 块

### 功能完整性

- [ ] 所有 TODO 项标记为 completed
- [ ] API 端点返回预期数据
- [ ] 前端页面正常显示
- [ ] 错误处理覆盖边界条件
- [ ] 审计日志正确记录（如适用）

### 安全性

- [ ] 敏感信息存储在 Keychain（不是 SQLite）
- [ ] 高危操作有审批检查
- [ ] SQL 查询使用参数化（Prisma）
- [ ] 日志中敏感字段已 mask

### 构建与打包

- [ ] `npm run dev` 正常启动
- [ ] `npm run build` 成功
- [ ] 生成的安装包可运行

---

## 故障排查

### 类型错误

**问题**：`npx tsc --noEmit` 报错

**解决**：
1. 检查是否缺少类型定义
2. 确认接口定义与实际数据结构匹配
3. 使用 `lsp_diagnostics` 定位具体错误

### API 调用失败

**问题**：前端无法调用 API

**解决**：
1. 检查 API 端口是否正确（开发模式 13789）
2. 确认 Fastify 服务器已启动
3. 检查 CORS 配置（已在 `api-server.ts` 注册）
4. 使用 curl 测试端点

### 数据库迁移失败

**问题**：`npx prisma migrate dev` 报错

**解决**：
1. 检查 schema 语法
2. 确认外键关系正确
3. 如果是开发环境，可以 `npx prisma migrate reset` 重置

### Electron 窗口无法打开

**问题**：`npm run dev` 后 Electron 不启动

**解决**：
1. 检查主进程日志（终端输出）
2. 确认 Vite 构建成功
3. 检查 `dist-electron/` 目录是否生成

### 构建失败

**问题**：`npm run build` 失败

**解决**：
1. 先运行 `npx tsc --noEmit` 检查类型错误
2. 检查 `vite build` 输出
3. 确认 `electron-builder` 配置正确
4. Windows: 检查是否有文件被占用（杀死旧进程）

---

## 委托策略

### 何时委托

| 任务复杂度 | 策略 |
|---|---|
| 简单（1-2 文件，明确模式） | 自己实现 |
| 中等（3-5 文件，需要探索） | 先探索（explore），再实现 |
| 复杂（架构变更，多模块） | 咨询 Oracle，再委托实施 |
| 前端密集 | 委托 `category="visual-engineering", load_skills=["ui-ux-pro-max"]` |

### 委托模板

```typescript
// 前端页面开发
task(
  category="visual-engineering",
  load_skills=["ui-ux-pro-max", "soloforge-electron-desktop"],
  description="创建新资源管理页面",
  prompt=`
1. TASK: 创建 src/renderer/pages/NewResourcePage.tsx，实现新资源的列表展示和创建功能
2. EXPECTED OUTCOME: 完整的 React 组件，包含列表、创建表单、加载状态、错误处理
3. REQUIRED TOOLS: read, write, edit, lsp_diagnostics
4. MUST DO:
   - 使用 getApiPort() 获取 API 端口
   - 遵循 Dashboard.tsx 的代码模式
   - 使用 Tailwind CSS 样式
   - 添加中文注释
   - 错误处理覆盖网络失败、空数据等情况
5. MUST NOT DO:
   - 不使用外部 UI 库
   - 不直接操作 SQLite
   - 不使用 as any 等类型断言
6. CONTEXT:
   - 参考文件: src/renderer/pages/Dashboard.tsx
   - API 端点: GET/POST /api/new-resource
   - 项目使用 React 18 + TypeScript + Tailwind
  `,
  run_in_background=false
)
```

---

## 最佳实践

### DO（推荐）

✅ 先探索，再实施
✅ 遵循既有代码模式
✅ 创建 TODO 跟踪进度
✅ 每个步骤后验证
✅ 写中文注释解释"为什么"
✅ 高危操作加审批
✅ 关键操作写审计日志
✅ 敏感信息存 Keychain

### DON'T（禁止）

❌ 不探索就实施
❌ 自创新模式
❌ 跳过验证步骤
❌ 使用 `as any` 等类型断言
❌ 空 catch 块
❌ 明文存储敏感信息
❌ 跳过审批流程
❌ 删除失败的测试

---

## 总结

**记住三个原则**：

1. **探索优先** — 不熟悉就先探索，不要猜测
2. **遵循模式** — 项目有既定模式，不要自创
3. **验证完整** — 没有证据 = 未完成

**Ultrawork 模式的核心**：
- 100% 确定后再动手
- 并行探索，高效收集上下文
- 委托专业任务给专业代理
- 每个步骤都要有证据

**安全第一**：
- 最小权限
- 审批必须
- 审计完整
- 密钥安全
