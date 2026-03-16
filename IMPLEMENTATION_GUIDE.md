# SoloForge 实现指南

本文档提供剩余功能的实现框架和代码模板。

## M5: OpenClawClient 实现

### 文件：`src/main/services/openclaw-client.ts`

```typescript
import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'

export interface ConnectionProfile {
  name: string
  baseUrl: string
  wsUrl: string
  authMode: 'token' | 'password' | 'trusted-proxy'
  token?: string
  password?: string
  edgeToken?: string
}

export class OpenClawClient {
  private profile: ConnectionProfile
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(profile: ConnectionProfile) {
    this.profile = profile
  }

  /**
   * HTTP Ping 检测
   */
  async ping(): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now()
    try {
      const response = await fetch(`${this.profile.baseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000)
      })
      const latency = Date.now() - start
      return { success: response.ok, latency }
    } catch (error) {
      return { success: false, latency: Date.now() - start, error: String(error) }
    }
  }

  /**
   * WebSocket 连接
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.profile.wsUrl, {
          headers: this.getHeaders()
        })

        this.ws.on('open', () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          resolve()
        })

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        })

        this.ws.on('close', () => {
          console.log('WebSocket closed')
          this.handleReconnect()
        })

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString())
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 发送消息
   */
  send(data: any, traceId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const message = {
      ...data,
      traceId: traceId || uuidv4(),
      timestamp: new Date().toISOString()
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * 获取配置
   */
  async getConfig(): Promise<any> {
    const response = await fetch(`${this.profile.baseUrl}/config`, {
      method: 'GET',
      headers: this.getHeaders()
    })
    return await response.json()
  }

  /**
   * 应用配置
   */
  async applyConfig(config: any, traceId: string): Promise<any> {
    const response = await fetch(`${this.profile.baseUrl}/config`, {
      method: 'PATCH',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId
      },
      body: JSON.stringify(config)
    })
    return await response.json()
  }

  /**
   * 私有方法：获取请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.profile.authMode === 'token' && this.profile.token) {
      headers['Authorization'] = `Bearer ${this.profile.token}`
    } else if (this.profile.authMode === 'password' && this.profile.password) {
      headers['X-Password'] = this.profile.password
    }

    if (this.profile.edgeToken) {
      headers['X-Edge-Token'] = this.profile.edgeToken
    }

    return headers
  }

  /**
   * 私有方法：处理重连
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  /**
   * 私有方法：处理消息
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      console.log('Received message:', message)
      // TODO: 触发事件或回调
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }
}
```

### API 端点添加（`src/main/services/api-server.ts`）

```typescript
// ==================== OpenClaw Client ====================
import { OpenClawClient } from './openclaw-client'

const clients = new Map<string, OpenClawClient>()

fastify.post('/api/openclaw/connect', async (request) => {
  const { profileId } = request.body as { profileId: string }
  
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw new Error('Profile not found')
  
  // 从 Keychain 读取凭证
  const token = await KeychainService.getPassword(`${profile.name}-token`)
  const password = await KeychainService.getPassword(`${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)
  
  const client = new OpenClawClient({
    ...profile,
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined
  })
  
  const pingResult = await client.ping()
  
  if (pingResult.success) {
    await client.connect()
    clients.set(profileId, client)
  }
  
  return { success: pingResult.success, latency: pingResult.latency }
})

fastify.post('/api/openclaw/disconnect', async (request) => {
  const { profileId } = request.body as { profileId: string }
  const client = clients.get(profileId)
  if (client) {
    client.disconnect()
    clients.delete(profileId)
  }
  return { success: true }
})

fastify.get('/api/openclaw/:profileId/config', async (request) => {
  const { profileId } = request.params as { profileId: string }
  const client = clients.get(profileId)
  if (!client) throw new Error('Client not connected')
  return await client.getConfig()
})

fastify.patch('/api/openclaw/:profileId/config', async (request) => {
  const { profileId } = request.params as { profileId: string }
  const config = request.body
  const traceId = uuidv4()
  
  const client = clients.get(profileId)
  if (!client) throw new Error('Client not connected')
  
  const result = await client.applyConfig(config, traceId)
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      traceId,
      actor: 'system',
      action: 'APPLY_CONFIG',
      request: JSON.stringify(config),
      response: JSON.stringify(result),
      ts: new Date()
    }
  })
  
  return result
})
```

## M1: 工单看板实现

### 安装依赖
```bash
npm install @dnd-kit/core @dnd-kit/sortable react-router-dom
```

### 文件：`src/renderer/pages/TicketBoard.tsx`

```typescript
import React, { useEffect, useState } from 'react'
import { DndContext, DragEndEvent } from '@dnd-kit/core'

const STATUSES = ['INBOX', 'SPEC', 'DEV', 'TEST', 'DELIVERY', 'DONE']

interface Ticket {
  id: string
  title: string
  status: string
  priority: string
  assignee?: { name: string }
}

export function TicketBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [apiPort, setApiPort] = useState<number | null>(null)

  useEffect(() => {
    window.electronAPI.getApiPort().then(port => {
      setApiPort(port)
      fetchTickets(port)
    })
  }, [])

  const fetchTickets = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/tickets`)
    const data = await response.json()
    setTickets(data)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !apiPort) return

    const ticketId = active.id as string
    const newStatus = over.id as string

    // 更新本地状态
    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? { ...t, status: newStatus } : t))
    )

    // 更新服务器
    await fetch(`http://127.0.0.1:${apiPort}/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
  }

  const ticketsByStatus = STATUSES.reduce((acc, status) => {
    acc[status] = tickets.filter(t => t.status === status)
    return acc
  }, {} as Record<string, Ticket[]>)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">工单看板</h1>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-6 gap-4">
          {STATUSES.map(status => (
            <div key={status} className="bg-gray-100 rounded-lg p-4">
              <h2 className="font-semibold mb-4">{status}</h2>
              <div className="space-y-2">
                {ticketsByStatus[status]?.map(ticket => (
                  <div
                    key={ticket.id}
                    className="bg-white p-3 rounded shadow cursor-move"
                  >
                    <h3 className="font-medium">{ticket.title}</h3>
                    <p className="text-sm text-gray-500">{ticket.assignee?.name}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  )
}
```

## M3: 审批流程实现

### 文件：`src/main/services/approval-guard.ts`

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export type HighRiskAction =
  | 'SEND_EXTERNAL'
  | 'MERGE_MAIN'
  | 'DEPLOY_PROD'
  | 'EXPORT_DATA'
  | 'PURCHASE'
  | 'CHANGE_CONFIG'
  | 'ROTATE_TOKEN'

export class ApprovalGuard {
  /**
   * 检查操作是否需要审批
   */
  static requiresApproval(action: string): boolean {
    const highRiskActions: HighRiskAction[] = [
      'SEND_EXTERNAL',
      'MERGE_MAIN',
      'DEPLOY_PROD',
      'EXPORT_DATA',
      'PURCHASE',
      'CHANGE_CONFIG',
      'ROTATE_TOKEN'
    ]
    return highRiskActions.includes(action as HighRiskAction)
  }

  /**
   * 创建审批请求
   */
  static async createApproval(
    actionType: HighRiskAction,
    payload: any,
    requestedBy: string,
    ticketId?: string
  ): Promise<string> {
    const approval = await prisma.approval.create({
      data: {
        ticketId,
        actionType,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        requestedBy
      }
    })
    return approval.id
  }

  /**
   * 检查审批状态
   */
  static async checkApproval(approvalId: string): Promise<'PENDING' | 'APPROVED' | 'REJECTED'> {
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } })
    if (!approval) throw new Error('Approval not found')
    return approval.status as 'PENDING' | 'APPROVED' | 'REJECTED'
  }

  /**
   * 批准审批
   */
  static async approve(approvalId: string, approvedBy: string): Promise<void> {
    await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approvedBy,
        decidedAt: new Date()
      }
    })
  }

  /**
   * 拒绝审批
   */
  static async reject(approvalId: string, approvedBy: string): Promise<void> {
    await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        approvedBy,
        decidedAt: new Date()
      }
    })
  }

  /**
   * 执行受保护的操作
   */
  static async executeProtected<T>(
    action: string,
    payload: any,
    requestedBy: string,
    executor: () => Promise<T>,
    ticketId?: string
  ): Promise<{ approvalId?: string; result?: T }> {
    if (!this.requiresApproval(action)) {
      // 不需要审批，直接执行
      const result = await executor()
      return { result }
    }

    // 需要审批
    const approvalId = await this.createApproval(
      action as HighRiskAction,
      payload,
      requestedBy,
      ticketId
    )

    return { approvalId }
  }
}
```

### 使用示例

```typescript
// 在 API 端点中使用
fastify.post('/api/openclaw/:profileId/config', async (request) => {
  const { profileId } = request.params as { profileId: string }
  const config = request.body
  
  const result = await ApprovalGuard.executeProtected(
    'CHANGE_CONFIG',
    config,
    'admin',
    async () => {
      const client = clients.get(profileId)
      if (!client) throw new Error('Client not connected')
      return await client.applyConfig(config, uuidv4())
    }
  )
  
  if (result.approvalId) {
    return { 
      status: 'pending_approval', 
      approvalId: result.approvalId,
      message: '配置变更需要审批'
    }
  }
  
  return { status: 'success', result: result.result }
})
```

## M6: 配置 Diff 实现

### 安装依赖
```bash
npm install jsondiffpatch
```

### 文件：`src/main/services/config-manager.ts`

```typescript
import { create, DiffPatcher } from 'jsondiffpatch'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()
const differ = create()

