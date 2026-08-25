# SoloForge Agent Harness 完整设计方案

> 版本：v1.0 | 日期：2026-08-02 | 状态：规划中

---

## 一、核心理念

**Harness = 驾驭、控制、引导**

SoloForge Agent Harness 的定位：**"让人类始终保持对 AI Agent 的掌控力"**

```
┌─────────────────────────────────────────────────────────────────┐
│                    SoloForge Agent Harness                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   实时调试   │    │   行动预览   │    │   流水线     │     │
│   │   控制台     │    │   审批台     │    │   编排器     │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│          │                   │                   │              │
│          └───────────────────┼───────────────────┘              │
│                              ▼                                  │
│                    ┌──────────────────┐                         │
│                    │   协作调度器     │                         │
│                    │   (自然语言驱动) │                         │
│                    └──────────────────┘                         │
│                              │                                  │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              SoloForge Core Engine                   │      │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │      │
│   │  │Approval │ │ Audit   │ │Policy   │ │ Config  │   │      │
│   │  │ Guard   │ │ Log     │ │ Guard   │ │ Manager │   │      │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │      │
│   └─────────────────────────────────────────────────────┘      │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │ Claude Code │  │ Claude Code │  │ Host Agent  │            │
│   │ (Local)     │  │ (Remote)    │  │ (Remote)    │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、四项核心能力详细设计

### 2.1 实时 Agent 调试台（Real-time Agent Console）

**定位**：透明化 AI 思考过程，让人类"看见"Agent 在想什么

#### 功能需求

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 流式输出展示 | 实时显示 Agent 的思考过程、工具调用、中间结果 | P0 |
| 工具调用追踪 | 记录每一次 Tool Use 的输入/输出/耗时 | P0 |
| 消息历史回放 | 支持回放完整的 Agent 会话历史 | P1 |
| 断点调试 | 在特定消息处暂停，允许人工干预 | P1 |
| 变量检查 | 查看 Agent 当前的上下文变量、内存状态 | P2 |
| 性能分析 | 统计工具调用耗时、Token 消耗 | P2 |

#### 技术实现

```typescript
// 1. WebSocket 实时消息流
interface AgentStreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'error'
  traceId: string
  timestamp: string
  data: {
    content?: string
    toolName?: string
    toolInput?: unknown
    toolOutput?: unknown
    latency?: number
  }
}

// 2. 调试台状态机
type ConsoleState = 
  | { status: 'idle' }
  | { status: 'connecting'; agentId: string }
  | { status: 'streaming'; events: AgentStreamEvent[] }
  | { status: 'paused'; breakpointAt: string }
  | { status: 'error'; error: string }

