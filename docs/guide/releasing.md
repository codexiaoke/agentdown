---
title: 发布流程
description: Agentdown 的 CI 门禁、版本校验、npm Trusted Publisher 和回滚步骤。
---

# 发布流程

Agentdown 只从 Git tag 触发 npm 发布。普通 push 和 pull request 不持有发布权限。

## 一次性设置

`agentdown` 已存在于 npm，因此可以直接按
[npm Trusted Publisher 官方说明](https://docs.npmjs.com/trusted-publishers/)在 package settings 配置：

- Provider：GitHub Actions
- Organization or user：`codexiaoke`
- Repository：`agentdown`
- Workflow filename：`release.yml`
- Environment：留空
- Allowed action：`npm publish`

发布工作流使用 GitHub OIDC 短期凭证，不需要 `NPM_TOKEN`。配置成功并验证后，可以在 npm
Publishing access 中禁止传统 token 发布。

GitHub `main` 分支建议要求以下 CI checks：

- `quality (Node 20.19.0)`
- `quality (Node 24)`
- `package`
- `browser`

## 每次发布

1. 更新 `package.json` 和 `package-lock.json` 版本。
2. 更新 `CHANGELOG.md`。
3. 本地运行 `npm run release:check`。
4. 提交并推送，等待 `ci` 全部通过。
5. 创建与版本严格相等的 tag，例如 `v0.1.0-rc.1`，再推送 tag。

```bash
npm run release:verify -- v0.1.0-rc.1
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

`release.yml` 会重新安装依赖和三种浏览器，跑完整门禁，然后用 npm Trusted Publishing
发布。预发布版本自动使用 `next` dist-tag；稳定版本使用 `latest`。发布脚本会拒绝：

- tag 与 `package.json` 版本不一致；
- npm 上已经存在的不可变版本；
- GitHub workflow repository 与 `package.json.repository` 不一致。

## 门禁包含什么

`npm run release:check` 包含：

- 65+ 文件的单元测试和 TypeScript/Vue 类型检查
- Google Chrome、Firefox、WebKit 真实浏览器流程
- 文档构建
- ESM/CJS、声明文件和三个公开 subpath 的 tarball 消费者构建
- 生产依赖 audit
- npm tarball 内容检查

这里的浏览器 fixture 是前端测试 transport；FastAPI 示例后端不被当作发布闭环。

`npm run audit:production` 是发布硬门禁，当前为 0。完整 `npm audit` 仍会报告 VitePress
1.6.4 内嵌的旧 Vite/esbuild 开发服务器链（2 moderate、1 high），npm 标记为无稳定修复版本；
它们不进入发布 tarball。仓库将 `docs:dev` 限制在 `127.0.0.1`，不要把文档开发服务器暴露到公网，
并由 Dependabot 继续跟踪上游稳定版修复。

## 发布后验证与回滚

确认 npm 的版本、dist-tag、仓库链接和 provenance 正确：

```bash
npm view agentdown version dist-tags repository
```

npm 版本不可覆盖。如果 release candidate 有问题，应发布修复版本并把错误版本标记为 deprecated，
不要删除 Git tag 后重复使用同一个版本：

```bash
npm deprecate agentdown@0.1.0-rc.1 "Use a newer release candidate."
```
