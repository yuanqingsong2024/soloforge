# SoloForge E2E 测试基线

## 目标

本轮 E2E 基线只解决 **Electron + Playwright 可稳定运行**、**Dashboard 关键主路径可回归**、**失败时能拿到诊断产物**。

不包含新业务能力开发，也不依赖真实远程 OpenClaw、SSH、Docker。

## 当前测试模式

### 1. Electron 测试模式

- Playwright 直接启动 **Electron 应用实例**，不再只跑浏览器页
- 启动时注入：`SOLOFORGE_E2E=1`
- 主进程 API 会为 Dashboard 返回**固定测试数据桩**
- 默认 E2E **必须** 通过 `helpers/electron.ts` 中的 `launchElectronApp()` 启动
- 默认 E2E **不能** 直接使用 `page.goto('/')` 作为入口，这种写法适用于浏览器页，不适用于当前 Electron 基线

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
      api.ts
      electron.ts
    app-launch.spec.ts
    dashboard-overview.spec.ts
    dashboard-navigation.spec.ts
    workspace-switch.spec.ts
    theme-toggle.spec.ts
    dashboard-empty-state.spec.ts
    change-and-backup-flows.spec.ts
    legacy-module-smoke.spec.ts
    contact-binding.spec.ts
    template-rendering.spec.ts
    approval-flow.spec.ts
    outbound-live-openclaw.spec.ts
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

### E. 新增闭环回归

- Topbar 全局搜索提交后可稳定显示结果面板
- 备份页生成备份包后可在“备份历史”中看到最新记录
- 变更单详情页已纳入基线，但当本地种子数据没有变更单时会稳定跳过，不制造假失败

### F. 旧业务模块稳定冒烟

- 审批中心可打开并展示筛选标签或空状态
- 联系人页可打开并展示新增表单与联系人列表区块
- 外发消息中心可打开并展示状态分组

### G. 旧链路稳定化子路径

- 联系人管理：创建联系人后可立即在列表中看到新数据
- 联系人绑定：通过 API 绑定联系人与主目标后，工单详情自动选中对应联系人/目标
- 模板渲染：创建模板 + 工单后可生成草稿预览
- 审批与外发中心：筛选标签/状态切换保持稳定；审批链路通过 API 拒绝验证状态变更
- 工单外发：通过 UI 触发外发发送，验证 SEND_EXTERNAL 审批被创建
- 幂等验证：重复创建同 payload 的外发草稿会复用同一条消息
- 重试验证：可稳定构造 FAILED 消息并覆盖手动重试、批量重试、退避窗口与历史展示

## 当前状态

- 默认全量 E2E：**33 通过 / 1 跳过 / 0 失败**
- 唯一保留跳过：`outbound-live-openclaw.spec.ts`
- 跳过原因：依赖真实外部 OpenClaw 环境、真实鉴权与真实投递目标，不属于默认离线基线
- 首批服务层单测已落地，当前采用 `node:test + tsx`，优先覆盖**不依赖 Electron 运行时**的纯逻辑模块

## 测试约定

### 1. 启动约定

- Electron E2E 统一通过 `launchElectronApp(testInfo, scenario?)` 启动
- 结束时统一通过 `closeElectronApp(context)` 关闭
- 需要回到 Dashboard 时使用 `openDashboard(page)`，不要手写重复导航逻辑

### 2. API 调用约定

- 本地 API 调用统一通过 `helpers/api.ts` 的 `apiJson(page, path, init?)`
- 不要在 spec 内重复解析 `window.location.search` 获取 `apiPort`
- 不要在 spec 内硬编码 `13789`
- 不要直接拼 `http://127.0.0.1:${port}` 这种 URL 模板

### 3. 数据约定

- 优先在测试内部**自建前置数据**，不要依赖数据库里“刚好已有”的工单、联系人、失败消息或审批记录
- 对需要复杂前置状态的测试，优先通过 API 构造，而不是依赖 UI 多步点击
- 对真实外部依赖场景，如 live OpenClaw，保留独立 spec 和条件跳过，不并入默认基线

### 4. 断言约定

- 优先断言 `data-testid`
- 优先断言**可观察状态**，例如 URL、区块可见、API 状态变化
- 少用纯文案断言；若必须依赖文案，优先使用当前真实 UI 文案，而不是历史文案
- 不要依赖 DOM 层级爬取，如连续 `.locator('..')`

### 5. 稳定性约定