// 3. UI 组件
// - StreamingView: 流式输出展示
// - ToolCallTree: 工具调用树状图
// - MessageTimeline: 消息时间线
// - VariableInspector: 变量检查器
// - PerformancePanel: 性能分析面板
```

#### 页面设计

```
┌────────────────────────────────────────────────────────────────────┐
│ Agent Console                              [连接状态] [暂停] [清空] │
├─────────────────────────────┬──────────────────────────────────────┤
│                             │                                      │
│  思考过程 (Thinking)         │  工具调用 (Tool Calls)               │
│  ┌─────────────────────┐    │  ┌────────────────────────────────┐  │
│  │ 分析用户请求...      │    │  │ ▼ read_file: src/main/...     │  │
│  │ 需要先查看现有代码   │    │  │   输入: {...}                  │  │
│  │                      │    │  │   输出: {...}   ✓ 23ms        │  │
│  │ 调用 read_file...    │    │  │                                │  │
│  └─────────────────────┘    │  │ ▼ write_file: ...              │  │
│                             │  │   输入: {...}                  │  │
│  消息历史 (Messages)         │  │   输出: {...}   ✓ 156ms        │  │
│  ┌─────────────────────┐    │  └────────────────────────────────┘  │
│  │ [User] 请帮我实现... │    │                                      │
│  │ [Assistant] 分析中... │    │  性能统计 (Performance)             │
│  │ [Tool] read_file     │    │  ┌────────────────────────────────┐  │
│  │ [Assistant] 明白了... │    │  │ Token: 1,234 / 100,000        │  │
│  └─────────────────────┘    │  │ 工具调用: 5 次                  │  │
│                             │  │ 总耗时: 2.3s                    │  │
│                             │  └────────────────────────────────┘  │
└─────────────────────────────┴──────────────────────────────────────┘
```

#### 与现有能力的关系

- **复用** `OpenClawClient` 的 WebSocket 连接能力
- **复用** `AuditLog` 记录工具调用
- **扩展** `agent_actions` 表，新增流式事件字段

---

### 2.2 Agent 行动计划预览（Action Plan Preview）

**定位**：在执行前预审 AI 的完整行动计划，human-in-the-loop 最后把关

#### 功能需求

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 行动计划生成 | 基于用户请求，生成完整的执行计划（含工具调用序列） | P0 |
| 风险评估 | 自动评估每个步骤的风险等级 | P0 |
| 预览审批流 | 高风险步骤自动触发审批流程 | P0 |
| 模拟执行 | 干跑（dry-run）模式，验证可行性 | P1 |
| 计划修改 | 允许人工调整执行顺序、参数、或跳过某些步骤 | P1 |
| 差异对比 | 比较修改前后的计划差异 | P2 |

#### 技术实现

```typescript
// 1. 行动计划数据结构
interface ActionPlan {
  id: string
  traceId: string
  status: 'draft' | 'reviewing' | 'approved' | 'executing' | 'completed' | 'failed'
  steps: ActionStep[]
  totalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  estimatedDuration: number // 毫秒
  createdAt: string
}

interface ActionStep {
  order: number
  type: 'tool_call' | 'reasoning' | 'approval_gate' | 'human_decision'
  description: string
  toolName?: string
  toolInput?: unknown
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiresApproval: boolean
  estimatedLatency?: number
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'skipped'
  result?: unknown
}

// 2. 计划生成服务
interface PlanGeneratorOptions {
  task: string
  context?: Record<string, unknown>
  constraints?: {
    maxSteps?: number
    allowedTools?: string[]
    deniedTools?: string[]
    requireApprovalAbove?: RiskLevel
  }
}

// 3. 审批网关
interface ApprovalGate {
  stepIndex: number
  actionType: string // SEND_EXTERNAL, MERGE_MAIN, DEPLOY_PROD 等
  payload: unknown
  approvalId?: string
  status: 'pending' | 'approved' | 'rejected'
}
```

#### 审批流程

```
用户请求
    │
    ▼
┌───────────────────────┐
│  计划生成器            │  ← 调用 Agent 生成行动计划
│  (Plan Generator)     │
└───────────────────────┘
    │
    ▼
┌───────────────────────┐
│  风险评估器            │  ← 评估每个步骤的风险
│  (Risk Assessor)      │
└───────────────────────┘
    │
    ├──────────────────────────────┐
    ▼                              ▼
LOW/MEDIUM 风险              HIGH/CRITICAL 风险
    │                              │
    ▼                              ▼
┌─────────────────┐      ┌─────────────────────────┐
│ 直接预览        │      │ 创建 Approval           │
│ (可修改后执行)  │      │ (需人工审批)            │
└─────────────────┘      └─────────────────────────┘
    │                              │
    │           ┌──────────────────┘
    │           ▼
    │    ┌─────────────────┐
    │    │ 审批通过        │
    │    │ 或修改计划      │
    │    └─────────────────┘
    │           │
    ▼           ▼
