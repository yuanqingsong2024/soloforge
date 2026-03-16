# SoloForge 通讯增强功能实施总结

## 实施时间
2026-03-05

## 实施范围
实现 3 个核心扩展：
1. 模板系统变量填充
2. 联系人绑定（Ticket ↔ Contact ↔ Targets）
3. 发送幂等 + 退避重试 + 回执审计（P0）

---

## 交付清单

### Wave 0: Schema 验证 ✅
- ✅ 验证 Contact/ContactTarget/MessageTemplate/TemplateRun/OutboundMessage 表结构完整
- ✅ Prisma schema 格式化与验证通过
- ✅ 所有关系定义正确（onDelete: Cascade/SetNull）

### Wave 1: 后端 API 端点（8 个） ✅

#### 联系人管理（4 个端点）
- ✅ `POST /api/contacts` - 创建联系人
- ✅ `GET /api/contacts` - 获取联系人列表（含 contactTargets 关联）
- ✅ `PUT /api/contacts/:id` - 更新联系人
- ✅ `DELETE /api/contacts/:id` - 删除联系人（级联删除 contactTargets）

#### 联系人目标绑定（3 个端点）
- ✅ `POST /api/contacts/:contactId/targets` - 绑定目标到联系人
- ✅ `GET /api/contacts/:contactId/targets` - 获取联系人的所有目标
- ✅ `DELETE /api/contacts/:contactId/targets/:targetId` - 解绑目标

#### 模板渲染（1 个端点）
- ✅ `POST /api/message-templates/render` - 渲染模板生成草稿消息
  - 支持变量合并（defaults + inferred + input）
  - 自动推导 ticket/contact 变量
  - 幂等性检查（contentHash 去重）
  - 创建 templateRun 和 outboundMessage 记录

#### 消息发送与重试（2 个端点）
- ✅ `POST /api/outbound-messages/:id/send` - 发送消息（需 SEND_EXTERNAL 审批）
- ✅ `POST /api/outbound-messages/retry-due` - 批量重试失败消息

### Wave 2: 前端页面（3 个页面 + 1 个改造） ✅

#### 新增页面
- ✅ `src/renderer/pages/Contacts.tsx` - 联系人管理页面
  - 联系人列表（DataTable）
  - 新建/编辑表单
  - 目标绑定功能
  - 主要目标标记
- ✅ `src/renderer/pages/MessageTemplates.tsx` - 消息模板管理页面
  - 模板列表（DataTable）
  - 新建/编辑表单
  - 变量 Schema JSON 编辑器
  - 模板预览功能

#### 页面改造
- ✅ `src/renderer/pages/TicketDetail.tsx` - 添加联系人绑定与模板发送
  - 联系人选择与绑定
  - 主要目标自动带出
  - 模板选择与变量填充
  - 草稿生成与发送
- ✅ `src/renderer/pages/OutboundMessageCenter.tsx` - 增强重试功能
  - 状态筛选（DRAFT/PENDING_APPROVAL/SENDING/SENT/FAILED）
  - 批量重试按钮
  - 单条重试按钮
  - 重试信息展示（attempts/nextRetryAt）

### Wave 3: 模板系统集成 ✅
- ✅ 模板渲染逻辑（`renderTemplateText` 函数）
- ✅ 变量合并逻辑（`mergeTemplateVariables` 函数）
- ✅ 幂等性检查（`computeContentHash` + `computeIdempotencyKey`）
- ✅ 模板管理 API（CRUD）

### Wave 4: 审批与审计联动 ✅
- ✅ SEND_EXTERNAL 审批集成（`ApprovalGuard.executeProtected`）
- ✅ 审批状态流转（DRAFT → PENDING_APPROVAL → APPROVED → SENDING → SENT）
- ✅ 审计日志增强字段：
  - `approval_id` - 关联审批记录
  - `template_id` - 关联模板
  - `outbound_message_id` - 关联外发消息
  - `provider_message_id` - 提供商消息 ID
- ✅ 审计动作：
  - `OUTBOUND_SEND_REQUESTED` - 发送请求
  - `OUTBOUND_SENT` - 发送成功
  - `OUTBOUND_FAILED` - 发送失败
  - `OUTBOUND_CANCELED` - 审批拒绝取消
  - `TEMPLATE_RENDER` - 模板渲染
  - `CONTACT_CREATE/UPDATE/DELETE` - 联系人操作
  - `CONTACT_TARGET_BIND/UNBIND` - 目标绑定操作

