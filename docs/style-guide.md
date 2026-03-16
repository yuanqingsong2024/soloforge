# SoloForge UI/UX 设计规范

> Workshop OS 设计系统 - 工业极简、控制台感、高信息密度

---

## 设计理念

### 核心原则

1. **工业极简** - 以结构与层级表达信息，不用花哨渐变/大色块
2. **控制台感** - 偏工具工作台，强调功能性与可操作性
3. **高信息密度** - 默认紧凑但不拥挤，列表更紧凑，正文更舒适
4. **强可读性** - 清晰的层次结构，明确的状态指示
5. **少装饰多结构** - 通过间距、边框、阴影建立视觉层次

---

## 主题系统

### 支持的主题

- **浅色模式** (Light) - 纯白背景，深灰文字
- **深色模式** (Dark) - 深灰黑背景，浅灰白文字
- **跟随系统** (System) - 自动跟随 OS 的 `prefers-color-scheme`

### 主题切换

- 位置：Topbar 右侧
- 组件：`ThemeToggle`
- 持久化：`localStorage` (`soloforge-theme`)
- 实现：CSS Variables + `data-theme` 属性

---

## Design Tokens

### 颜色系统

所有颜色使用 HSL 格式的 CSS Variables：

```css
/* 浅色主题 */
--background: 0 0% 100%;           /* 纯白背景 */
--foreground: 222 47% 11%;         /* 深灰文字 */
--primary: 222 47% 11%;            /* 主色（深灰黑） */
--success: 142 76% 36%;            /* 成功色（绿） */
--warning: 38 92% 50%;             /* 警告色（橙） */
--destructive: 0 84% 60%;          /* 危险色（红） */
--info: 199 89% 48%;               /* 信息色（蓝） */
--muted: 210 40% 96%;              /* 次要背景（灰白） */
--border: 214 32% 91%;             /* 边框（浅灰） */

/* 深色主题 */
--background: 222 47% 11%;         /* 深灰黑背景 */
--foreground: 210 40% 98%;         /* 浅灰白文字 */
--primary: 210 40% 98%;            /* 主色（浅灰白） */
/* ... 其他颜色自动适配 */
```

### 间距系统（8px 网格）

```css
--spacing-xs: 0.5rem;   /* 8px */
--spacing-sm: 0.75rem;  /* 12px */
--spacing-md: 1rem;     /* 16px */
--spacing-lg: 1.5rem;   /* 24px */
--spacing-xl: 2rem;     /* 32px */
--spacing-2xl: 3rem;    /* 48px */
```

### 圆角系统

```css
--radius-sm: 0.25rem;  /* 4px */
--radius-md: 0.5rem;   /* 8px */
--radius-lg: 0.75rem;  /* 12px */
```

### 阴影系统（轻阴影）

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
```

---

## 布局架构

### 整体结构

```
┌─────────────────────────────────────────┐
│ Sidebar (64px)                          │
│  - Logo                                 │
│  - 导航菜单                              │
│  - 版本信息                              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Topbar (64px)                           │
│  - 全局搜索                              │
│  - 连接状态                              │
│  - 主题切换                              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Content (flex-1)                        │
│  - PageHeader                           │
│  - 页面内容                              │
└─────────────────────────────────────────┘
```

### Sidebar

- 宽度：`w-64` (256px)
- 背景：`bg-[hsl(var(--card))]`
- 边框：右侧 `border-r border-[hsl(var(--border))]`
- 导航项：
  - 激活状态：`bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]`
  - 悬停状态：`hover:bg-[hsl(var(--accent))]`

### Topbar

- 高度：`h-16` (64px)
- 背景：`bg-[hsl(var(--card))]`
- 边框：底部 `border-b border-[hsl(var(--border))]`
- 内容：搜索框 + 连接状态 + 主题切换

### Content

- 内边距：`p-6` (24px)
- 背景：`bg-[hsl(var(--background))]`
- 滚动：`overflow-y-auto`

---

## 公共组件

### PageHeader

**用途**：页面标题与操作区

**结构**：
```tsx
<PageHeader
  title="页面标题"
  description="页面描述（可选）"
  actions={<button>操作按钮</button>}
