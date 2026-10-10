# Agentdown 重写计划

分支：`rewrite/agentdown-next`。基线：`main` 的 `b233d973164b5827caf98e77a41639a9c469c6a5`。

目标是交付跨前端框架的 Agent 交互运行时与任务工作区。Vue 与 React 首批共同消费纯 TypeScript Session，覆盖发起任务、执行进度、工具、人工决策、产物与恢复。

阶段 0 已实现并通过原型验证；阶段 1 已跑通完整任务流程，默认工作区与扩展能力继续迭代。当前为不兼容旧 API 的预览阶段，新 `@agentdown/*` workspace 包均为 `private`，未发布到 npm。本文作为重写进度入口。

## 运行与验证

在仓库根目录执行 `npm ci`，然后执行 `npm run dev` 或等价的 `npm run dev:next`。它们共同启动 Node 无模型参考后端（8010）和 Vite 原型（5174）：

- 默认 Vue 工作台：`http://localhost:5174/`，页面内可切换 React。
- Vue：`http://localhost:5174/vue.html`
- React：`http://localhost:5174/react.html`

两个页面共享纯 TypeScript Session 与参考 HTTP / SSE 协议，支持发送任务、文本 / 步骤 / 工具、两项独立审批、继续执行、产物、断开恢复、存档刷新、只读回放与确认丢失后的恢复。当前示例界面不等于已导出的 `AgentWorkspace` 组件。

```sh
npm run test:next
npm run test:reference
npm run test:next:e2e
npm run build:next
npm run test:next:package-consumer
```

也可单独执行 `npm run typecheck:next`；默认 `test`、`typecheck` 与 `build` 仍面向旧实现。参考后端按固定流程运行，不调用模型，也不执行真实保存或发布；事件和操作只保存在当前进程内存。后端重启后，浏览器存档无法恢复已丢失的服务端数据。完整契约及限制见[参考后端说明](https://github.com/codexiaoke/agentdown/blob/rewrite/agentdown-next/examples/reference-server/README.md)。

## 设计依据

- [统一架构与公共 API](design.md)：规范性设计，接口和语义以此为准。
- [核心建模与行为详解](core.md)：领域记录、操作状态、恢复及回放。
- [Vue / React 消费与组件契约](ui.md)：默认工作区、自建界面和生命周期。
- [项目、竞品与 npm 调研](research.md)：截至 2026-10-10 的证据快照。

## 实施顺序

### 0. 最小契约原型

- [x] 建立 workspace 与纯 TypeScript core，公开 createAgentSession、getSnapshot、subscribe、dispatch、exportSnapshot 和 dispose。
- [x] 实现稳定快照、事件事务、Operation / attempt 身份和投递结果；分开业务确认与执行结果。
- [x] 实现最小无模型参考后端，提供 POST SSE、稳定事件身份、操作幂等、结果查询和恢复游标。
- [x] Vue 和 React 分别接入相同 Session 契约，先提供薄 UI。
- [x] 验证 StrictMode、owned / borrowed 生命周期、SSR 首屏与 hydration。
- [x] 验证断线补发、刷新恢复以及 uncertain 后查询或沿原身份重投。

已验证：同一后端和事件 fixture 在 Vue / React 产生一致的领域状态与操作回传；重复挂载不重复发起任务，重复事件不重复追加内容，回放不产生业务副作用。验证分别位于 `packages/*/test`、`tests/next`、`examples/reference-server/server.test.mjs` 和 `e2e-next`。

### 1. 完整任务流程与默认工作区

- [x] 跑通发送 → 文本 / 步骤 → 工具 → 多项审批 → 继续执行 → 产物的双框架原型。
- [ ] 提供可复用默认工作区组件和工作台 / 紧凑布局；原型已有对话、执行、待处理交互与产物区域。
- [ ] 提供共享 Catalog、分别注册 Vue / React 组件的扩展方式。
- [ ] 重做主题 tokens、中文 / 英文文案和基础可访问性。

### 2. 内容与生成式 UI

- [ ] 验证流式解析候选，交付共享中立内容模型和稳定节点。
- [ ] 接入 A2UI 官方协议引擎与版本协商，交付双框架共同基础控件。
- [ ] 实现附件、文件预览、重型内容按需扩展和长列表优化。
- [ ] 验证表单草稿冲突、焦点 / IME、滚动与安全策略一致性。

### 3. 生态接入与发布

- [ ] 验证 AG-UI、自定义接入和 AI SDK；逐个验证其他 Agent 框架适配器。
- [ ] 提供旧 API / 存档迁移文档以及明确的支持矩阵。
- [x] 当前原型已通过独立 tarball 安装，验证 core / reference 的框架隔离、两种 UI 的依赖、SSR、严格类型及包出口；正式发布前随新增能力继续验证。
- [ ] 发布相同机器与事件 trace 下的性能结果，验证 npm 发布链路。
- [ ] 先发布 next 预览，完成承诺能力的验收后发布正式版本。

## 原型中继续决定的事项

当前采用 npm workspace，已有 `@agentdown/core`、`@agentdown/vue`、`@agentdown/react` 和 `@agentdown/reference` 四个私有本地包。最终发布包名、打包出口、Markdown 解析器和 A2UI 支持版本仍需后续验证；这些名称不是已发布安装命令。

旧版 `src/`、FastAPI `backend/`、示例与文档仍在过渡中，新实现替换对应能力后再清理。旧实现中已有的 Markdown、A2UI 和框架适配器尚不能视为已迁移的新包能力。后续讨论围绕原型结果、默认工作区和具体协议接入展开。