- 禁止使用随意 `sleep` / `waitForTimeout`
- 优先使用 `expect.poll()`、`toBeVisible()`、`toHaveURL()` 等状态驱动等待
- 对真实异步链路，不要把“已入队”误当成“已完成”；测试应匹配接口真实状态机

### 6. Skip 策略

- 仅对**不可控外部依赖**使用 `test.skip()`，例如真实 OpenClaw 环境未提供
- 对可控数据缺失，不要 skip；应改为测试内自建数据
- 如果某条测试语义与真实实现不一致，优先修正测试语义，不要用 skip 掩盖

## 运行方式

### 前置条件

```bash
npm install
npx playwright install chromium ffmpeg
npm run build
```

> 说明：当前基线使用 **build 后的 Electron 主进程产物** 启动测试，因此在执行 E2E 前需要先 `npm run build`。
> 若刚修改了 Renderer/Main 代码但未重建，E2E 可能仍会运行旧的 `dist` / `dist-electron` 产物。
> 若首次运行或 Playwright 版本升级后出现浏览器/视频组件缺失，重新执行 `npx playwright install chromium ffmpeg`。

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

#### 真实 OpenClaw 集成测试（可选）

```bash
SOLOFORGE_LIVE_OPENCLAW_BASE_URL=http://127.0.0.1:18789 \
SOLOFORGE_LIVE_OPENCLAW_WS_URL=ws://127.0.0.1:18789 \
SOLOFORGE_LIVE_OPENCLAW_AUTH_MODE=token \
SOLOFORGE_LIVE_OPENCLAW_TOKEN=*** \
SOLOFORGE_LIVE_CHANNEL=slack \
SOLOFORGE_LIVE_TARGET=your-channel-or-user \
npm run test:e2e:live-openclaw
```

说明：这条命令**不属于默认基线**。只有在你提供可用的 OpenClaw 环境、鉴权和真实目标时才会执行；否则 spec 会自动跳过。

可选调试命令：

```bash
npm run test:e2e:live-openclaw:headed
npm run test:e2e:live-openclaw:debug
```

环境变量说明：

- `SOLOFORGE_LIVE_OPENCLAW_BASE_URL`：真实 OpenClaw HTTP 地址，例如 `http://127.0.0.1:18789`
- `SOLOFORGE_LIVE_OPENCLAW_WS_URL`：真实 OpenClaw WebSocket 地址，例如 `ws://127.0.0.1:18789`
- `SOLOFORGE_LIVE_OPENCLAW_AUTH_MODE`：`token | password | trusted-proxy`
- `SOLOFORGE_LIVE_OPENCLAW_TOKEN`：当 `AUTH_MODE=token` 时使用
- `SOLOFORGE_LIVE_OPENCLAW_PASSWORD`：当 `AUTH_MODE=password` 时使用
- `SOLOFORGE_LIVE_OPENCLAW_EDGE_TOKEN`：如网关需要第二道门禁则填写
- `SOLOFORGE_LIVE_CHANNEL`：发送渠道，默认 `slack`
- `SOLOFORGE_LIVE_TARGET`：真实目标地址或频道 ID，必填

建议：

- 先单独运行 `npm run test:e2e:live-openclaw`，不要和默认 `npm run test:e2e` 混跑
- 优先使用测试专用频道 / 机器人目标，避免误发到真实业务群组
- 若只想看 UI 过程，使用 `:headed`；若要逐步排查，使用 `:debug`

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
- 优先自建前置数据，避免依赖预置数据库内容
- API 链路统一走 `apiJson()` helper

## 已知限制

### 当前未覆盖

- build 后完整打包安装包链路未纳入 E2E
- 主进程更细粒度日志抓取仍可继续增强
- 真实 OpenClaw provider 投递成功仍未纳入默认基线；当前默认基线覆盖到审批创建、审批通过/拒绝与相关状态变更，但不覆盖真实外部投递成功
- 若需要验证真实外部投递成功，请使用 `npm run test:e2e:live-openclaw`，不要把它并入默认 `test:e2e`

### 当前策略取舍

- 为了先修复 Dashboard 回归保护，当前只对 `/api/dashboard` 和 Workspace 查询提供测试桩
- 这能保证基础 E2E 不被外部网络与复杂依赖拖垮，同时不改动生产业务能力
- 对幂等、重试、审批、联系人绑定等场景，当前优先通过 API 自建数据，减少对种子数据库的耦合
