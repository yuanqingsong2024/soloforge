# 生产依赖安全豁免记录

更新时间：2026-08-26

## 当前状态

`npm audit --omit=dev` 在完成 Dockerode 5、Fastify 相关依赖和 overrides 更新后当前 `npm audit --omit=dev` 仍报告 1 个 High 漏洞，来源为 Fastify 4 本体；`find-my-way` 已通过 override 升级到 9.9.0。该记录保留 Fastify 5 迁移的历史评估，供后续 Electron 运行时升级时参考。

## 暂缓项目

| 依赖链 | 严重度 | 暂缓原因 | 临时措施 | 关闭条件 |
|---|---:|---|---|---|
| `fastify -> find-my-way` | High | Fastify 5 是破坏性主版本升级，项目当前架构规定使用 Fastify 4 | API 仅绑定本机地址；拒绝公网绑定；受信代理和 CORS 严格校验；限制请求体；不启用 HTTP/2 | 完成 Fastify 5 迁移和完整 API/E2E 回归，High 清零 |

## 责任与期限

- 责任：发布负责人
- 期限：1.0 正式发布前关闭 Critical；High 必须清零，或经安全负责人书面批准并附测试证据。
- 禁止执行未经兼容性验证的 `npm audit fix --force`。

该文件是临时门禁记录，不代表漏洞已修复。