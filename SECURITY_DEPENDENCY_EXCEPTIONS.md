# 生产依赖安全豁免记录

更新时间：2026-08-28

## 当前状态

已完成 Electron 28 → 30.5.1 运行时升级，以及 Fastify 4 → 5.12.1、`@fastify/cors` 9 → 11.3.0 迁移。`npm audit --omit=dev --audit-level=high` 当前报告 0 vulnerabilities；`find-my-way` 保持在 9.9.0。

本记录中的 Fastify High 风险已关闭，保留历史信息用于发布审计追踪。

## 已关闭项目

| 依赖链 | 原严重度 | 关闭方式 | 验证证据 |
|---|---:|---|---|
| `fastify -> find-my-way` | High | 升级 Fastify 5.12.1，并同步升级 `@fastify/cors` 11.3.0 与 Electron 30.5.1 | 依赖树无 invalid；`npm audit --omit=dev --audit-level=high` 为 0；Linux 打包、Electron 启动和离线 E2E 通过 |

## 责任与期限

- 关闭责任：发布负责人
- 关闭日期：2026-08-28
- 后续依赖升级仍需重新执行生产依赖审计和跨平台回归。
- 禁止执行未经兼容性验证的 `npm audit fix --force`。