┌───────────────────────┐
│  执行引擎             │  ← 按计划步骤顺序执行
│  (Execution Engine)   │
└───────────────────────┘
```

#### 页面设计

```
┌────────────────────────────────────────────────────────────────────┐
│ Action Plan Preview                    [生成计划] [执行] [取消]     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  任务描述：实现用户登录功能                                          │
│                                                                    │
│  风险评估：⚠️ MEDIUM (1 个高风险步骤)                                │
│                                                                    │
│  执行计划（共 5 步，预计 3.2s）                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. 📖 read_file: src/models/user.ts         ✓ LOW    12ms   │  │
│  │ 2. 📝 write_file: src/models/user.ts        ⚠️ MED   156ms  │  │
│  │ 3. 🧪 write_file: src/__tests__/user.test   ✓ LOW    89ms   │  │
│  │ 4. ⚠️ [需要审批] git commit & push           🔴 HIGH   2.1s  │  │
│  │ 5. ✅ verify: 测试登录功能                  ✓ LOW    845ms  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  高风险步骤详情                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 步骤 4: git commit & push                                    │  │
│  │ ─────────────────────────────────────────────────────────── │  │
│  │ 风险：HIGH - 将代码推送到远程仓库                             │  │
│  │ 影响范围：main 分支                                           │  │
│  │ 回滚方案：git revert                                          │  │
│  │                                                              │  │
│  │ [审批状态：待审批]  [申请审批]  [跳过此步骤]  [修改计划]       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 2.3 Agent 流水线编排器（Pipeline Orchestrator）

**定位**：将多个 Agent 串联成流水线，实现复杂任务的自动化执行

#### 功能需求

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 流水线定义 | 通过 YAML/JSON 定义流水线结构（阶段、Agent、条件） | P0 |
| 顺序执行 | 按定义顺序执行各阶段，支持阶段间数据传递 | P0 |
| 条件分支 | 支持 if/else、switch 等条件分支 | P1 |
| 并行执行 | 支持阶段内多个 Agent 并行执行 | P1 |
| 错误处理 | 阶段失败时的重试、降级、跳过策略 | P1 |
| 循环执行 | 支持 while/for 循环 | P2 |
| 流水线市场 | 预设常用流水线模板（代码审查、发布流程等） | P2 |

#### 技术实现

```typescript
// 1. 流水线定义
interface Pipeline {
  id: string
  name: string
  description: string
  version: number
  enabled: boolean
  stages: Stage[]
  variables: Variable[]
  errorPolicy: ErrorPolicy
  createdAt: string
  updatedAt: string
}

interface Stage {
  id: string
  name: string
  type: 'sequential' | 'parallel' | 'conditional'
  agents: AgentAssignment[]
  condition?: ConditionalExpression
  onError: StageErrorPolicy
  timeout?: number // 毫秒
}

interface AgentAssignment {
  agentId: string
  roleName: string
  input: Record<string, string> // 模板变量
  outputMapping?: Record<string, string> // 输出到变量
}

interface ErrorPolicy {
  onStageFailure: 'stop' | 'continue' | 'rollback'
  maxRetries: number
  retryDelay: number
}

// 2. 流水线执行引擎
interface PipelineExecutor {
  execute(pipelineId: string, inputs: Record<string, unknown>): Promise<PipelineResult>
  pause(executionId: string): Promise<void>
  resume(executionId: string): Promise<void>
  cancel(executionId: string): Promise<void>
}

interface PipelineResult {
  executionId: string
  status: 'success' | 'partial' | 'failed'
  stageResults: StageResult[]
  outputs: Record<string, unknown>
  duration: number
  error?: string
}

// 3. 阶段结果
interface StageResult {
  stageId: string
  status: 'success' | 'failed' | 'skipped' | 'paused'
  agentResults: AgentResult[]
  outputs: Record<string, unknown>
  duration: number
}

interface AgentResult {
  agentId: string
  status: 'success' | 'failed' | 'timeout'
  output: unknown
  error?: string
}
```

#### 流水线模板示例