export class ConfigManager {
  /**
   * 计算配置哈希
   */
  static hash(config: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(config))
      .digest('hex')
  }

  /**
   * 保存配置快照
   */
  static async saveSnapshot(profileId: string, config: any): Promise<string> {
    const hash = this.hash(config)
    const snapshot = await prisma.configSnapshot.create({
      data: {
        profileId,
        config: JSON.stringify(config),
        hash
      }
    })
    return snapshot.id
  }

  /**
   * 获取最新快照
   */
  static async getLatestSnapshot(profileId: string): Promise<any | null> {
    const snapshot = await prisma.configSnapshot.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' }
    })
    return snapshot ? JSON.parse(snapshot.config) : null
  }

  /**
   * 生成 Diff
   */
  static diff(oldConfig: any, newConfig: any): any {
    return differ.diff(oldConfig, newConfig)
  }

  /**
   * 应用 Patch
   */
  static patch(config: any, delta: any): any {
    return differ.patch(config, delta)
  }

  /**
   * 回滚到快照
   */
  static async rollback(profileId: string, snapshotId: string): Promise<any> {
    const snapshot = await prisma.configSnapshot.findUnique({
      where: { id: snapshotId }
    })
    if (!snapshot) throw new Error('Snapshot not found')
    return JSON.parse(snapshot.config)
  }
}
```

## 路由配置

### 安装依赖
```bash
npm install react-router-dom
```

### 文件：`src/renderer/App.tsx`

```typescript
import React from 'react'
import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { TicketBoard } from './pages/TicketBoard'
import { TeamManagement } from './pages/TeamManagement'
import { ApprovalCenter } from './pages/ApprovalCenter'
import { AuditLogs } from './pages/AuditLogs'
import { ConnectionSettings } from './pages/ConnectionSettings'

