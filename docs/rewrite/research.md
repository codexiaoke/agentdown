# Agentdown 发展调研

本文保留 2026-10-10 的调研快照。下一代架构与实施顺序以 [统一设计](design.md) 和 [实施计划](README.md) 为准。
核验日期：2026-10-10（北京时间）。依据：当前 main 源码、GitHub API、官方仓库文档、npm registry 与 npm 官方下载统计 API。未执行竞品性能测试；下载数据的最新统计窗口截至 2026-10-08。

## 核心建议
下一代定位为“跨前端框架的 Agent 交互运行时，把后端事件连接成完整的用户交互流程：发起任务、查看执行、处理人工决策、继续运行、接收结果，以及中断后的恢复与回放”。Vue、React 共用核心模型和操作契约；首批两种框架共同检验这套契约。优先降低整条流程的接入成本、证明状态和交互的可靠性，发布路线按新架构调整。后续增长应围绕真实接入案例和生态合作展开。

当前已具有流式内容、工具、审批、handoff、artifact、附件预览、A2UI、安全 Catalog、诊断回放以及会话恢复。项目特点在这些能力如何衔接成完整流程；pretext 属于内部渲染实现，不作为产品特点。库负责前端连接、事件适配、状态、渲染、交互与恢复接入；宿主负责认证、模型和工具执行、Agent 编排、审批权限、持久化及后端续跑。

新版本应以整条流程验收：请求有及时反馈 → 执行步骤与工具状态可见 → 审批/拒绝/编辑对应正确动作 → 继续运行和结果留在同一会话 → 断线补发不重复、刷新不重新执行 → 回放不触发业务副作用。

## 发布与采用现状
| 指标 | 核验结果 |
|---|---|
| npm latest | 0.0.5 |
| 最后 npm 发布 | 2026-04-15；5 个版本：0.0.1–0.0.5 |
| 包首次发布 | 2026-04-03 |
| next dist-tag | 未发现 |
| 仓库 package.json | 0.1.0-rc.1 |
| main 最新提交 | b233d973，2026-08-20 |
| main 相对 RC tag | 18 个后续提交 |
| GitHub stars / forks | 17 / 5；属于曝光指标，不能等同安装用户 |
| GitHub Releases | 未发现正式 Release 条目 |
| 近 7 天下载 | 28；2026-10-02 至 2026-10-08 |
| 近 30 天下载 | 77；2026-09-09 至 2026-10-08 |
| 首次发布以来累计下载 | 1,002；2026-04-03 至 2026-10-08 |

官方 npm 元数据：https://registry.npmjs.org/agentdown
公开包页面：https://www.npmjs.com/package/agentdown
主线相对 RC：https://github.com/codexiaoke/agentdown/compare/v0.1.0-rc.1...main

RC 发布任务的安装、浏览器安装、release:check 均成功，失败步骤为 Publish with npm trusted publishing。进一步失败日志所在下载域名受网络限制，因此目前不能确定是 Trusted Publisher 配置、授权或其他发布错误。
任务：https://github.com/codexiaoke/agentdown/actions/runs/31558211246

0.0.5 的 npm exports 只有根入口与 style.css；当前源码和文档新增的 ag-ui/a2ui/ag-ui-a2ui 子入口尚未随这版交付。这是新用户按当前文档接入的明确风险。

## 同类项目
| 项目 | 已核实定位与能力 | 对 Agentdown 的意义 |
|---|---|---|
| Markstream / markstream-vue 2.0.16 | Vue 流式 Markdown，未完成内容处理、虚拟化、代码/diff、Mermaid、KaTeX、滚动状态 | 相邻的内容渲染层；完整 Agent 交互流程的比较应重点看 assistant-ui/CopilotKit，内容性能另做同机基准 |
| Ant Design X Vue / ant-design-x-vue 1.6.0 | Bubble、Sender、Attachments、Conversations、ThoughtChain、useXAgent/useXChat/XStream | 聊天视觉与数据组件替代方案，也适合作为 Agentdown Runtime 的 UI 合作对象 |
| Element Plus X / vue-element-plus-x 2.0.3 | Element Plus 生态，BubbleList 虚拟滚动、追底、未读、分页、混合节点；Markdown 拆为 x-markdown-vue | 对现有业务应用吸引力强；可提供 Runtime + 原有组件库的接入例子 |
| assistant-ui | 聊天运行时、可组合 UI、工具与审批、线程、持久化/恢复；@assistant-ui/vue 0.0.2 已于 10-09 发布 | 完整前端竞争者；React 的 AG-UI/A2UI 能力不能直接等同 Vue 已完全具备 |
| CopilotKit | AG-UI、shared state、工具、HITL、A2UI；@copilotkit/vue 1.78.0 已发布并有 Vue composables/A2UI renderer | 完整竞争者；“支持 Vue”本身已经不足以差异化 |
| AI SDK / @ai-sdk/vue 4.0.137 | 模型、工具与会话 transport；Vue 已有工具审批和 resumeStream，恢复需宿主提供存储和服务端端点 | 可集成的生态入口，也可构成间接替代；评估 UIMessage stream 适配价值 |
| AI Elements / Streamdown | 前者为 React UI 组件与安装 registry；后者为 React 流式 Markdown | 属于不同层的组合方案，可学习组件体验、内容插件和开发者上手路径 |

