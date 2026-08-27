# Fastify 5 迁移评估

日期：2026-08-27

## 结论

当前 SoloForge 使用 Electron 28，其内置 Node.js 运行时不支持 Fastify 5 所需的 `diagnostics.tracingChannel`。直接升级 Fastify 5 会导致 Electron 主进程在加载阶段崩溃，无法创建窗口。

实测错误：

```text
TypeError: diagnostics.tracingChannel is not a function
at node_modules/fastify/lib/wrap-thenable.js
```

## 当前决策

- 保持 `fastify@4.29.1` 和对应的 `@fastify/cors@9`。
- 生产审计保留 2 个 Fastify/find-my-way High 风险记录。
- 当前缓解：API 仅绑定本机地址、严格 CORS、禁止公网代理信任、不开启 HTTP/2。
- 不执行 `npm audit fix --force`。

## 当前进展

Electron 33 的升级实验因 Electron 二进制下载在当前环境长时间无响应而停止，已确认 `package.json` 和 `node_modules` 仍保持 Electron 28.3.3，未留下半升级状态。跨平台 runner 仍需在 CI 中完成真实验证。

## 后续迁移条件

Fastify 5 必须与 Electron 主版本升级作为一个兼容性项目处理：

1. 升级到支持 `diagnostics.tracingChannel` 的 Electron/Node 运行时；
2. 补齐所有非 200 response schema；
3. 运行类型、单元、集成、E2E 和生产打包回归；
4. 在 Linux、Windows、macOS runner 分别验证 Electron 启动；
5. 通过 `npm audit --omit=dev --audit-level=high` 后再关闭本豁免。
