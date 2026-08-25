# T-011: 多语言支持（i18n）国际化 - 实现方案

## 当前状态

### 已完成
- ✅ i18next + react-i18next 配置
- ✅ 11 个翻译 namespace
- ✅ zh-CN 和 en-US 翻译文件

### 待实现
- [ ] 语言切换 UI（设置页面）
- [ ] 浏览器语言自动检测
- [ ] 语言持久化（localStorage）
- [ ] 日期/数字格式化本地化

## 实现方案

### 1. 语言切换 UI

在设置页面或 Topbar 添加语言选择器：
- 中文（简体）- zh-CN
- English - en-US

### 2. 浏览器语言自动检测

使用 `navigator.language` 自动检测浏览器语言：
- `zh-*` → zh-CN
- `en-*` → en-US
- 其他 → fallback zh-CN

### 3. 语言持久化

使用 localStorage 存储用户语言偏好：
- key: `soloforge-language`
- 首次访问时检测浏览器语言
- 后续使用用户选择

### 4. 日期/数字格式化

使用 `Intl.DateTimeFormat` 和 `Intl.NumberFormat`：
- 日期格式根据语言自动调整
- 数字格式根据语言自动调整

## 翻译覆盖范围

| Namespace | 说明 | 状态 |
|-----------|------|------|
| common | 通用按钮/状态/错误 | ✅ 完整 |
| navigation | 导航菜单 | ✅ 完整 |
| dashboard | 仪表盘 | ✅ 完整 |
| tickets | 工单管理 | ✅ 完整 |
| team | 团队管理 | ✅ 完整 |
| approval | 审批中心 | ✅ 完整 |
| audit | 审计日志 | ✅ 完整 |
| config | 配置中心 | ✅ 完整 |
| deployment | 部署管理 | ✅ 完整 |
| operations | 运维操作 | ✅ 完整 |
| help | 帮助文档 | ✅ 完整 |
