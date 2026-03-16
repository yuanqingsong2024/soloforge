# SoloForge E2E 测试基线

## 目标

本轮 E2E 基线只解决 **Electron + Playwright 可稳定运行**、**Dashboard 关键主路径可回归**、**失败时能拿到诊断产物**。

不包含新业务能力开发，也不依赖真实远程 OpenClaw、SSH、Docker。

## 当前测试模式

### 1. Electron 测试模式

- Playwright 直接启动 **Electron 应用实例**，不再只跑浏览器页
- 启动时注入：`SOLOFORGE_E2E=1`
- 主进程 API 会为 Dashboard 返回**固定测试数据桩**

### 2. 数据来源

- Dashboard 主路径使用主进程内置的 **test-only mock 数据**
- 固定提供两个 Workspace：
  - `Local`
  - `Remote Workspace`
- 支持场景：
  - `default`
  - `workspace-secondary`
  - `empty-state`

### 3. 不依赖项

以下都**不是**基础 E2E 的前置条件：

- 真实远程 OpenClaw
- 真实 SSH
- 真实 Docker
- 真实 Host Agent 在线

## 目录结构

```text
tests/
  e2e/
    helpers/
      electron.ts
    app-launch.spec.ts
    dashboard-overview.spec.ts
    dashboard-navigation.spec.ts
    workspace-switch.spec.ts
    theme-toggle.spec.ts
    dashboard-empty-state.spec.ts
  fixtures/
    dashboard-scenarios.ts
```

## 已覆盖主路径

### A. 应用启动

- Electron 应用可启动
- 主窗口可加载
- Dashboard 首页可见
- Sidebar / Topbar 存在

### B. Dashboard 主路径

- Global Overview 正常渲染
- Critical Issues 正常渲染
- Pending Actions 正常渲染
- Activity Feed Preview 正常渲染
- Workspace 切换后上下文变化正常

### C. 关键跳转

- Overview 卡片跳转到对应模块页
- Critical Issue 跳转到对应模块页
- Pending Action 跳转到对应模块页
- 返回 Dashboard 正常

### D. 基础交互

- 顶部刷新按钮可见且可触发
- Workspace 切换器可用
- 主题切换不导致页面崩溃
- 空状态场景显示局部 empty state，不是整页报错

## 运行方式

### 前置条件

```bash
npm install
npx playwright install chromium
npm run build
```

> 说明：当前基线使用 **build 后的 Electron 主进程产物** 启动测试，因此在执行 E2E 前需要先 `npm run build`。

### 运行命令

#### 默认运行

```bash
npm run test:e2e
```

#### 有头模式

```bash
npm run test:e2e:headed
```

#### 调试模式

```bash
npm run test:e2e:debug
```

#### 查看报告

```bash
npm run test:e2e:report
```

## 失败产物

Playwright 已配置以下失败采集：

- screenshot
- trace
- video
- JSON 报告
- HTML 报告

输出目录：

- `test-results/`
- `test-results/html/`

## 调试建议

### 1. 看 trace

失败后优先打开：

```bash
npm run test:e2e:report
```

### 2. 看 Electron / Renderer 控制台线索

- Renderer 控制台消息会附加到 Playwright 测试产物中
- 主窗口若未出现，优先检查：
  - `dist-electron/main/index.js` 是否存在
  - `npm run build` 是否成功

### 3. 避免不稳定写法

当前基线约定：

- 不使用随意 `sleep`
- 优先用 `data-testid`
- 优先断言关键区块可见与文本稳定内容

## 已知限制

### 当前未覆盖

- 旧的通讯/审批/联系人链路 E2E 尚未纳入本轮稳定基线
- build 后完整打包安装包链路未纳入 E2E
- 主进程更细粒度日志抓取仍可继续增强

### 当前策略取舍

- 为了先修复 Dashboard 回归保护，当前只对 `/api/dashboard` 和 Workspace 查询提供测试桩
- 这能保证基础 E2E 不被外部网络与复杂依赖拖垮，同时不改动生产业务能力
