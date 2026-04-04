---
title: 发布清单
description: Agentdown 0.0.1 测试版的构建、打包与发布流程。
---

# 发布清单

## 0.0.1 发布前检查

按顺序执行：

```bash
npm install
npm run typecheck
npm run build
npm run pack:check
```

## 通过标准

- `typecheck` 无错误
- `build` 产出 `dist/index.js`、`dist/index.cjs`、`dist/index.d.ts`
- `pack:check` 中可以看到 `LICENSE`、`README.md` 和 `dist/**/*.d.ts`

## 首次发布

```bash
npm login
npm publish
```

当前仓库已经具备这些首发条件：

- `package.json` 已设置 `publishConfig.access = public`
- tarball 体积已经控制在约 `32 kB`
- `.d.ts` 已随包发布
- `mermaid` 以运行时依赖方式提供，不再整体打进产物

## 发布后冒烟检查

1. `npm info agentdown version`
2. 新建一个最小 Vue 3 + TS 项目安装包
3. 验证 `MarkdownRenderer`、`createAgentRuntime`、`createBridge`、`defineProtocol`、`when` 可导入
4. 验证 `agentdown/style.css` 和 `katex/dist/katex.min.css` 可导入
5. 验证 markdown assembler、工具 block、自定义组件注入都可运行

## 现在不阻塞发布，但建议尽快补齐

- 自动化测试
- CI 构建与版本发布
- changelog 约定
- 文档站正式域名与统计