### Wave 5: 重试机制 ✅
- ✅ 指数退避策略（1m, 5m, 15m, 1h, 6h）
- ✅ 最大重试次数（8 次）
- ✅ 重试窗口计算（`computeNextRetryAt`）
- ✅ 错误分类（`classifySendError`）：
  - AUTH_FAILED - 认证失败（不可重试）
  - RATE_LIMIT - 限流（可重试）
  - NETWORK - 网络错误（可重试）
  - INVALID_TARGET - 无效目标（不可重试）
  - UNKNOWN - 未知错误（可重试）
- ✅ 批量重试端点（`POST /api/outbound-messages/retry-due`）

### Wave 6: 种子数据 ✅
- ✅ 需求澄清模板（REQUIREMENTS_CLARIFY）
  - 变量：ticketTitle, customerName, questions
  - 渠道：email, slack, wechat
- ✅ 报价与方案沟通模板（QUOTE）
  - 变量：ticketTitle, customerName, estimatedDays, priceRange
  - 渠道：email
  - 包含免责声明："本报价为初步估算，最终价格和工期以实际开发为准"
- ✅ 交付通知模板（DELIVERY_NOTICE）
  - 变量：ticketTitle, customerName, deliveryItems
  - 渠道：email, slack, wechat

---

## 技术实现细节

### 安全约束（已落地）
- ✅ 所有外发必须 SEND_EXTERNAL 审批
- ✅ 敏感信息仅存 Keychain（token/password）
- ✅ 审计日志使用 maskTarget 脱敏
- ✅ 幂等性检查防止重复发送
- ✅ 审批拒绝自动取消消息

### 数据流
```
1. 用户在 TicketDetail 选择模板
2. 填充变量（defaults + ticket/contact 推导 + 用户输入）
3. POST /api/message-templates/render
   ├─ 创建 templateRun 记录
   ├─ 创建 outboundMessage (status=DRAFT)
   └─ 返回 draftMessageId
4. 用户点击"发送"
5. POST /api/outbound-messages/:id/send
   ├─ ApprovalGuard.executeProtected('SEND_EXTERNAL')
   ├─ 创建 Approval (status=PENDING)
   └─ 更新 outboundMessage (status=PENDING_APPROVAL)
6. 人工审批（ApprovalCenter）
7. PUT /api/approvals/:id (status=APPROVED)
   └─ 触发 dispatchOutboundMessage
      ├─ 查询 allowlisted commsTarget
      ├─ 调用 OpenClawClient.send
      ├─ 更新 outboundMessage (status=SENT/FAILED)
      └─ 写入 auditLog
8. 如果失败：计算 nextRetryAt，等待重试窗口
9. 批量重试：POST /api/outbound-messages/retry-due
```

### 幂等性保证
- `idempotencyKey`: SHA256(ticketId + templateId + scenario + channel + to + bodyHash + dateBucket)
- `contentHash`: SHA256(channel + to + subject + body)
- 发送前检查：相同 contentHash 且状态为 SENDING/SENT → 复用结果，禁止重复发送

### 重试策略
- 退避阶梯：[1, 5, 15, 60, 360] 分钟
- 最大尝试：8 次
- 可重试错误：RATE_LIMIT, NETWORK, UNKNOWN
- 不可重试错误：AUTH_FAILED, INVALID_TARGET

---

## 验证结果

### 类型检查 ✅
```bash
npx tsc --noEmit
# 输出：无错误
```

### Schema 验证 ✅
```bash
npx prisma validate
# 输出：The schema at prisma\schema.prisma is valid 🚀
```

### LSP 诊断 ✅
```bash
lsp_diagnostics(api-server.ts, severity=error)
# 输出：No diagnostics found
```

### 生产构建 ✅
```bash
npm run build
# 输出：
# ✓ vite build (1.94s)
# ✓ electron main (234ms)
# ✓ electron preload (11ms)
# ✓ electron-builder (NSIS installer)
```

### 种子数据 ✅
```bash
npx prisma db seed
# 输出：3 个模板已创建/更新
```

---

## 文件变更清单

### 后端文件
- `src/main/services/api-server.ts` - 新增 8 个 API 端点 + 类型定义
- `prisma/seed.ts` - 新增 3 个模板种子数据