```yaml
# 代码发布流水线
name: release-pipeline
description: 标准代码发布流程

variables:
  - name: branch
    default: main
  - name: environment
    default: staging

stages:
  - name: 代码检查
    type: sequential
    agents:
      - roleName: Dev
        input:
          task: "执行代码审查并修复问题"
    onError:
      action: continue
      notify: true

  - name: 单元测试
    type: parallel
    agents:
      - roleName: QA
        input:
          task: "运行 {{branch}} 分支的单元测试"
    onError:
      action: stop

  - name: 构建镜像
    type: sequential
    agents:
      - roleName: Ops
        input:
          task: "构建 Docker 镜像并推送到 registry"
    onError:
      action: rollback

  - name: 部署审批
    type: conditional
    condition: "environment == 'production'"
    agents:
      - roleName: PM
        input:
          task: "审批生产环境部署"
    onError:
      action: stop

  - name: 部署
    type: sequential
    agents:
      - roleName: Ops
        input:
          task: "部署到 {{environment}} 环境"
    onError:
      action: rollback

errorPolicy:
  onStageFailure: rollback
  maxRetries: 2
  retryDelay: 5000
```

#### 页面设计

```
┌────────────────────────────────────────────────────────────────────┐
│ Pipeline Orchestrator                    [新建] [市场] [执行历史]   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  我的流水线                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 🏷️ release-pipeline          v2    ✅ Active    [编辑] [运行] │  │
│  │    标准代码发布流程 | 最后执行: 2小时前 | 成功率: 95%         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 🏷️ code-review-pipeline      v1    ✅ Active    [编辑] [运行] │  │
│  │    自动代码审查流程 | 最后执行: 昨天 | 成功率: 100%          │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 🏷️ incident-response         v3    ⚠️ Draft     [编辑] [运行] │  │
│  │    故障响应自动化流程 | 从未执行                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  流水线编辑器                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [代码检查] ──→ [单元测试] ──→ [构建镜像] ──→ [部署审批?] ──→ [部署] │
│  │                  ↑ parallel                                   ↑ conditional │
│  │                  [集成测试]                                    (if prod)   │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  执行历史                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ run-001  release-pipeline    ✅ 成功   2026-08-02 10:30  2m   │  │
│  │ run-002  code-review-pipeline ✅ 成功   2026-08-02 09:15  5m   │  │
│  │ run-003  release-pipeline    ❌ 失败   2026-08-02 08:00  1m   │  │
│  │          └─ 阶段 2 失败：测试覆盖率不足                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 2.4 多 Agent 协作调度器（Multi-Agent Orchestrator）

**定位**：通过自然语言描述任务，系统自动拆解并分配给不同 Agent 执行

#### 功能需求

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 自然语言解析 | 解析用户的自然语言任务描述 | P0 |
| 任务拆解 | 自动将任务拆解为子任务 | P0 |
| Agent 匹配 | 根据子任务类型匹配最合适的 Agent | P0 |
| 协作执行 | 多 Agent 协同执行，支持信息共享 | P1 |
| 冲突解决 | 多个 Agent 输出冲突时的处理策略 | P1 |
| 结果聚合 | 汇总多个 Agent 的输出为最终结果 | P1 |
| 上下文管理 | 维护跨 Agent 的共享上下文 | P2 |

#### 技术实现

```typescript
// 1. 任务描述
interface NaturalLanguageTask {
  id: string
  rawInput: string
  parsedIntent?: ParsedIntent
  subtasks: SubTask[]
  assignedAgents: AgentAssignment[]
  status: 'parsing' | 'dispatched' | 'executing' | 'completed' | 'failed'
  createdAt: string
}

