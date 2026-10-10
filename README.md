# Agentdown · agentdown-next

语言导航：**中文** | [English](./README.en.md)

Agentdown 正在重写为跨前端框架的 Agent 交互运行时，覆盖从发起任务、流式执行、工具和人工决策，到产物、断线恢复与历史回放的完整前端流程。Vue 与 React 共享同一个纯 TypeScript Session，后端仍负责模型调用、任务执行与业务授权。

当前仓库提供 **agentdown-next 重写原型**：阶段 0 的核心契约、双框架绑定和无模型参考后端已经实现，完整流程可以在本地体验。这是允许破坏性更新的预览阶段，不兼容旧 API，也尚未形成完整正式库。新的 `@agentdown/*` workspace 包均为 `private`，未发布到 npm。

## 在线体验

[打开工作台](https://codexiaoke.github.io/agentdown/next/) · [React 示例](https://codexiaoke.github.io/agentdown/next/react.html)

在线版使用浏览器无模型演示后端，任务和事件保存在当前浏览器，支持审批、刷新恢复、回放与确认丢失模拟。它用于体验交互流程，不连接真实模型或执行保存、发布操作。本地开发默认继续使用 Node HTTP 参考后端。

## 本地运行

需要 Node.js `^20.19.0 || >=22.12.0`。在仓库根目录执行：

```sh
npm ci
npm run dev
```

`npm run dev:next` 与 `npm run dev` 相同，都会启动 Vite 原型页面和 Node 参考后端，无需填写模型密钥。

- 默认 Vue 工作台：[http://localhost:5174/](http://localhost:5174/)，页面内可切换 React。
- Vue 独立入口：[http://localhost:5174/vue.html](http://localhost:5174/vue.html)
- React 独立入口：[http://localhost:5174/react.html](http://localhost:5174/react.html)
- 参考后端：`http://localhost:8010`，前端通过 `/api` 代理访问。

## 体验完整流程

两个页面使用相同 Session 契约和参考后端协议，可以分别验证：

1. 发送任务，观察逐步到达的文本、执行步骤与工具状态。
2. 分别批准或拒绝两项独立审批。提交请求与后端确认分开显示，一个决定不会自动决定另一项。
3. 两项决定确认后，任务继续执行并生成演示报告产物。
4. 在等待审批时断开连接，再显式恢复；断开连接不会取消后端任务，补发事件不会重复追加文本。
5. 使用“保存并刷新”恢复浏览器存档，再点击恢复执行。刷新读取存档本身不会自动发送任务或连接后端。
6. 使用“查看回放”查看只读历史；回放不连接后端，也不提交操作。
7. 在断开连接后点击“模拟确认丢失”，提交一项审批，再沿原操作身份重试，验证已接受的决定可以恢复确认而不重复执行。

“取消任务”是单独的后端操作，只有后端终态事件才确认取消。操作送达、后端接受、任务完成和连接状态分别建模。

## 当前代码

| 路径 | 已实现范围 |
| --- | --- |
| [`packages/core`](./packages/core/README.md) | 无 UI 框架和 DOM 依赖的 TypeScript Session；稳定快照、领域事件、操作身份、恢复游标、存档与回放 |
| [`packages/vue`](./packages/vue/README.md) | Vue Session 绑定、Provider、selector 和 owned / borrowed 生命周期 |
| [`packages/react`](./packages/react/README.md) | React Session 绑定、Provider、selector 和 StrictMode 生命周期 |
| [`packages/reference`](./packages/reference/README.md) | 参考 HTTP / SSE 协议适配器，包括确认丢失后的恢复 |
| [`examples/prototype`](./examples/prototype) | Vue 与 React 的完整流程示例界面 |
| [`examples/reference-server`](./examples/reference-server/README.md) | Node 无模型参考后端、稳定事件身份、操作幂等、结果查询与 cursor 补发 |

当前 UI 是流程原型，内容以安全纯文本呈现。可复用的 `AgentWorkspace`、共享 Catalog、正式主题与国际化、Markdown 内容模型、A2UI 和生产协议适配器仍在后续计划中。

参考后端按固定流程演示工具与审批，**不调用真实模型，也不执行真实保存或发布操作**。会话、事件和操作记录只保存在当前进程内存；服务重启后，浏览器存档不能恢复已丢失的服务端数据。生产应用需要自己的模型、工具、授权、持久化与任务服务。

## 验证原型

```sh
npm run test:next                  # Core、Vue / React 绑定与 HTTP 集成测试
npm run test:reference             # Node 参考后端契约测试
npm run test:next:e2e              # 两种框架的浏览器流程测试
npm run build:next                 # 新 workspace 类型检查与原型构建
npm run test:next:package-consumer # tarball 独立安装、类型与依赖验证
```

浏览器测试会自动启动原型服务；若本机尚无可用 Chromium，先执行 `npx playwright install chromium`。构建输出位于 `dist-next/prototype`。也可单独执行 `npm run typecheck:next`。默认 `test`、`typecheck` 和 `build` 仍面向旧实现，新代码请使用上述专用命令。

## 重写计划与旧实现

[重写进度入口](./docs/rewrite/README.md) 包含阶段清单，以及[公共 API 设计](./docs/rewrite/design.md)、[核心语义](./docs/rewrite/core.md)、[双框架 UI 契约](./docs/rewrite/ui.md)和[项目调研](./docs/rewrite/research.md)。设计文档描述目标契约，当前实现范围以原型代码和阶段清单为准。

旧版 `src/`、FastAPI `backend/`、示例和原有文档仍在过渡中，待新实现替换对应能力后清理。`npm run dev:legacy` 仍运行旧版 Vue 示例；旧实现的能力不能直接视为新包已支持的能力。[在线文档](https://codexiaoke.github.io/agentdown/)目前主要介绍旧 API。

## License

[MIT](./LICENSE)
