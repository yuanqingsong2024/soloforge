# M7 真实链路收口与生产可用性加固 - 分析报告

## 执行时间
2026-03-15

## 当前状态评估

### 1. Electron Main / IPC / Service Facade 边界

#### 当前 IPC 接口清单
**Preload 暴露的接口** (`src/preload/index.ts`):
- `ping()` - 简单连通性测试
- `getApiPort()` - 获取本地 API 端口
- `onApiPort(callback)` - 监听端口变化

**Main Process IPC Handlers** (`src/main/index.ts`):
- `ipcMain.handle('ping')` - 返回 'pong'
- `ipcMain.handle('get-api-port')` - 返回 apiPort

#### 架构评估
✅ **优点**:
- Renderer 完全通过本地 Fastify API (HTTP) 访问数据，未直接暴露 SQLite/Keychain/系统命令
- IPC 层极简，只用于获取 API 端口，避免了复杂的 IPC 通信
- 所有敏感操作（Keychain、SSH、Docker）都在 main process 的 API server 中处理

⚠️ **待补强**:
- IPC handlers 缺少参数校验（虽然当前接口简单）
- 缺少统一的错误包装机制
- 缺少 trace_id 传递机制（虽然 HTTP API 层有）

#### Renderer 访问模式
所有 renderer 页面都通过 `getApiPort()` 获取端口后使用 `fetch()` 调用本地 API：
```typescript
const apiPort = await getApiPort()
const response = await fetch(`http://127.0.0.1:${apiPort}/api/...`)
```

✅ **安全性良好**：
- Renderer 未直接 import Node.js 模块（fs、child_process、electron）
- 所有数据访问都通过 HTTP API
- 敏感凭证存储在 main process 的 Keychain 中

### 2. 执行器适配层统一化

#### 执行器实现状态

| 执行器 | 文件 | 实现状态 | Mock/Fake 残留 |
|--------|------|----------|----------------|
| OpenClawClient | `openclaw-client.ts` | ✅ 生产实现 | ❌ 无 |
| SSHExecutor | `ssh-executor.ts` | ✅ 生产实现 | ❌ 无 |
| DockerManager | `docker-manager.ts` | ✅ 生产实现 | ❌ 无 |
| HostAgentService | `host-agent-service.ts` | ✅ 生产实现 | ❌ 无 |

**结论**: ✅ 未发现 mock/fake adapter 残留在生产路径

#### 错误处理模式对比

**当前状态 - 不统一**:

1. **SSHExecutor** - 返回结构化结果:
```typescript
interface SSHCommandResult {
  stdout: string
  stderr: string
  exitCode: number
  success: boolean
}
```

2. **OpenClawClient** - 抛出异常:
```typescript
async ping(): Promise<{ success: boolean; latency: number; error?: string }>
async getConfig(): Promise<unknown> // 失败时 throw Error
```

3. **DockerManager** - 抛出异常:
```typescript
async startLocal(): Promise<void> // 失败时 throw Error
async checkHealth(): Promise<{ healthy: boolean; status?: string }>
```

4. **HostAgentService** - 混合模式:
```typescript
// 部分返回结构化结果，部分抛出异常
```

5. **API Server** - 混合模式:
```typescript
// 大量 try-catch + throw new Error
// 部分端点返回 { success, error }
```

⚠️ **问题**:
- 错误处理模式不统一
- 缺少统一的错误类型枚举（AUTH_FAILED, NETWORK_ERROR, TIMEOUT 等）
- 调用方需要处理不同的错误模式

### 3. SQLite Migration 与索引

#### Migration 状态
- 总计 **13 个 migrations**（包括 migration_lock.toml）
- 初始 migration: `20260302083839_init`
- 最新 migration: `20260311023011_add_host_agent_center`

#### 索引覆盖评估

**已有索引** (从 schema.prisma 分析):
- ✅ `workspace_id` - 大部分表已建立
- ✅ `status` - 关键状态表已建立
- ✅ `trace_id` - audit_logs 等表已建立
- ✅ `created_at` - 时间序列表已建立
- ✅ 外键索引 - Prisma 自动创建

**潜在缺失索引** (需进一步验证):
- ⚠️ 复合索引优化（如 `workspace_id + status + created_at`）
- ⚠️ 高频查询路径的覆盖索引

### 4. 幂等与重试机制

#### 当前幂等保护

**已实现**:
1. **OutboundMessage** - `idempotency_key` + `content_hash`
2. **Job** - 基于 `workspaceId + type + request hash`
3. **ChangeRequest** - 基于 `content_hash`

**待验证**:
- Agent Actions 幂等性
- Deployment Jobs 幂等性
- Reconcile 执行幂等性
- Remediation 执行幂等性

#### 重试机制

**已实现**:
1. **OutboundMessage** - 指数退避重试 `[1, 5, 15, 60, 360]` 分钟
2. **OutboxEvent** - 类似重试机制
3. **OpenClawClient WebSocket** - 自动重连（最多 5 次）

**待补强**:
- 统一的重试策略配置
- 重试失败后的降级策略
- 重试状态的可观测性

### 5. 日志与错误处理

#### 当前日志机制
- ✅ Fastify 内置日志
- ✅ Console.log/error 散落在各服务
- ❌ 缺少统一的日志服务
- ❌ 缺少日志级别控制
- ❌ 缺少日志持久化策略

#### 错误处理
- ⚠️ 大量 `throw new Error(message)` 但缺少错误分类
- ⚠️ 缺少统一的错误码体系
- ⚠️ 错误信息中文但缺少结构化字段

### 6. 打包与发布

#### 当前配置 (package.json)
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "postinstall": "prisma generate"
  },
  "build": {
    "appId": "com.soloforge.app",
    "productName": "SoloForge",
    "directories": { "output": "release/${version}" },
    "files": ["dist", "dist-electron"],
    "win": { "target": ["nsis"] },
    "mac": { "target": ["dmg"] },
    "linux": { "target": ["AppImage"] }
  }
}
```