### 前端文件
- `src/renderer/pages/Contacts.tsx` - 新建（联系人管理）
- `src/renderer/pages/MessageTemplates.tsx` - 新建（模板管理）
- `src/renderer/pages/TicketDetail.tsx` - 改造（联系人绑定 + 模板发送）
- `src/renderer/pages/OutboundMessageCenter.tsx` - 增强（重试功能）
- `src/renderer/App.tsx` - 新增路由（/contacts, /message-templates）

### Schema 文件
- `prisma/schema.prisma` - 已存在完整表结构（无需修改）

---

## 使用指南

### 1. 初始化数据
```bash
# 运行种子数据（包含 3 个内置模板）
npx prisma db seed
```

### 2. 创建联系人
1. 打开"联系人"页面（/contacts）
2. 点击"+ 新建联系人"
3. 填写姓名、公司、标签、备注
4. 保存

### 3. 绑定通信目标
1. 在联系人列表中点击联系人
2. 点击"+ 绑定目标"
3. 选择 commsTarget（需先在 Communications 页面创建）
4. 设置是否为主要目标
5. 保存

### 4. 工单绑定联系人
1. 打开工单详情页（/tickets/:id）
2. 在"联系人与发送"区域选择联系人
3. 系统自动带出主要目标
4. 点击"保存绑定"

### 5. 使用模板发送消息
1. 在工单详情页选择模板
2. 填充变量（系统自动推导 ticket/contact 信息）
3. 点击"生成草稿"
4. 预览渲染结果
5. 点击"发送"（进入审批流程）
6. 在审批中心通过审批
7. 消息自动发送

### 6. 重试失败消息
- 单条重试：在 OutboundMessageCenter 点击"重试"按钮
- 批量重试：点击"批量重试失败消息"按钮

---

## 风险控制

### 已实施的安全措施
1. ✅ 所有外发必须 SEND_EXTERNAL 审批
2. ✅ 审计日志记录完整链路（trace_id 贯穿）
3. ✅ 敏感信息脱敏（maskTarget）
4. ✅ 幂等性检查防止重复发送
5. ✅ 重试次数限制（最多 8 次）
6. ✅ 错误分类与可重试判断

### 已知限制
1. 模板变量仅支持扁平结构（不支持嵌套对象）
2. 模板语法仅支持 `{{variable}}`（不支持条件/循环）
3. 批量重试无并发控制（顺序执行）
4. 重试窗口固定（不支持自定义退避策略）

---

## 后续优化建议

### 短期（1-2 周）
- [ ] 添加模板预览功能（实时渲染）
- [ ] 支持模板版本管理
- [ ] 添加发送统计报表

### 中期（1-2 月）
- [ ] 支持模板条件渲染（if/else）
- [ ] 支持模板循环（for）
- [ ] 添加发送速率限制
- [ ] 支持自定义重试策略

### 长期（3-6 月）
- [ ] 支持多语言模板
- [ ] 支持富文本编辑器
- [ ] 添加 A/B 测试功能
- [ ] 集成更多通信渠道（SMS/钉钉/飞书）

---

## 测试建议

### 功能测试
1. 创建联系人 → 绑定目标 → 设置主要目标
2. 创建工单 → 绑定联系人 → 选择模板 → 填充变量 → 生成草稿
3. 发送消息 → 审批 → 验证发送成功
4. 模拟网络异常 → 验证重试机制
5. 重复发送相同内容 → 验证幂等性

### 边界测试
1. 未绑定联系人发送 → 应提示错误
2. 模板变量缺失 → 应使用默认值
3. 重试次数超限 → 应停止重试
4. 审批拒绝 → 消息应取消

### 性能测试
1. 批量重试 100 条消息 → 验证执行时间
2. 模板渲染 1000 次 → 验证内存占用
3. 联系人列表 1000 条 → 验证加载速度

---

## 交付确认

- ✅ 所有 API 端点实现完整
- ✅ 所有前端页面实现完整
- ✅ 类型检查通过（0 errors）
- ✅ Schema 验证通过
- ✅ 生产构建成功
- ✅ 种子数据可用
- ✅ 审批流程集成
- ✅ 审计日志完整
- ✅ 幂等性保证
- ✅ 重试机制完整
- ✅ 安全约束落地

**实施状态：✅ 全部完成**
