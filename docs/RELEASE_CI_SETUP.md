# 三平台发布 CI 配置

## 触发方式

- 手动运行：GitHub Actions → Release Build → Run workflow
- 正式标签：推送 `v*` 标签
- 非标签构建：仅生成内部 RC 制品，不视为正式签名发布

## 必需 Secrets

正式标签构建前，在仓库或环境级 Secrets 配置：

- `CSC_LINK`：macOS/Linux 代码签名证书地址
- `CSC_KEY_PASSWORD`：证书密码
- `WIN_CSC_LINK`：Windows 代码签名证书地址
- `WIN_CSC_KEY_PASSWORD`：Windows 证书密码

Secrets 不得写入 `.env`、SQLite、日志或仓库文件。签名凭证缺失时，标签工作流必须失败。

## CI 验收

每个平台必须上传：

1. 安装制品（NSIS/DMG/AppImage）；
2. `SHA256SUMS.txt`；
3. 构建日志；
4. 安装/启动冒烟结果；
5. 签名状态。

当前工作流已提供三平台构建、制品检查、哈希生成和标签签名门禁。Windows/macOS 的实际运行结果必须以 GitHub Actions 记录为准，不能用 Linux 本地结果替代。