✅ **基础配置完整**

⚠️ **待验证**:
- 实际打包是否成功
- 打包产物是否包含所有必要文件（prisma client、migrations）
- 首次启动体验

## 优先级排序

### P0 - 必须立即修复
1. ❌ 无（当前架构基本健康）

### P1 - 高优先级补强
1. 统一错误分类与结果包装
2. 补齐关键链路幂等保护验证
3. 统一日志服务
4. 验证打包链路完整性

### P2 - 中优先级优化
1. IPC 层参数校验与错误包装
2. 复合索引优化
3. Dashboard 性能优化
4. E2E 测试扩展

### P3 - 低优先级增强
1. 日志持久化策略
2. 崩溃恢复机制
3. 诊断包导出

## 下一步行动

### M7-1: Electron main / IPC / service facade 边界梳理
**状态**: ✅ 基本健康，仅需小幅补强
- [ ] 为 IPC handlers 添加参数校验（虽然当前接口简单）
- [ ] 文档化 IPC 边界与安全模型

### M7-2: SQLite migration / index / persistence 收口
**状态**: ✅ 基本完整
- [ ] 验证所有核心模块持久化完整性
- [ ] 检查是否需要复合索引优化

### M7-3: 执行器适配层统一化
**状态**: ⚠️ 需要统一错误处理
- [ ] 定义统一错误类型枚举
- [ ] 统一执行器返回格式
- [ ] 包装现有执行器为统一接口

### M7-4: 幂等/重试/错误恢复收口
**状态**: ⚠️ 部分实现，需验证与补全
- [ ] 验证所有关键链路幂等保护
- [ ] 补齐缺失的幂等机制
- [ ] 统一重试策略

### M7-5: Dashboard 与列表性能优化
**状态**: 待评估
- [ ] 性能测试与瓶颈识别
- [ ] 优化聚合查询
- [ ] 实现分页与虚拟滚动

### M7-6: 日志、错误处理、崩溃恢复
**状态**: ⚠️ 需要统一
- [ ] 实现统一日志服务
- [ ] 定义错误码体系
- [ ] 实现崩溃恢复机制

### M7-7: 打包与内部发布链路
**状态**: ✅ 配置完整，需验证
- [ ] 执行完整打包流程
- [ ] 验证打包产物
- [ ] 编写发布文档

### M7-8: E2E / integration / smoke / 文档完善
**状态**: ✅ 基线已建立
- [ ] 扩展 E2E 覆盖
- [ ] 编写 smoke checklist
- [ ] 完善文档

## 总体评估

**架构健康度**: 🟢 良好 (85/100)

**优点**:
- 清晰的 main/renderer 边界
- 无 mock/fake 残留
- 基础幂等机制已实现
- 打包配置完整

**主要风险**:
- 错误处理不统一（中等风险）
- 日志机制分散（低风险）
- 部分幂等保护未验证（中等风险）

**建议**:
优先推进 M7-3（统一错误处理）和 M7-4（幂等验证），这两项对生产稳定性影响最大。
