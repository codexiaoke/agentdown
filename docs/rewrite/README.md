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

### 真实模型模式

服务端环境已配置 `DEEPSEEK_API_KEY` 后执行 `npm run demo:live`，先构建真实模式 UI，再启动单个 Node 服务。Vue、React 和 API 同域提供，默认入口为 `http://127.0.0.1:8011/`，React 为 `/react.html`。启动会验证 live 构建标记并拒绝 fixture；已完成 `npm run build:live` 的托管环境使用 `npm run start:demo`。

开发热更新可继续使用 `npm run dev:live`：脚本设置 `VITE_AGENT_MODE=live` 并关闭浏览器演示，启动默认 `127.0.0.1:8011` 的 DeepSeek 后端和 `5174` 的工作台，通过 `/api` 代理连接。其后端端口可用 `AGENTDOWN_MODEL_PORT` 修改，模型可用 `DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL` 配置。

真实保存链路是：模型文本 → 模型发起 `save_report` → 用户审批 → 服务器落盘 → 工具结果返回模型继续执行。普通问题没有固定审批，工具调用与审批数量由模型决定。断开连接不会取消任务；显式取消会中止模型请求并使待审批失效，已落盘文件保留。执行日志和操作记录仍在进程内存，服务重启后不能 resume 原任务。

### 部署真实演示

[一键部署到 Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcodexiaoke%2Fagentdown%2Ftree%2Frewrite%2Fagentdown-next)

部署配置已做好，尚未提供公网真实后端地址。`render.yaml` 使用 Free、Node 24、当前重写分支与 `/health` 健康检查，关闭自动部署。平台安全环境设置输入 `DEEPSEEK_API_KEY`，另行自动生成 `AGENTDOWN_ACCESS_TOKEN`。部署后打开平台提供的域名，将“部署域名 + `/api`”和后端访问令牌填入 UI 设置；Vue / React 同域工作。示例任务按钮只填输入，仍需点击发送。

启动脚本从 `RENDER_EXTERNAL_URL` 加入精确的部署 origin。Free 实例休眠后首次唤醒可能需要等待；休眠或重启丢失进程内历史，磁盘临时文件不作长期存储。操作步骤见[真实演示指南](https://github.com/codexiaoke/agentdown/blob/rewrite/agentdown-next/examples/model-server/DEMO.md)。

[线上工作台](https://codexiaoke.github.io/agentdown/next/)默认使用浏览器无模型演示，不自带实时模型服务。真实模式需要自己的公网后端：Vue / React 设置中填写 HTTPS API URL（包含 `/api`）与独立后端访问令牌。令牌只保存在当前标签页 `sessionStorage`，不进入存档；`DEEPSEEK_API_KEY` 仅在服务端配置。公网部署的 Docker、`AGENTDOWN_ACCESS_TOKEN` 与精准 `AGENTDOWN_CORS_ORIGINS` 配置见[真实模型后端说明](https://github.com/codexiaoke/agentdown/blob/rewrite/agentdown-next/examples/model-server/README.md)。

### 验证命令

```sh
npm run test:next
npm run test:reference
npm run test:model
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
- [x] 增加 DeepSeek 真实模型后端，验证模型发起工具 → 独立审批 → 报告落盘 → 工具结果返回模型继续执行；提供公网后端连接设置。
- [x] 提供单服务同域真实演示与 Render 部署配置；尚未部署公网真实后端。
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
