# SoloForge Design System

> SoloForge Workshop OS 的设计系统文档

## 目录

1. [设计原则](#设计原则)
2. [设计令牌](#设计令牌)
3. [颜色系统](#颜色系统)
4. [圆角系统](#圆角系统)
5. [阴影系统](#阴影系统)
6. [字体系统](#字体系统)
7. [间距系统](#间距系统)
8. [动画系统](#动画系统)
9. [组件库](#组件库)
10. [使用规范](#使用规范)

---

## 设计原则

### 1. 一致性优先
- 所有 UI 元素使用统一的设计令牌
- 保持视觉语言的一致性
- 遵循既定的组件 API

### 2. 可访问性
- 支持键盘导航
- 足够的颜色对比度
- 支持屏幕阅读器
- 无障碍动画减少（prefers-reduced-motion）

### 3. 响应式设计
- 移动优先
- 触摸友好（44px 最小点击区域）
- 断点：sm(640px), md(768px), lg(1024px), xl(1280px)

### 4. 渐进增强
- 基础功能在所有浏览器可用
- 高级特性优雅降级

---

## 设计令牌

设计令牌是设计系统的基础，定义在 `tailwind.config.js` 和 `src/renderer/index.css` 中。

### CSS 变量（运行时主题）

```css
/* 颜色 */
--background: 220 20% 97%    /* 应用背景 */
--foreground: 222 32% 17%    /* 主文字 */
--primary: 217 91% 55%        /* 主色调 */
--success: 137 56% 42%       /* 成功色 */
--warning: 43 96% 52%        /* 警告色 */
--destructive: 4 90% 58%     /* 错误/危险色 */

/* 圆角 */
--radius: 0.5rem             /* 基础圆角 8px */

/* 阴影 */
--shadow-sm, --shadow, --shadow-md, --shadow-lg, --shadow-xl
```

### Tailwind 扩展类

```js
// tailwind.config.js 中定义
colors: {
  primary: 'hsl(var(--primary))',
  destructive: 'hsl(var(--destructive))',
  // ...
}
```

---

## 颜色系统

### 主色板

| 变量名 | 浅色主题值 | 深色主题值 | 用途 |
|--------|------------|------------|------|
| `--background` | 220 20% 97% | 224 24% 9% | 应用画布背景 |
| `--foreground` | 222 32% 17% | 210 40% 98% | 主文字颜色 |
| `--card` | 0 0% 100% | 224 20% 11% | 卡片背景 |
| `--border` | 220 14% 91% | 223 16% 20% | 边框颜色 |

### 状态色

| 色板 | 用途 | 浅色 | 深色 |
|------|------|------|------|
| **Primary** | 主要操作、链接 | #4285F4 | 更亮的蓝 |
| **Success** | 成功状态、在线 | #34A853 | 更亮的绿 |
| **Warning** | 警告、待处理 | #FBBC05 | 更亮的黄 |
| **Destructive** | 错误、危险操作 | #EA4335 | 更亮的红 |

### Google 品牌色

```css
--google-blue:   217 91% 55%
--google-red:    4 90% 58%
--google-yellow: 43 96% 52%
--google-green:  137 56% 42%
```

### 使用方式

```tsx
// 使用 Tailwind 类
<div className="bg-primary text-primary-foreground" />
<div className="bg-destructive text-destructive-foreground" />

// 使用 HSL 变量
<div className="bg-[hsl(var(--success))]" />
<div className="text-[hsl(var(--warning))]" />

// 使用 Google 品牌色
<div className="bg-google-blue" />
```

---

## 圆角系统

采用 4 档圆角系统：

| 尺寸 | Tailwind 类 | 像素值 | 用途 |
|------|-------------|--------|------|
| **sm** | `rounded-sm` | 4px | 小标签、图标按钮 |
| **DEFAULT** | `rounded` | 8px | 输入框、默认卡片 |
| **lg** | `rounded-lg` | 12px | 按钮、弹层 |
| **xl** | `rounded-xl` | 16px | 大卡片、模态框 |
| **2xl** | `rounded-2xl` | 24px | 特殊卡片 |
| **full** | `rounded-full` | 9999px | 胶囊按钮、头像 |

### 统一圆角类

项目自定义的圆角工具类：

```tsx
// 统一使用以下类名，避免混合使用
<div className="rounded-sm" />  {/* 4px */}
<div className="rounded" />     {/* 8px */}
<div className="rounded-lg" />  {/* 12px */}
<div className="rounded-xl" />  {/* 16px */}
```

### 不要使用

```tsx
// 避免使用这些
<div className="rounded-workshop-sm" />  {/* 已废弃 */}
<div className="rounded-workshop-md" />
<div className="rounded-workshop-lg" />
```

---

## 阴影系统

5 档阴影系统：

| 尺寸 | 类名 | 用途 |
|------|------|------|
| **subtle** | `shadow-subtle` | 极其柔和 |
| **sm** | `shadow-sm` | 默认卡片 |
| **DEFAULT** | `shadow` | 卡片悬浮 |
| **md** | `shadow-md` | 弹层 |
| **lg** | `shadow-lg` | 模态框 |
| **xl** | `shadow-xl` | 特殊效果 |

### 使用方式

```tsx
<div className="shadow-sm">默认卡片</div>
<div className="shadow-md hover:shadow-lg">可交互卡片</div>
<div className="shadow-lg">弹层</div>
```

---

## 字体系统

### 字体栈

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
            'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 
            'Droid Sans', 'Helvetica Neue', sans-serif;
```

### 等宽字体

```css
code, .font-mono, .trace-id {
  font-family: 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace;
}
```

### 字号规范

| 用途 | 类名 | 字号 |
|------|------|------|
| 小标签 | `text-xs` | 12px |
| 正文 | `text-sm` | 14px |
| 标题 | `text-base` | 16px |
| 大标题 | `text-lg` | 18px |
| 页面标题 | `text-xl` | 20px |
| 数字统计 | `text-2xl` ~ `text-4xl` | 24-36px |

---

## 间距系统

基于 8px 网格：

| 名称 | Tailwind | 像素 | 用途 |
|------|----------|-------|------|
| **xs** | `spacing-xs` | 8px | 紧凑间距 |
| **sm** | `spacing-sm` | 12px | 小间距 |
| **md** | `spacing-md` | 16px | 默认间距 |
| **lg** | `spacing-lg` | 24px | 大间距 |
| **xl** | `spacing-xl` | 32px | 区块间距 |

### 常用间距

```tsx
// 组件内
<div className="gap-2" />   {/* 8px */}
<div className="gap-4" />   {/* 16px */}

// 区块间
<div className="space-y-6" />  {/* 24px */}
<div className="p-4" />       {/* 16px */}
```

---

## 动画系统

### 过渡时间

```css
--transition-fast: 150ms    /* 微交互 */
--transition: 200ms          /* 默认 */
--transition-slow: 300ms     /* 大型动画 */
```

### 动画类型

| 动画 | 类名 | 用途 |
|------|------|------|
| fade-in | `animate-fade-in` | 淡入 |
| fade-in-up | `animate-fade-in-up` | 上滑淡入 |
| scale-in | `animate-scale-in` | 缩放淡入 |
| slide-in | `animate-slide-in-right` | 侧滑 |

### 使用方式

```tsx
<div className="transition-all duration-200 ease-out hover:scale-105">
  悬浮放大
</div>

<button className="transition-colors hover:bg-primary/90">
  颜色过渡
</button>
```

### 无障碍动画

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 组件库

### 组件位置

```
src/renderer/components/ui/
├── Button.tsx        # 按钮
├── Card.tsx          # 卡片
├── Badge.tsx         # 徽章
├── FormFields.tsx    # 表单字段
├── PageContainer.tsx # 页面布局
├── EmptyState.tsx    # 空状态
├── LoadingState.tsx  # 加载状态
├── Progress.tsx      # 进度指示
├── Charts.tsx        # 图表
├── DataTable.tsx     # 数据表格
├── Drawer.tsx        # 抽屉
└── index.ts          # 导出
```

### 快速导入

```tsx
import { 
  Button, Card, Badge, StatCard,
  PageContainer, PageSection,
  EmptyState, LoadingState,
  ThemeInput, ThemeSelect
} from '@/components/ui'
```

### 按钮 (Button)

```tsx
import { Button } from '@/components/ui'

// 变体
<Button variant="primary">主要按钮</Button>
<Button variant="secondary">次要按钮</Button>
<Button variant="outline">描边按钮</Button>
<Button variant="ghost">幽灵按钮</Button>
<Button variant="destructive">危险按钮</Button>

// 尺寸
<Button size="sm">小</Button>
<Button size="md">中</Button>
<Button size="lg">大</Button>

// 带图标
<Button leftIcon={<Icon />}>左侧图标</Button>
<Button rightIcon={<Icon />}>右侧图标</Button>

// 加载状态
<Button loading>加载中</Button>

// 禁用状态
<Button disabled>禁用</Button>
```

### 卡片 (Card)

```tsx
import { Card, CardHeader, CardTitle, CardContent, StatCard } from '@/components/ui'

// 基础卡片
<Card>
  <CardContent>内容</CardContent>
</Card>

// 带标题卡片
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>内容</CardContent>
</Card>

// 可交互卡片
<Card hover>悬浮效果</Card>

// 统计卡片
<StatCard 
  label="总用户"
  value="1,234"
  description="较上月 +12%"
  variant="success"
/>
```

### 徽章 (Badge)

```tsx
import { Badge, StatusBadge } from '@/components/ui'

// 基础徽章
<Badge>默认</Badge>
<Badge variant="primary">主要</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="destructive">危险</Badge>

// 带点徽章
<Badge variant="success" dot>在线</Badge>

// 状态徽章
<StatusBadge status="completed" />
<StatusBadge status="pending" />
<StatusBadge status="failed" />
```

### 表单字段

```tsx
import { ThemeInput, ThemeSelect, ThemeTextarea, FormField, FormLabel } from '@/components/ui'

<FormField>
  <FormLabel>用户名</FormLabel>
  <ThemeInput placeholder="请输入" />
</FormField>

<ThemeSelect>
  <option>选项 1</option>
  <option>选项 2</option>
</ThemeSelect>

<ThemeTextarea placeholder="请输入" rows={4} />
```

### 页面布局

```tsx
import { PageContainer, PageSection, PageGrid, PageTabs } from '@/components/ui'

<PageContainer>
  <PageSection title="区块标题" description="描述">
    内容
  </PageSection>
</PageContainer>

<PageGrid cols={3} gap="md">
  <Card />
  <Card />
  <Card />
</PageGrid>

<PageTabs 
  items={[
    { key: 'tab1', label: '标签1' },
    { key: 'tab2', label: '标签2', count: 5 },
  ]}
  activeKey={activeTab}
  onChange={setActiveTab}
/>
```

### 进度指示

```tsx
import { ProgressBar, ProgressCircle, ProgressSteps, ScoreCircle } from '@/components/ui'

<ProgressBar value={75} showLabel />
<ProgressCircle value={85} label="完成率" />
<ScoreCircle score={92} label="健康分" />

<ProgressSteps steps={[
  { label: '步骤1', status: 'completed' },
  { label: '步骤2', status: 'current' },
  { label: '步骤3', status: 'pending' },
]} />
```

### 图表

```tsx
import { Sparkline, DonutChart, TrendIndicator } from '@/components/ui'

// 趋势线
<Sparkline data={[10, 20, 15, 30, 25]} color="hsl(var(--primary))" />

// 环形图
<DonutChart data={[
  { label: '成功', value: 120 },
  { label: '失败', value: 20 },
]} />

// 趋势指示
<TrendIndicator value={12.5} format="percent" />
```

### 空状态和加载

```tsx
import { EmptyState, LoadingState, Skeleton, SkeletonCard } from '@/components/ui'

// 空状态
<EmptyState 
  title="暂无数据"
  description="尝试添加新项目"
  action={{ label: '创建', onClick: () => {} }}
/>

// 加载状态
<LoadingState message="加载中..." />

// 骨架屏
<SkeletonCard lines={3} showAvatar />
<SkeletonList count={5} />
```

---

## 使用规范

### ✅ 推荐做法

```tsx
// 1. 使用组件库
import { Button } from '@/components/ui'
<Button variant="primary">提交</Button>

// 2. 使用设计令牌
<div className="text-[hsl(var(--foreground))]" />
<div className="bg-[hsl(var(--background))]" />

// 3. 使用统一圆角
<div className="rounded-lg" />
<div className="rounded-xl" />

// 4. 使用响应式前缀
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" />
```

### ❌ 避免做法

```tsx
// 1. 不要直接使用颜色值
<div className="bg-blue-500" />  // 错误

// 2. 不要混用圆角系统
<div className="rounded-workshop-lg" />  // 已废弃

// 3. 不要使用内联样式
<div style={{ backgroundColor: '#fff' }} />  // 错误

// 4. 不要硬编码字号
<div className="text-[15px]" />  // 错误
```

### 组件组合示例

```tsx
// 示例：用户卡片
function UserCard({ user }) {
  return (
    <Card hover className="p-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
          <span className="text-lg font-bold text-white">
            {user.name[0]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <StatusBadge status={user.online ? 'online' : 'offline'} />
      </div>
    </Card>
  )
}
```

---

## 更新日志

### v1.0.0 (2026-07-19)
- 完成设计系统基础架构
- 新增 20+ UI 组件
- 支持浅色/深色主题
- 统一圆角和阴影系统