interface ParsedIntent {
  primaryGoal: string
  constraints: string[]
  expectedOutput: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

interface SubTask {
  id: string
  description: string
  assignedAgentId?: string
  requiredRole: string
  dependencies: string[] // 依赖的其他 subtask ID
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed'
  result?: unknown
  outputs: Record<string, unknown> // 输出到共享上下文
}

// 2. 任务解析服务
interface TaskParser {
  parse(input: string): Promise<ParsedIntent>
  decompose(intent: ParsedIntent): Promise<SubTask[]>
  assign(subtasks: SubTask[]): Promise<AgentAssignment[]>
}

// 3. Agent 匹配策略
interface AgentMatcher {
  match(task: SubTask, availableAgents: Agent[]): Agent | null
  // 匹配策略：
  // - 角色匹配（Dev → 开发任务）
  // - 负载均衡（选择当前任务最少的 Agent）
  // - 能力匹配（检查 Agent 的 tools 授权）
  // - 历史表现（优先选择成功率高的 Agent）
}

// 4. 协作上下文
interface CollaborationContext {
  taskId: string
  sharedMemory: Map<string, unknown> // 跨 Agent 共享数据
  messageQueue: AgentMessage[] // Agent 间消息
  artifacts: Artifact[] // 共享交付物
}

interface AgentMessage {
  fromAgentId: string
  toAgentId: string
  type: 'request' | 'response' | 'notification' | 'escalation'
  content: unknown
  timestamp: string
}
```

#### 任务拆解示例

```
用户输入：
"帮我实现一个用户登录功能，包括注册、登录、登出，需要数据库支持"