function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex space-x-8">
              <Link to="/" className="py-4 px-2 border-b-2 border-transparent hover:border-blue-500">
                仪表盘
              </Link>
              <Link to="/tickets" className="py-4 px-2 border-b-2 border-transparent hover:border-blue-500">
                工单看板
              </Link>
              <Link to="/team" className="py-4 px-2 border-b-2 border-transparent hover:border-blue-500">
                团队管理
              </Link>
              <Link to="/approvals" className="py-4 px-2 border-b-2 border-transparent hover:border-500">
                审批中心
              </Link>
              <Link to="/audit" className="py-4 px-2 border-b-2 border-transparent hover:border-blue-500">
                审计日志
              </Link>
              <Link to="/settings" className="py-4 px-2 border-b-2 border-transparent hover:border-blue-500">
                连接设置
              </Link>
            </div>
          </div>
        </nav>

        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<TicketBoard />} />
            <Route path="/team" element={<TeamManagement />} />
            <Route path="/approvals" element={<ApprovalCenter />} />
            <Route path="/audit" element={<AuditLogs />} />
            <Route path="/settings" element={<ConnectionSettings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default App
```

## 下一步

1. 根据上述模板实现各个页面组件
2. 添加表单验证（可使用 `react-hook-form` + `zod`）
3. 添加状态管理（可使用 `zustand` 或 `jotai`）
4. 完善错误处理和加载状态
5. 添加单元测试（`vitest` + `@testing-library/react`）
6. 配置 electron-builder 打包

## 推荐库

- **UI 组件**: shadcn/ui, Radix UI
- **表单**: react-hook-form, zod
- **状态管理**: zustand, jotai
- **拖拽**: @dnd-kit/core
- **日期**: date-fns
- **图表**: recharts
- **Markdown**: react-markdown
- **代码高亮**: prism-react-renderer
- **JSON 编辑器**: @monaco-editor/react