以上四个 Vue UI/渲染项目与 assistant-ui/CopilotKit 为 MIT；Vercel AI SDK、AI Elements、Streamdown 为 Apache-2.0。版本仅作本次核验快照。

官方来源：
- https://github.com/Simon-He95/markstream-vue
- https://registry.npmjs.org/markstream-vue/2.0.16
- https://github.com/wzc520pyfm/ant-design-x-vue
- https://github.com/element-plus-x/Element-Plus-X
- https://github.com/element-plus-x/x-markdown
- https://github.com/assistant-ui/assistant-ui/blob/main/packages/vue/README.md
- https://github.com/assistant-ui/assistant-ui/blob/main/packages/react-ag-ui/README.md
- https://github.com/CopilotKit/CopilotKit/blob/main/packages/vue/README.md
- https://github.com/CopilotKit/CopilotKit/blob/main/packages/vue/PARITY.md
- https://github.com/vercel/ai/blob/main/packages/vue/src/use-chat.ts
- https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/03-chatbot-resume-streams.mdx
- https://github.com/vercel/ai-elements
- https://github.com/vercel/streamdown

## 建议的更新顺序
### 第一轮：恢复发布和接入闭环
1. 诊断并修复 npm 发布失败。当前 main 已超过旧 RC tag，应计划包含后续修复的新 RC，在 next 上验证；稳定后再更新 latest。
2. 对齐 npm 包、README、快速开始、框架文档与 CHANGELOG。统一 useAgentChat 和各 use*ChatSession 的推荐场景。
3. 验证真正最小安装。源码根入口静态导出 useAgentChat 并引入 AG-UI/A2UI 组合层，构建文件存在 optional peers 的外部 import；当前消费者验证链接全部工作区依赖，可能掩盖依赖边界问题。这是静态证据，本次未在独立安装中复现故障。
4. 建立不链接开发工作区的 tarball 消费者：核心、AG-UI、A2UI、组合入口分别只安装声明依赖。

验收：空项目按文档安装已发布版本；dist-tag、来源证明、导出、类型、文档示例一致；最小入口无需无关框架依赖。

### 第二轮：完善真实 Agent 交互
1. 提供一条可复制 starter：普通文本 → 工具卡片 → 审批/拒绝 → 断线/刷新恢复，目标让首次用户 30 分钟完成接入。
2. 优先处理 #5：用户使用 AgentScope，发送 stepStart 后看不到界面变化。标准 STEP_STARTED/STEP_FINISHED 已映射到 runtime node，但 RunSurface 主要渲染 blocks；应补可选执行进度，并明确协议事件大小写和展示契约。
3. 建立 AG-UI/A2UI 版本矩阵并评估新协议。当前 Agentdown @ag-ui/core peer 为 ^0.0.57，CopilotKit 已用 1.0.2；版本差异提示兼容性验证需求，并不直接证明已有故障。
4. 以录制事件验证工具参数流、待审批、重复事件、游标恢复、A2UI/action 与 artifact 的一致性。服务端授权和业务幂等仍由宿主承担。

来源：
- https://github.com/codexiaoke/agentdown/issues/5
- https://github.com/codexiaoke/agentdown/issues/6
- src/adapters/agui/protocol.ts 的 STEP 处理
- src/components/RunSurface.vue 的 blocks 渲染
- src/composables/useAgentChat.ts 的组合入口静态 import
- scripts/test-package-consumer.mjs 的依赖链接逻辑

### 第三轮：扩大可用性和生态
1. 增加集中 locale/messages，统一工具、输入、附件、预览等文案；完善英文 starter。
2. 增加 Nuxt/SSR/hydration 示例，并验证浏览器布局与安全边界。已有部分 SSR 防护，不能据此说完全不支持 SSR。
3. 提供 Ant Design X Vue / Element Plus X 的 Runtime 接入示例，评估 AI SDK UIMessage stream 适配。
4. 将浏览器 benchmark 跨平台化并公开结果：当前 Chrome 路径写死 macOS。对照同一机器、内容和流节奏，测首屏、帧间隔、长任务、内存、DOM、滚动漂移和 bundle，给 CI 设置预算。
5. 将 Markdown/重型内容的安装与导出边界拆清，评估 Mermaid、KaTeX 等可选安装路径。

用户已明确下一代支持多个前端框架；核心和绑定扩展契约需从首轮按此设计。建议首批交付 Vue 与 React，再接 Angular、Svelte 等。#16 是 Angular 需求的一条公开反馈；完整 Surface/composables/安全/布局行为仍需各框架验证。
https://github.com/codexiaoke/agentdown/issues/16