                          ▼
                 ┌──────────────────┐
                 │  任务解析器       │
                 │  (Task Parser)   │
                 └──────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  解析结果                             │
        │  - 主目标：实现用户认证功能           │
        │  - 约束：需要数据库支持               │
        │  - 预期输出：完整的登录系统           │
        └─────────────────────────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  任务拆解器       │
                 │  (Decomposer)    │
                 └──────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  子任务列表                           │
        │                                       │
        │  [1] 设计数据库 Schema      → Dev    │
        │      依赖: []                         │
        │                                       │
        │  [2] 实现注册 API           → Dev    │
        │      依赖: [1]                       │
        │                                       │
        │  [3] 实现登录 API           → Dev    │
        │      依赖: [1]                       │
        │                                       │
        │  [4] 实现登出 API           → Dev    │
        │      依赖: [2, 3]                    │
        │                                       │
        │  [5] 编写测试用例           → QA     │
        │      依赖: [2, 3, 4]                 │
        │                                       │
        │  [6] 安全审查               → Security │
        │      依赖: [2, 3, 4]                 │
        └─────────────────────────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  Agent 分配器     │
                 │  (Dispatcher)    │
                 └──────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        ┌────────┐   ┌────────┐   ┌────────┐
        │  Dev   │   │   QA   │   │ Sec    │
        │ Agent  │   │ Agent  │   │ Agent  │
        └────────┘   └────────┘   └────────┘
            │             │             │
            ▼             ▼             ▼
        ┌─────────────────────────────────────┐
        │  执行 & 结果聚合                      │
        │                                       │
        │  共享上下文：                          │
        │  - db_schema: {...}                  │
        │  - auth_api: {...}                   │
        │  - test_cases: [...]                 │
        │                                       │
        │  最终输出：用户认证系统完整实现         │
        └─────────────────────────────────────┘
```

#### 页面设计

```
┌────────────────────────────────────────────────────────────────────┐
│ Multi-Agent Orchestrator                      [新任务] [执行历史]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  任务输入                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 请描述你需要完成的任务...                                      │  │
│  │                                                                  │  │
│  │ "帮我实现一个用户登录功能，包括注册、登录、登出，需要数据库支持"  │  │
│  │                                                                  │  │
│  │                                          [解析任务] [直接执行]  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  任务拆解预览                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 主目标：实现用户认证功能                                        │  │
│  │ 约束：需要数据库支持                                           │  │
│  │ 优先级：HIGH                                                   │  │
│  │                                                                  │  │
│  │ 子任务拆解（共 6 个）：                                         │  │
│  │                                                                  │  │
│  │  [1] 设计数据库 Schema                                         │  │
│  │      角色: Dev | 依赖: 无 | 状态: pending                       │  │
│  │  ────────────────────────────────────────────────────────────  │  │
│  │  [2] 实现注册 API                                              │  │
│  │      角色: Dev | 依赖: [1] | 状态: pending                      │  │
│  │  ────────────────────────────────────────────────────────────  │  │
│  │  [3] 实现登录 API                                              │  │
│  │      角色: Dev | 依赖: [1] | 状态: pending                      │  │
│  │  ────────────────────────────────────────────────────────────  │  │
│  │  [4] 实现登出 API                                              │  │
│  │      角色: Dev | 依赖: [2, 3] | 状态: pending                   │  │
│  │  ────────────────────────────────────────────────────────────  │  │
│  │  [5] 编写测试用例                                              │  │
│  │      角色: QA | 依赖: [2, 3, 4] | 状态: pending                │  │
│  │  ────────────────────────────────────────────────────────────  │  │
│  │  [6] 安全审查                                                  │  │
│  │      角色: Security | 依赖: [2, 3, 4] | 状态: pending          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  执行状态                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ [1] ✅ 完成   [2] ✅ 完成   [3] 🔄 进行中   [4] ⏳ 等待中      │  │
│  │ [5] ⏳ 等待中 [6] ⏳ 等待中                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Agent 协作状态                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Dev Agent    🟢 在线 | 当前任务: 实现登录 API | 进度: 65%     │  │
│  │ QA Agent     🟢 在线 | 等待依赖完成                           │  │
│  │ Sec Agent    🟡 空闲 | 等待依赖完成                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  共享上下文                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ db_schema: { users: {...} }                                  │  │
│  │ register_api: { endpoint: "/api/auth/register", ... }        │  │
│  │ login_api: { endpoint: "/api/auth/login", ... }              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 三、四项能力的优先级与依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                     优先级矩阵                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   阶段一（基础层）：实时调试台                                     │
│   ─────────────────────────────────────────────────────         │
│   │                                                            │
│   │ 为什么先做？                                                │
│   │ • 已有 Claude Code WebSocket 基础，改造成本低                   │
│   │ • 是其他三项能力的基础（都需要实时反馈）                      │
│   │ • 解决当前痛点：无法看到 Agent 在想什么                       │
│   │                                                            │
│   │ 交付物：                                                    │
│   │ • 流式输出展示组件                                          │
│   │ • 工具调用树状图                                            │
│   │ • 性能统计面板                                              │
│   │                                                            │
│   ▼                                                            │
│                                                                  │
│   阶段二（控制层）：行动预览 + 审批                               │
│   ─────────────────────────────────────────────────────         │
│   │                                                            │
│   │ 为什么第二？                                                │
│   │ • 复用现有 Approval Guard 能力                              │
│   │ • 核心价值：human-in-the-loop，保障安全                      │
│   │ • 为流水线编排提供审批机制                                   │
│   │                                                            │
│   │ 交付物：                                                    │
│   │ • 行动计划生成器                                            │
│   │ • 风险评估器                                                │
│   │ • 预览审批流                                                │
│   │                                                            │
│   ▼                                                            │
│                                                                  │
│   阶段三（编排层）：流水线编排器                                   │
│   ─────────────────────────────────────────────────────         │
│   │                                                            │
│   │ 为什么第三？                                                │
│   │ • 需要前两阶段的基础（调试 + 审批）                          │
│   │ • 核心价值：复杂任务自动化                                    │
│   │ • 复用 Pipeline 现有设计                                    │
│   │                                                            │
│   │ 交付物：                                                    │
│   │ • 流水线定义 DSL                                            │
│   │ • 可视化流水线编辑器                                        │
│   │ • 执行引擎 + 错误处理                                        │
│   │                                                            │
│   ▼                                                            │
│                                                                  │
│   阶段四（智能层）：多 Agent 协作调度                             │
│   ─────────────────────────────────────────────────────         │
│   │                                                            │
│   │ 为什么最后？                                                │
│   │ • 需要前三个阶段全部就绪                                    │
│   │ • 技术难度最高（自然语言理解、任务拆解）                      │
│   │ • 核心价值：自然语言驱动的自动化                              │
│   │                                                            │
│   │ 交付物：                                                    │
│   │ • 任务解析器                                                │
│   │ • 任务拆解引擎                                              │
│   │ • Agent 匹配与调度器                                        │
│   │ • 协作上下文管理                                            │
│   │                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、技术债整合

Harness 设计应与现有技术债协同解决：

| 技术债 | 与 Harness 的关系 | 解决方案 |
|--------|------------------|---------|
| T-001 api-server.ts 拆分 | Harness 需要更多路由模块 | 统一路由拆分规范 |
| T-002 统一审计中间件 | 调试台需要完整调用链追踪 | 扩展 audit-wrapper 支持流式事件 |
| T-008 服务层依赖注入 | Pipeline/Orchestrator 需要可测试 | 重构核心服务支持 DI |
| T-009 单元测试 | 新功能必须有测试保护 | 为 Harness 核心模块编写测试 |
| T-011 连接池管理 | 多 Agent 并发需要连接管理 | 实现 LRU 连接池 |

---

## 五、数据模型扩展

```prisma
// Agent Console 相关
model AgentSession {
  id          String   @id @default(uuid())
  agentId     String
  workspaceId String
  traceId     String
  status      String   // connecting, streaming, paused, closed
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  
  events      AgentStreamEvent[]
  
  @@index([agentId, workspaceId])
}

model AgentStreamEvent {
  id          String   @id @default(uuid())
  sessionId   String
  type        String   // thinking, tool_call, tool_result, message, error
  traceId     String
  content     String?  // JSON
  latency     Int?     // 毫秒
  createdAt   DateTime @default(now())
  
  session     AgentSession @relation(fields: [sessionId], references: [id])
  
  @@index([sessionId])
  @@index([traceId])
}

// Action Plan 相关
model ActionPlan {
  id              String   @id @default(uuid())
  workspaceId     String
  traceId         String
  task            String
  status          String   // draft, reviewing, approved, executing, completed, failed
  totalRisk       String
  estimatedDuration Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  steps           ActionStep[]
  
  @@index([workspaceId])
  @@index([traceId])
}

model ActionStep {
  id              String   @id @default(uuid())
  planId          String
  "order"         Int
  type            String   // tool_call, reasoning, approval_gate, human_decision
  description     String
  toolName        String?
  riskLevel       String
  requiresApproval Boolean @default(false)
  status          String   // pending, approved, rejected, executing, completed, skipped
  result          String?  // JSON
  
  plan            ActionPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  
  @@unique([planId, "order"])
}

// Pipeline 相关（扩展现有 Pipeline 模型）
model PipelineExecution {
  id          String   @id @default(uuid())
  pipelineId  String
  workspaceId String
  status      String   // running, paused, completed, failed, canceled
  inputs      String   // JSON
  outputs     String?  // JSON
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  error       String?
  
  stageResults PipelineStageResult[]
  
  @@index([pipelineId, workspaceId])
}

model PipelineStageResult {
  id              String   @id @default(uuid())
  executionId     String
  stageId         String
  status          String
  outputs         String?  // JSON
  startedAt       DateTime?
  endedAt         DateTime?
  
  execution       PipelineExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  
  @@index([executionId])
}

// Multi-Agent Orchestration 相关
model OrchestrationTask {
  id          String   @id @default(uuid())
  workspaceId String
  rawInput    String
  parsedIntent String? // JSON
  status      String   // parsing, dispatched, executing, completed, failed
  outputs     String?  // JSON
  createdAt   DateTime @default(now())
  completedAt DateTime?
  
  subtasks    OrchestrationSubTask[]
  
  @@index([workspaceId])
}

model OrchestrationSubTask {
  id              String   @id @default(uuid())
  taskId          String
  description     String
  requiredRole    String
  dependencies    String   // JSON array of subtask IDs
  assignedAgentId String?
  status          String   // pending, assigned, executing, completed, failed
  result          String?  // JSON
  outputs         String?  // JSON
  
  task            OrchestrationTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  @@index([taskId])
}
```

---

## 六、开发里程碑

```
┌────────────────────────────────────────────────────────────────────────┐
│                         SoloForge Agent Harness                         │
│                            开发时间线                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  2026 Q3 (8-9月)                                                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Phase 1: 实时调试台 (Real-time Console)                        │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ ✅ WebSocket 流式事件接收                                       │    │
│  │ ✅ 流式输出展示组件                                             │    │
│  │ ✅ 工具调用树状图                                               │    │
│  │ ✅ 消息历史回放                                                 │    │
│  │ ✅ 性能统计面板                                                 │    │
│  │ ✅ 技术债整合（T-002, T-006）                                   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  2026 Q4 (10-12月)                                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Phase 2: 行动预览审批台 (Action Plan Preview)                  │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ ✅ 行动计划生成器                                               │    │
│  │ ✅ 风险评估器                                                   │    │
│  │ ✅ 预览审批流（复用 Approval Guard）                            │    │
│  │ ✅ 模拟执行（dry-run）                                          │    │
│  │ ✅ 计划修改与对比                                               │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ Phase 3: 流水线编排器 (Pipeline Orchestrator)                  │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ ✅ 流水线定义 DSL                                               │    │
│  │ ✅ 可视化流水线编辑器                                           │    │
│  │ ✅ 顺序/并行/条件执行                                           │    │
│  │ ✅ 错误处理与回滚                                               │    │
│  │ ✅ 流水线市场模板                                               │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ 技术债整合（T-008, T-009）                                      │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  2027 Q1 (1-3月)                                                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Phase 4: 多 Agent 协作调度 (Multi-Agent Orchestrator)          │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ ✅ 自然语言任务解析                                             │    │
│  │ ✅ 任务自动拆解                                                 │    │
│  │ ✅ Agent 智能匹配                                               │    │
│  │ ✅ 协作上下文管理                                               │    │
│  │ ✅ 冲突解决策略                                                 │    │
│  │ ✅ 结果聚合与输出                                               │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ 稳定性工作                                                      │    │
│  │ ✅ 技术债整合（T-011, T-012）                                   │    │
│  │ ✅ 性能优化与监控                                               │    │
│  │ ✅ 安全审计                                                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  2027 Q2+                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Phase 5: 高级特性                                              │    │
│  │ ───────────────────────────────────────────────────────────── │    │
│  │ ○ 断点调试与变量检查                                           │    │
│  │ ○ 循环执行支持                                                 │    │
│  │ ○ Agent 学习与优化                                             │    │
│  │ ○ 自定义 Agent 角色                                            │    │
│  │ ○ 外部工具集成（GitHub, Slack, Jira）                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 七、总结

### SoloForge Agent Harness 价值主张

| 维度 | 价值 |
|------|------|
| **安全** | 行动预览 + 审批网关 = 人类始终掌控 AI 行为 |
| **透明** | 实时调试台 = 看清 AI 思考过程，消除黑盒恐惧 |
| **高效** | 流水线 + 协作调度 = 复杂任务自动化，人类只需决策 |
| **可控** | 最小权限 + 审计日志 = 每个动作可追溯、可回滚 |

### 与 SoloForge 现有能力的协同

```
现有能力                    Harness 增强
─────────────────────────────────────────────────────
Approval Guard     ──────→  行动预览审批台（核心依赖）
Audit Log          ──────→  实时调试台（事件记录）
Policy Guard       ──────→  流水线策略执行
Pipeline Manager   ──────→  流水线编排器（扩展）
Agent Actions      ──────→  多 Agent 协作调度
OpenClaw Client    ──────→  实时调试台（WebSocket）
Config Manager     ──────→  行动计划配置管理
```

---

**下一步行动**：
1. 评审并确认此设计方案
2. 确定 Phase 1 实时调试台的具体实现计划
3. 开始技术债整合工作（T-001 api-server.ts 拆分）

---

*文档版本：v1.0 | 最后更新：2026-08-02*