/>
```

**样式**：
- 标题：`text-2xl font-bold text-[hsl(var(--foreground))]`
- 描述：`text-sm text-[hsl(var(--muted-foreground))]`
- 间距：`mb-6`

### SectionCard

**用途**：内容区块容器

**结构**：
```tsx
<SectionCard
  title="区块标题（可选）"
  description="区块描述（可选）"
  actions={<button>操作</button>}
>
  {children}
</SectionCard>
```

**样式**：
- 背景：`bg-[hsl(var(--card))]`
- 边框：`border border-[hsl(var(--border))]`
- 圆角：`rounded-workshop-md` (8px)
- 阴影：`shadow-workshop-sm`
- 内边距：`p-6`

### DataTable

**用途**：数据表格展示

**结构**：
```tsx
<DataTable
  columns={[
    { key: 'name', label: '名称' },
    { key: 'status', label: '状态', render: (item) => <Badge /> }
  ]}
  data={items}
  keyExtractor={(item) => item.id}
  onRowClick={(item) => navigate(`/detail/${item.id}`)}
/>
```

**样式**：
- 表头：`bg-[hsl(var(--muted))]`
- 行悬停：`hover:bg-[hsl(var(--accent))]`
- 边框：`border-b border-[hsl(var(--border))]`

---

## 状态指示

### Badge（徽章）

**用途**：状态标签

**样式规范**：
```tsx
// 成功状态
className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"

// 警告状态
className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]"

// 危险状态
className="bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]"

// 信息状态
className="bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]"

// 次要状态
className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
```

**尺寸**：
- 小：`text-xs px-2 py-0.5`
- 中：`text-sm px-2.5 py-1`
- 大：`text-base px-3 py-1.5`

**圆角**：`rounded-full`

### 连接状态指示器

**样式**：
- 已连接：`bg-[hsl(var(--success))]` + 绿色圆点
- 连接中：`bg-[hsl(var(--warning))]` + 橙色圆点
- 未连接：`bg-[hsl(var(--destructive))]` + 红色圆点

---

## 表单元素

### Input / Textarea / Select

**统一样式**：
```css
className="px-3 py-2 text-sm rounded-workshop-md
           bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
           border border-[hsl(var(--border))]
           placeholder:text-[hsl(var(--muted-foreground))]
           focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
```

### Button

**主要按钮**：
```css
className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
           rounded-workshop-md hover:opacity-90 transition-opacity
           text-sm font-medium shadow-workshop-sm"
```

**次要按钮**：
```css
className="px-4 py-2 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]
           rounded-workshop-md hover:bg-[hsl(var(--accent))] transition-colors
           text-sm font-medium border border-[hsl(var(--border))]"
```

**危险按钮**：
```css
className="px-4 py-2 bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]
           rounded-workshop-md hover:opacity-90 transition-opacity
           text-sm font-medium"
```

---

## 特殊元素

### ID 显示（Trace ID / Ticket ID）

**样式**：
- 字体：`font-mono` (等宽字体)
- 颜色：`text-[hsl(var(--primary))]`
- 可点击复制：`hover:underline cursor-pointer`
- 标题提示：`title="点击复制"`

**示例**：
```tsx
<button
  onClick={() => copyToClipboard(traceId)}
  className="font-mono text-sm text-[hsl(var(--primary))] hover:underline"
  title="点击复制 Trace ID"
>
  {traceId}
</button>
```

### 代码块（JSON / Payload）

**样式**：
```css
className="text-xs bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
           p-3 rounded-workshop-md border border-[hsl(var(--border))]
           overflow-auto max-h-64 font-mono whitespace-pre-wrap"