## 如何验证增长
先记录周/月下载、发布前后变化、完成接入案例、首次接入耗时和重复出现的问题。npm 下载包含 CI、重复安装和自动化，不等同独立开发者或生产部署。用真实项目反馈判断留存和需求；不建议为此默认加入包内遥测。

## npm 下载统计
当前官方统计接口已可访问。2026-10-10 查询的 last-week / last-month 均以 2026-10-08 为窗口结束日；逐日数据与这两个接口的总数交叉核对一致。

| 月份 | 下载次数 |
|---|---:|
| 2026-04（自 04-03 首次发布） | 649 |
| 2026-05 | 49 |
| 2026-06 | 80 |
| 2026-07 | 51 |
| 2026-08 | 91 |
| 2026-09 | 49 |
| 2026-10（至 10-08） | 33 |
| 累计（04-03 至 10-08） | 1,002 |

近 7 天为 28，近 30 天为 77。发布当月占期间累计约 65%；此后完整月份为 49–91 次。4 月的高峰日期与版本发布日期重合，但不能仅凭这些统计区分真实用户、CI、重复安装或自动化。后续应结合接入案例和流程完成情况判断增长。

官方来源：
- https://api.npmjs.org/downloads/point/last-week/agentdown
- https://api.npmjs.org/downloads/point/last-month/agentdown
- https://api.npmjs.org/downloads/range/2026-04-03:2026-10-08/agentdown

原始逐日数据与汇总：[npm 下载数据](npm-downloads-2026-10-10.json)。

本次没有修改仓库代码、发布 npm 版本或发送 GitHub 评论。

## 下一代跨前端框架架构（设计建议，尚未实施）
允许破坏性更新；核心模型、公共 API、导出和组件指令可以重新设计。既有状态、安全边界和恢复行为要通过新契约保留，存档提供明确的格式版本和转换方案。

两条独立扩展轴：后端协议适配器负责事件与操作转换；前端框架绑定负责订阅与呈现。新增 React 只实现绑定和组件，新增后端只实现协议适配器。

| 逻辑包 | 职责 |
|---|---|
| core | 纯 TypeScript Session、会话/执行/消息/工具/交互/产物状态，订阅、操作协调、恢复与回放；不依赖 Vue、React 或 DOM |
| protocol adapters | 原生后端事件转领域事件，统一操作转框架请求；保留原生语义与能力声明 |
| content | 流式内容解析、稳定 block 数据、布局元数据；组件只保存 rendererId 和可序列化 props |
| Vue binding/UI | refs、composables、上下文、Vue 组件及生命周期 |
| React binding/UI | hooks、context、稳定快照订阅、React 组件及生命周期 |
| 可选浏览器/A2UI 服务 | 浏览器测量与渲染服务；A2UI 协议/Surface/数据绑定共享，组件 Catalog 分框架实现 |

组件注册分开：共享 name/description/propsSchema，Vue 注册 Vue 实现，React 注册 React 实现。业务组件实现可以不同，Agent 能力描述、数据和动作语义保持一致。核心状态和 transcript 不持有组件实例、refs、VNode 或 JSX。

当前需要实际拆解的耦合点：
- src/adapters/shared/chatFactory.ts 直接依赖 Vue 响应式和 .vue 组件；现有会话行为需抽成独立 controller，而非复制两套。
- src/core/types.ts 混合 MarkdownBlock 与 Vue Component 注册类型；parseMarkdown 仅为 minHeight 读取整个注册表，可改成中立布局描述。
- A2UI processor/controller 具有可共享主体，但 catalog 混合协议 Catalog、markRaw 和 Vue renderer；应拆协议与呈现。
- integrations/agui-a2ui/protocol.ts 从包含 Vue 导出的 a2ui barrel 取常量；必须验收包依赖图和声明文件。
- runtime.snapshot 每次创建新对象；React 订阅需缓存按 revision 稳定的快照。
- DOM/Canvas 测量属于可选浏览器服务。SSR/hydration、React StrictMode、观察器清理和异步渲染取消需单独验收。

前端 API 概念保持一致：createAgentSession 提供核心，框架 binding 提供原生状态读取和生命周期；完整工作区与可组合组件都消费同一 Session。核心区分执行、连接、操作投递、人工决策状态，并区分 reconnect、retryOperation、regenerate、disconnect、cancelRun。

首批双框架验收使用相同后端和事件 fixture：请求→步骤/工具→审批→断线→刷新→续接→产物。比较稳定身份、状态、操作回传、恢复游标与最终结果；回放不发业务操作。A2UI 控件另验证表单草稿、更新、焦点和安全策略。后端不支持的取消/恢复等能力明确声明。

逻辑包名称仅为架构示意，npm 包名、版本和实际发布范围尚未决定。
