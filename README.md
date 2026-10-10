# Agentdown · agentdown-next

语言导航：**中文** | [English](./README.en.md)

Agentdown 正在重写为跨前端框架的 Agent 交互运行时，覆盖从发起任务、流式执行、工具和人工决策，到产物、断线恢复与历史回放的完整前端流程。Vue 与 React 共享同一个纯 TypeScript Session，后端仍负责模型调用、任务执行与业务授权。

当前仓库提供 **agentdown-next 重写原型**：阶段 0 的核心契约、双框架绑定和无模型参考后端已经实现，也提供可选的 DeepSeek 真实模型后端。这是允许破坏性更新的预览阶段，不兼容旧 API，也尚未形成完整正式库。新的 `@agentdown/*` workspace 包均为 `private`，未发布到 npm。

## 在线体验

[打开工作台](https://codexiaoke.github.io/agentdown/next/) · [React 示例](https://codexiaoke.github.io/agentdown/next/react.html)

在线版默认使用浏览器无模型演示后端，任务和事件保存在当前浏览器，支持审批、刷新恢复、回放与确认丢失模拟。这个静态地址本身没有已部署的实时模型服务；要使用真实模型，需要连接自己的公网后端。本地开发默认使用 Node HTTP 参考后端。

## 一键部署真实演示

[部署到 Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcodexiaoke%2Fagentdown%2Ftree%2Frewrite%2Fagentdown-next)

部署配置已做好，目前尚未提供任何公网真实后端地址。配置使用 Render Free、Node 24 和当前重写分支，关闭自动部署。请在平台安全环境变量设置中输入 `DEEPSEEK_API_KEY`；不要把它发到聊天或放进前端。平台会生成独立的 `AGENTDOWN_ACCESS_TOKEN`。

部署完成后，打开平台提供的域名，在界面设置中填写“部署域名 + `/api`”及该访问令牌。Vue、React 和 API 由同一个服务提供。Free 实例可能休眠，首次唤醒需要等待；休眠或重启会丢失进程内历史，临时磁盘上的报告不作长期存储。完整步骤见[真实演示指南](./examples/model-server/DEMO.md)。

## 本地无模型演示

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

## 本地真实演示

在服务端环境配置 `DEEPSEEK_API_KEY` 后执行：

```sh
npm run demo:live
```

此命令先执行 `build:live`，再用单个 Node 服务同时提供 Vue、React 和 API。默认入口为 `http://127.0.0.1:8011/`，React 为 `/react.html`，API 为 `/api`。启动时检查真实模式构建标记，拒绝无模型 fixture 构建；已构建的托管环境使用 `npm run start:demo` 启动。

需要开发热更新时，仍可执行 `npm run dev:live`：脚本设置 `VITE_AGENT_MODE=live`，关闭浏览器演示，启动默认 `127.0.0.1:8011` 的模型后端与 `5174` 的 Vite 工作台，通过 `/api` 代理连接；`AGENTDOWN_MODEL_PORT` 可修改其后端端口。可选模型配置为 `DEEPSEEK_MODEL` 和 `DEEPSEEK_BASE_URL`，模型密钥仅保留在服务端。

可以请求“写一份 Vue 与 React 选型报告，并保存到服务器”。保存报告的真实链路为：**模型流式文本 → 模型发起 `save_report` → 用户审批 → 服务器落盘 → 工具结果返回模型 → 模型继续回答**。批准后，实际报告内容作为产物显示；拒绝后，模型收到拒绝结果并继续。普通问题可直接回答，不会固定插入演示审批。

界面的示例任务按钮只填入输入框，仍需点击“发送任务”才调用模型。

执行日志、操作确认和恢复事件仍在服务端进程内存中，重启后不能恢复原执行；已保存的报告文件保留。断开连接只停止前端观察，任务继续；取消会中止模型请求并使待审批失效，已经落盘的文件不会撤回。

## 从在线页面连接真实后端

在 Vue 或 React 的后端连接设置中填写 HTTPS API URL（包含 `/api`，例如 `https://your-agent.example/api`）和独立的后端访问令牌。令牌仅保存在当前标签页的 `sessionStorage`，不进入 Session 存档；**不要填写 `DEEPSEEK_API_KEY`**。保存设置只切换连接，发送任务才发起请求。本机 loopback 开发地址可使用 HTTP。

公网后端需要 HTTPS、`AGENTDOWN_ACCESS_TOKEN` 和精准的 `AGENTDOWN_CORS_ORIGINS`；使用当前 GitHub Pages 页面时，允许的 origin 为 `https://codexiaoke.github.io`。Docker 部署、数据目录和访问控制详见[真实模型后端说明](./examples/model-server/README.md)。

## 体验无模型完整流程

两个页面使用相同 Session 契约。以下是默认无模型演示的固定流程；真实模式的工具与审批由模型输出决定：

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
| [`examples/model-server`](./examples/model-server/README.md) | DeepSeek 真实模型流、审批后保存报告、工具结果继续执行，以及认证和部署示例 |

当前 UI 是流程原型，内容以安全纯文本呈现。可复用的 `AgentWorkspace`、共享 Catalog、正式主题与国际化、Markdown 内容模型、A2UI 和生产协议适配器仍在后续计划中。

参考后端按固定流程演示工具与审批，**不调用真实模型，也不执行真实保存或发布操作**。会话、事件和操作记录只保存在当前进程内存；服务重启后，浏览器存档不能恢复已丢失的服务端数据。生产应用需要自己的模型、工具、授权、持久化与任务服务。

## 验证原型

```sh
npm run test:next                  # Core、Vue / React 绑定与 HTTP 集成测试
npm run test:reference             # Node 参考后端契约测试
npm run test:model                 # 模型协议与真实后端契约测试，使用注入的测试模型
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