```

---

## 页面特定规范

### Dashboard（仪表盘）

- 快速统计卡片：3 列网格，显示总数
- 岗位列表：2-3 列网格，卡片展示
- 员工列表：紧凑列表，显示关键信息

### TicketBoard（工单看板）

- 6 列看板布局（INBOX → SPEC → DEV → TEST → DELIVERY → DONE）
- 列宽：`w-64` (256px)
- 卡片间距：`space-y-2`
- 拖拽支持：`@dnd-kit`

### TicketDetail（工单详情）

- 双栏布局：`grid grid-cols-1 lg:grid-cols-2 gap-6`
- 左栏：交付物列表 + 添加表单
- 右栏：审批记录列表
- 标签管理：可添加/移除，彩色标签

### ApprovalCenter（审批中心）

- 标签页筛选：待审批 / 已批准 / 已拒绝 / 全部
- 卡片展示：显示请求内容（JSON）
- 操作按钮：批准（绿色）/ 拒绝（红色）

### AuditLogs（审计日志）

- 筛选器：Trace ID / 操作人 / 工单 ID
- 可展开行：显示请求/响应 JSON
- Trace ID 可点击复制

---

## 响应式设计

### 断点

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### 适配规则

1. **移动端** (< 768px)：
   - Sidebar 隐藏或折叠
   - 双栏布局改为单栏
   - 表格横向滚动

2. **平板** (768px - 1024px)：
   - Sidebar 保持显示
   - 双栏布局保持
   - 看板列数减少

3. **桌面** (> 1024px)：
   - 完整布局
   - 所有功能可见

---

## 动画与过渡

### 过渡时长

- 快速：`duration-150` (150ms) - 悬停、点击
- 标准：`duration-200` (200ms) - 颜色变化
- 慢速：`duration-300` (300ms) - 布局变化

### 常用过渡

```css
/* 颜色过渡 */
transition-colors duration-200

/* 透明度过渡 */
transition-opacity duration-200

/* 变换过渡 */
transition-transform duration-200
```

---

## 可访问性

### 焦点样式

```css
focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2
```

### 键盘导航

- 所有交互元素支持 Tab 导航
- 按钮支持 Enter/Space 触发
- 模态框支持 Esc 关闭

### 语义化 HTML

- 使用正确的 HTML 标签（`<button>`, `<nav>`, `<main>`）
- 提供 `aria-label` 和 `title` 属性
- 图标按钮必须有文字说明

---

## 开发规范

### 禁止事项

1. ❌ **硬编码颜色** - 必须使用 CSS Variables
2. ❌ **内联样式** - 必须使用 Tailwind 类名
3. ❌ **自定义组件样式** - 必须复用公共组件
4. ❌ **不一致的间距** - 必须使用 8px 网格
5. ❌ **重阴影** - 只使用轻阴影

### 推荐做法

1. ✅ 使用 `hsl(var(--token))` 引用颜色
2. ✅ 使用 `rounded-workshop-*` 工具类
3. ✅ 使用 `shadow-workshop-*` 工具类
4. ✅ 使用 `gap-workshop-*` 工具类
5. ✅ 复用 PageHeader / SectionCard / DataTable

---

## 文件结构

```
src/renderer/
├── index.css                    # 全局样式 + CSS Variables
├── contexts/
│   └── ThemeContext.tsx         # 主题上下文
├── components/
│   ├── ThemeToggle.tsx          # 主题切换
│   ├── layout/
│   │   ├── Layout.tsx           # 布局容器
│   │   ├── Sidebar.tsx          # 侧边栏
│   │   └── Topbar.tsx           # 顶部栏
│   └── ui/
│       ├── PageHeader.tsx       # 页面标题
│       ├── SectionCard.tsx      # 区块卡片
│       └── DataTable.tsx        # 数据表格
└── pages/
    ├── Dashboard.tsx            # 仪表盘
    ├── TicketBoard.tsx          # 工单看板
    ├── TicketDetail.tsx         # 工单详情
    ├── ApprovalCenter.tsx       # 审批中心
    └── AuditLogs.tsx            # 审计日志
```

---

## 总结

SoloForge 的 UI/UX 设计遵循 **Workshop OS** 风格，强调：

1. **工业极简** - 结构清晰，少装饰
2. **控制台感** - 工具导向，高效操作
3. **高信息密度** - 紧凑但不拥挤
4. **主题支持** - 浅色/深色/跟随系统
5. **一致性** - 统一的 Design Tokens 和组件库

所有新增功能必须遵循本规范，确保整体风格一致。
