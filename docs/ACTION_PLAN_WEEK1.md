# SoloForge 立即行动计划

> 生成日期: 2026-08-01
> 本周执行计划

---

## 本周执行: P1-T001 i18n 基础设施搭建

### 任务目标

搭建多语言支持的基础设施，提取 Dashboard 页面的硬编码文本作为示例。

### 执行步骤

#### Step 1: 创建目录结构和配置文件

```bash
# 1. 创建语言文件目录
mkdir -p resources/locales/en-US
mkdir -p resources/locales/zh-CN

# 2. 创建初始翻译文件
cat > resources/locales/en-US/translation.json << 'EOF'
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search",
    "loading": "Loading...",
    "noData": "No data",
    "confirm": "Confirm",
    "success": "Success",
    "error": "Error",
    "warning": "Warning",
    "info": "Info"
  },
  "dashboard": {
    "title": "Dashboard",
    "overview": {
      "title": "Overview",
      "workspaces": "Workspaces",
      "targets": "Targets",
      "healthy": "Healthy",
      "degraded": "Degraded",
      "unreachable": "Unreachable",
      "alerts": "Alerts",
      "critical": "Critical",
      "operations": "Operations",
      "running": "Running",
      "pending": "Pending",
      "agents": "Agents",
      "online": "Online",
      "offline": "Offline",
      "updates": "Available Updates"
    },
    "critical": {
      "title": "Critical Issues",
      "noIssues": "No critical issues"
    },
    "pending": {
      "title": "Pending Actions",
      "approvals": "Pending Approvals",
      "changes": "Pending Changes",
      "noPending": "No pending actions"
    }
  },
  "navigation": {
    "dashboard": "Dashboard",
    "tickets": "Tickets",
    "team": "Team",
    "approvals": "Approvals",
    "audit": "Audit Logs",
    "connections": "Connections",
    "config": "Configuration",
    "deployments": "Deployments",
    "agents": "Host Agents",
    "releases": "Releases",
    "settings": "Settings"
  },
  "ticket": {
    "status": {
      "INBOX": "Inbox",
      "SPEC": "Spec",
      "DEV": "Development",
      "TEST": "Testing",
      "DELIVERY": "Delivery",
      "DONE": "Done"
    },
    "priority": {
      "LOW": "Low",
      "MEDIUM": "Medium",
      "HIGH": "High",
      "URGENT": "Urgent"
    }
  },
  "approval": {
    "status": {
      "PENDING": "Pending",
      "APPROVED": "Approved",
      "REJECTED": "Rejected"
    },
    "action": {
      "approve": "Approve",
      "reject": "Reject",
      "request": "Request Approval"
    }
  }
}
EOF

cat > resources/locales/zh-CN/translation.json << 'EOF'
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "create": "创建",
    "search": "搜索",
    "loading": "加载中...",
    "noData": "暂无数据",
    "confirm": "确认",
    "success": "成功",
    "error": "错误",
    "warning": "警告",
    "info": "提示"
  },
  "dashboard": {
    "title": "仪表盘",
    "overview": {
      "title": "总览",
      "workspaces": "工作区",
      "targets": "目标",
      "healthy": "健康",
      "degraded": "降级",
      "unreachable": "不可达",
      "alerts": "告警",
      "critical": "严重",
      "operations": "操作",
      "running": "运行中",
      "pending": "待处理",
      "agents": "Agent",
      "online": "在线",
      "offline": "离线",
      "updates": "可用更新"
    },
    "critical": {
      "title": "严重问题",
      "noIssues": "暂无严重问题"
    },
    "pending": {
      "title": "待办事项",
      "approvals": "待审批",
      "changes": "待处理变更",
      "noPending": "暂无待办"
    }
  },
  "navigation": {
    "dashboard": "仪表盘",
    "tickets": "工单",
    "team": "团队",
    "approvals": "审批",
    "audit": "审计日志",
    "connections": "连接",
    "config": "配置",
    "deployments": "部署",
    "agents": "主机 Agent",
    "releases": "版本",
    "settings": "设置"
  },
  "ticket": {
    "status": {
      "INBOX": "收件箱",
      "SPEC": "需求",
      "DEV": "开发",
      "TEST": "测试",
      "DELIVERY": "交付",
      "DONE": "完成"
    },
    "priority": {
      "LOW": "低",
      "MEDIUM": "中",
      "HIGH": "高",
      "URGENT": "紧急"
    }
  },
  "approval": {
    "status": {
      "PENDING": "待审批",
      "APPROVED": "已批准",
      "REJECTED": "已拒绝"
    },
    "action": {
      "approve": "批准",
      "reject": "拒绝",
      "request": "请求审批"
    }
  }
}
EOF
```

#### Step 2: 配置 i18next

```typescript
// src/renderer/i18n/index.ts

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-US',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  })

export default i18n
```

#### Step 3: 在 main.tsx 中引入

```typescript
// src/renderer/main.tsx

import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

#### Step 4: 创建语言切换器组件

```typescript
// src/renderer/components/LanguageSwitcher.tsx

import { useTranslation } from 'react-i18next'

const languages = [
  { code: 'en-US', name: 'English' },
  { code: 'zh-CN', name: '中文' }
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  
  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="px-2 py-1 border rounded text-sm"
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.name}
        </option>
      ))}
    </select>
  )
}
```

#### Step 5: 在 Topbar 中添加语言切换器

```typescript
// 在 Topbar.tsx 中添加
import { LanguageSwitcher } from './LanguageSwitcher'

// 在右上角区域添加
<div className="flex items-center gap-4">
  <LanguageSwitcher />
  <ThemeToggle />
</div>
```

#### Step 6: 更新 vite.config.ts 支持语言文件

```typescript
// vite.config.ts

export default defineConfig({
  plugins: [react(), electron()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  // 添加语言文件复制
  publicDir: 'public'
})
```

创建 public/locales 目录并复制语言文件，或者使用 vite-plugin-copy

---

## 验收清单

完成以上步骤后，验证以下功能:

- [ ] 语言切换器显示在 Topbar
- [ ] 切换语言后 Dashboard 标题变为"仪表盘"
- [ ] 切换语言后 Status 标签显示中文
- [ ] 语言偏好保存到 localStorage
- [ ] 页面刷新后语言保持不变

---

## 下一步: P1-T002 核心 UI 翻译

准备下一周的工作:

1. 提取所有页面的硬编码文本
2. 创建翻译键命名规范文档
3. 分配翻译任务

---

## 周报模板

```
# 周报: 2026-08-01 ~ 2026-08-07

## 本周完成
- [x] P1-T001: i18n 基础设施搭建
  - 创建语言文件目录结构
  - 配置 react-i18next
  - 实现语言切换器组件
  - 在 Topbar 中集成

## 下周计划
- [ ] P1-T002: 核心 UI 翻译
  - 提取 Dashboard 页面文本
  - 提取工单页面文本
  - 提取审批页面文本

##  blockers
无
```

---

*最后更新: 2026-08-01*
