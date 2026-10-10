# Agentdown 下一代 Headless Core 契约草案

日期：2026-10-10。状态：核心建模与行为详解，尚未实施。统一公共 API 以 [主设计](design.md) 为准；本稿说明领域建模与内部行为，公共 API 以主设计为准。

目标：以同一套无 UI 框架依赖的 Session，连接请求、多个 Agent 执行、流式内容、工具、人工决策、结果、恢复和回放。Vue、React 等绑定复用这个流程，而不是各自实现业务状态。

## 1. 不可违反的边界

1. Core 的运行时与公开声明均不得依赖 Vue、React、Component、ReactNode、DOM 元素、Provider、ref 或 hook。
2. Core 不调用模型、不编排后端 Agent、不执行后端工具、不存储业务数据库，不把浏览器状态当作权威会话。
3. Core 不规定宿主一定采用 AG-UI、Agentdown 专属 HTTP 路径、SSE 或某一种数据库。Adapter 和宿主 ports 接入实际契约。
4. Core 不包含可执行 UI 描述。动态组件与 Surface 的公开数据必须是受限 JSON；实际前端实现只存在于各 UI 绑定的注册表。
5. 连接结束、请求回调返回、审批按钮点击均不等于业务执行完成。业务终态来自有明确语义的后端事件或权威恢复数据。
6. 网络断开只改变连接状态。只有后端确认取消，才能把 run 标为 cancelled。
7. 相同操作的重试保留身份与业务请求；重新生成是新的执行尝试。恢复和回放不重新提交 prompt、审批或组件动作。
8. Core 处理多 run、多 pending interaction。不得用单个 activeRunId 或单个 awaitingHumanInput 布尔量作为真相模型。
9. 同一事件和命令录制应得到同一业务模型。时间、ID、调度器从执行边界注入，不能由 reducer 自行读取随机数或当前时间。
10. 保留默认 HTML 净化、组件 allowlist、URL 策略及资源上限。跨 UI 不得出现不同的默认信任边界。

## 2. 术语和身份

```text
Conversation
  └─ Turn（一次用户输入及关联的继续过程）
       └─ Execution（该 Turn 的一次逻辑执行尝试）
            ├─ Run A（后端原生执行单元）
            ├─ Run B（并行子 Agent / 子流程）
            └─ Run C（审批后续跑产生的新后端执行片段）
```

- `conversationId`：宿主的会话身份。
- `turnId`：一次用户输入；重新生成仍关联原 turn，避免 UI 错当成新问题。
- `executionId`：一次逻辑执行尝试；重新生成产生新 execution。
- `runId`：一个后端执行单元；并发 run 各有身份，可关联 parentRunId。人工决策后的继续可能沿用 run，也可能产生新的 run，由 adapter 保留后端事实。
- `messageId`：逻辑消息。流式更新保持同一身份；它不是 DOM key 临时编号。
- `partId`：消息内一个内容部分，流式追加时保持身份。
- `stepId / toolCallId / interactionId / artifactId / surfaceId`：各领域实体的稳定身份。
- `operationId`：客户端一次业务变更意图的幂等身份，不与 runId 混用。
- `streamId + epoch + eventId/cursor`：事件投递身份，不能与业务实体身份混用。

所有 ID 在单个 Conversation 内稳定；可由宿主提供，也可由 adapter/Core 分配，但分配规则必须确定。原生 ID 可保存在 adapter-owned reference 中。UI 不判断这些 reference 的字段。

Adapter 不得为了适配模型伪造后端成功或取消。原生流省略开始事件时，可以确定地补一个标为 inferred 的实体声明，并提供诊断；不能补业务终态。

## 3. 数据约束与实体

以下 TypeScript 是契约示意，尚非实现。

```ts
type EntityId = string;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type AdapterReference = { adapter: string; version: string; data: JsonObject };

type RunPhase = 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
type PartPhase = 'streaming' | 'complete' | 'failed' | 'aborted';

interface Conversation {
  id: EntityId;
  turnIds: readonly EntityId[];
  metadata: JsonObject;
}

interface Turn {
  id: EntityId;
  conversationId: EntityId;
  inputMessageId: EntityId;
  executionIds: readonly EntityId[];
}

interface Execution {
  id: EntityId;
  conversationId: EntityId;
  turnId: EntityId;
  originOperationId?: EntityId;
  previousExecutionId?: EntityId;
  runIds: readonly EntityId[];
  // 后端明确提供聚合终态时记录；否则由 selector 返回未知/进行中，而非猜成功。
  authoritativeOutcome?: 'completed' | 'failed' | 'cancelled';
}

interface Run {
  id: EntityId;
  executionId: EntityId;
  parentRunId?: EntityId;
  phase: RunPhase;
  title?: string;
  nativeRef?: AdapterReference;
  pendingInteractionIds: readonly EntityId[];
  error?: DomainError;
}

interface Message {
  id: EntityId;
  turnId: EntityId;
  executionId?: EntityId;
  runId?: EntityId;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'extension';
  partIds: readonly EntityId[];
  state: 'streaming' | 'complete' | 'failed' | 'aborted';
}

interface Step {
  id: EntityId;
  runId: EntityId;
  parentStepId?: EntityId;
  title: string;
  phase: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

interface ToolCall {
  id: EntityId;
  runId: EntityId;
  messageId?: EntityId;
  name: string;
  arguments: JsonValue | { partialJson: string };
  result?: JsonValue;
  phase: 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
  error?: DomainError;
}

interface DomainError {
  code: string;
  message?: string;
  details?: JsonObject;
}
```

`metadata`、错误和状态 code 是业务数据，默认 UI 文案由 locale/formatter 产生；Core 不内置中文或英文产品提示。

所有公开 snapshot 数据均为 JSON-compatible、只读数据。不得包含 Date、Map、Set、函数、组件、DOM、File、Response、AbortController 或官方 SDK 的 mutable model 实例。内部可以用高效集合，订阅契约不能把内部可变引用暴露给 UI。

### 3.1 消息内容

```ts
type ContentPart = {
  id: EntityId;
  messageId: EntityId;
  phase: PartPhase;
  revision: number;
} & (
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; source: string }
  | { kind: 'code'; source: string; language?: string }
  | { kind: 'math'; source: string; display: boolean }
  | { kind: 'diagram'; format: string; source: string }
  | { kind: 'image'; uri: string; alt?: string }
  | { kind: 'component'; capabilityId: string; name: string; props: JsonObject }
  | { kind: 'surface'; surfaceId: EntityId }
  | { kind: 'artifact-ref'; artifactId: EntityId }
  | { kind: 'extension'; namespace: string; value: JsonValue }
);
```

纯 Core 保存原始内容与语义；Markdown 扩展可以提供增量 AST / 稳定 block 投影。DOM 布局结果、实际元素高度和 pretext 缓存不进入权威 Session 模型。

原始 HTML 如需支持，应是显式可选内容扩展，始终带 untrusted 来源，不能让后端 packet 自行声明 trusted/generated。由库自身安全解析产生的 HTML 信任标记不与外部输入混用。

### 3.2 多个人工交互及原子批次

```ts
interface Interaction {
  id: EntityId;
  executionId: EntityId;
  runId?: EntityId;
  toolCallId?: EntityId;
  kind: 'approval' | 'handoff' | 'input' | 'form' | 'extension';
  revision: number;
  prompt: JsonValue;
  responseSchema: JsonObject;
  allowedDecisions: readonly DecisionCapability[];
  // all-required 请求以一个 Interaction 表达原子提交单位。
  items?: readonly { id: string; prompt: JsonValue; schema: JsonObject }[];
  state: 'pending' | 'submitting' | 'awaitingConfirmation' | 'resolved' | 'expired' | 'failed';
  operationId?: EntityId;
  authoritativeResolution?: JsonValue;
  nativeRef?: AdapterReference;
}

interface DecisionCapability {
  action: string;
  payloadSchema?: JsonObject;
}
```

同一 Run 可以有多个 Interaction，其他 Run 仍能产出内容。All-required 批次的逐项选择保存在 UI 草稿中，收齐后一次 respond 冻结完整 payload；选择第一项不提交，也不自动批准其他项。单项和整批均使用同一个 respond API。

本地提交和后端确认分开：只有明确确认或权威恢复结果才能成为 resolved。拒绝工具不必导致执行失败，后端可以改计划继续。过期请求、目标 revision 冲突和无权限请求必须由后端再次校验。

### 3.3 受控组件、生成式 Surface 与 Artifact

```ts
interface ComponentCapability {
  id: string;
  name: string;
  description: string;
  propsSchema: JsonObject;
  actions: readonly DecisionCapability[];
}

interface UiSurface {
  id: EntityId;
  ownerMessageId: EntityId;
  protocol: { family: string; version: string };
  catalogIds: readonly string[];
  revision: number;
  state: 'active' | 'deleted' | 'invalid';
  // 可选协议扩展拥有的 JSON 状态；不暴露官方 SDK model/signal。
  model: JsonValue;
}

interface Artifact {
  id: EntityId;
  executionId: EntityId;
  runId?: EntityId;
  kind: string;
  title?: string;
  revision: number;
  state: 'building' | 'ready' | 'failed' | 'removed';
  content?: JsonValue;
  resource?: { uri: string; mime?: string; filename?: string; size?: number };
  error?: DomainError;
}
```

- ComponentCapability 只描述 schema、名字和动作。Vue Component / React implementation 由各 UI 包本地登记，不发送给 Agent，也不存进 checkpoint。
- 能力协商取宿主策略和已安装 UI renderer 支持项的交集；不能宣称一个实际无法呈现的 Catalog。
- A2UI 是 `UiSurface` 的一个可选扩展：schema 校验、增量 Surface/data model、客户端 action envelope 和 delivery 状态可以共享；实际 basic components、focus、portal、DOM 归 UI 绑定。
- A2UI 官方 `SurfaceModel`/signals 保持为扩展内部对象，其变化通过 Core 事务提交可订阅 JSON snapshot。
- `openUrl`、剪贴板、下载、音频播放等浏览器副作用通过显式 UI/host executor，不作为协议 JSON 可任意调用的函数。
- Artifact 元数据及版本可共享；网络加载、下载和 preview DOM 不属于 reducer。

## 4. Canonical Event 契约

Adapter 把原生事件映射成小而类型明确的领域事件。领域事件不是要求后端改用的线协议。

```ts
interface EventEnvelope<TEvent = AgentEvent> {
  type: 'agentdown.event/v2';
  conversationId: EntityId;
  source: { adapter: string; version: string; streamId: string; epoch: string };
  delivery?: { eventId?: string; cursor?: string; sequence?: number };
  occurredAt?: number;  // 来源时间
  observedAt: number;   // 执行边界注入，回放复用录制值
  event: TEvent;
}

type AgentEvent =
  | { type: 'turn.declared'; turn: Turn }
  | { type: 'execution.declared'; execution: Execution }
  | { type: 'execution.outcome'; executionId: EntityId; outcome: 'completed' | 'failed' | 'cancelled' }
  | { type: 'run.declared'; run: Run }
  | { type: 'run.phase'; runId: EntityId; phase: RunPhase; error?: DomainError }
  | { type: 'message.declared'; message: Message }
  | { type: 'message.completed'; messageId: EntityId }
  | { type: 'part.declared'; part: ContentPart }
  | { type: 'part.delta'; partId: EntityId; delta: string }
  | { type: 'part.replaced'; part: ContentPart }
  | { type: 'part.phase'; partId: EntityId; phase: PartPhase }
  | { type: 'step.declared'; step: Step }
  | { type: 'step.phase'; stepId: EntityId; phase: Step['phase'] }
  | { type: 'tool.declared'; tool: ToolCall }
  | { type: 'tool.arguments'; toolCallId: EntityId; value: ToolCall['arguments'] }
  | { type: 'tool.result'; toolCallId: EntityId; result: JsonValue }
  | { type: 'tool.phase'; toolCallId: EntityId; phase: ToolCall['phase']; error?: DomainError }
  | { type: 'interaction.declared'; interaction: Interaction }
  | { type: 'interaction.resolved'; interactionId: EntityId; resolution: JsonValue }
  | { type: 'interaction.expired'; interactionId: EntityId }
  | { type: 'artifact.upsert'; artifact: Artifact }
  | { type: 'surface.upsert'; surface: UiSurface }
  | { type: 'operation.accepted'; operationId: EntityId; runIds?: readonly EntityId[] }
  | { type: 'operation.rejected'; operationId: EntityId; error: DomainError }
  | { type: 'extension'; namespace: string; payload: JsonValue };
```

以上为最小族，详细字段可在实施前按 fixture 收紧；不是把任意 RuntimeCommand 或 JSON patch 向用户永久公开。

事件规则：

- 同一消息可以同时交错收到文本、工具、artifact、Surface 更新；消息 display order 由稳定 identity/order 信息决定，不由组件 mount 顺序决定。
- 每条状态转换均检查目标存在、身份作用域、合法前置状态。Adapter 负责把不完整原生流规范化为可归约输入。
- 消费顺序来自 stream 约定。Core 不把 opaque cursor 当作数字或做字符串排序；可比较游标/sequence 的实现由 adapter 明确提供。
- 相同逻辑流内的稳定 `(streamId, eventId)` 不重复应用；物理连接 epoch 只过滤过期连接，不参与跨重连去重。若提供可比较单调 cursor，可安全拒绝已提交范围；否则 dedup 的边界由协商能力说明。
- 一个 normalized batch 原子校验、归约、提交 snapshot，然后才确认 cursor。失败不得把未应用事件的 cursor 推进。
- 未知 Core event type 是协议错误；已注册 namespaced extension 交给扩展。未知 extension 可保留受限诊断，不据此改 run 终态。
- EOF 与观察连接取消属于 ConnectionEvent，不变成 run.completed/run.cancelled。

## 5. 用户 Action 与操作一致性

对外 Action 使用主设计的 send、respond、regenerate、cancelExecution、disconnect、resume、retryOperation、surfaceAction 和 updateAgentState。网络观察控制由 coordinator 处理，不另公开一套 observeRun/stop API。

```ts
interface Operation {
  id: EntityId;
  conversationId: EntityId;
  action: BusinessAction; // retryOperation 沿用原业务动作
  targetRevision?: number;
  delivery: 'queued' | 'sending' | 'delivered' | 'uncertain' | 'failed';
  acceptance: 'unknown' | 'accepted' | 'rejected';
  attempts: readonly DeliveryAttempt[];
  relatedRunIds: readonly EntityId[];
  requestFingerprint?: string;
}
interface DeliveryAttempt {
  attemptId: string;
  status: 'queued' | 'sending' | 'delivered' | 'uncertain' | 'failed';
  error?: DomainError;
}
```

BusinessAction 表示要送给后端的业务意图；retryOperation 是客户端协调指令，不作为第二个业务意图发送。

- 操作建立、身份分配和 pending 状态属于一个本地事务，随后 executor 发请求。
- 每次投递有新 attemptId。重投保留 operationId、目标、冻结业务 payload 和 fingerprint；原 delivery Promise 不随新尝试改写。
- delivered 表示 adapter 声明的投递边界成功。后端接受/拒绝通过 operation 确认表达，业务结果通过 Run/Execution/Interaction 表达。
- 同一 Interaction 的重复点击复用未完成操作。未确认的决定不能被另一决定静默覆盖。
- 冲突按 conversation、execution、interaction 或 surface 目标调度，独立 Run 仍可观察。
- 请求认证和恢复游标可以更新，业务载荷不能在重投时读取新的输入框或选项。
- 响应丢失时为 uncertain。需要后端幂等或结果查询，才能安全重投；最终确认后的操作不再重投。
- 原生流没有 operation ACK 时不能捏造 acceptance；HTTP 成功也不等于审批已批准。
- 延迟效果绑定 session identity 和 connection epoch；旧响应不污染新会话。

文件上传由宿主完成，core 接收可序列化资源引用。复制、滚动、焦点、预览等本地动作不自动进入 Agent 业务操作。

## 6. Snapshot、选择器与 Headless Session

```ts
interface AgentSession {
  readonly conversationId: string;
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(action: AgentAction): OperationHandle;
  exportSnapshot(): SessionArchive;
  dispose(): void;
}
interface OperationHandle {
  readonly operationId: string;
  readonly attemptId: string;
  readonly delivery: Promise<DeliveryOutcome>;
}
```

AgentAction、DeliveryOutcome、创建参数和错误 code 与主设计保持一致。SessionSnapshot 包含 revision、conversation、Turn/Execution/Run/messages/parts/steps/tools/interactions/artifacts/surfaces/operations 的按 id 只读集合，以及连接和能力状态。它不包含 InteractionBatch 第二模型，也没有单一 activeRun 作为真相。

- create、getSnapshot、subscribe 无网络副作用。
- dispatch 同步返回 handle；预期校验错误以 failed delivery Result 表达，不抛出业务异常。没有网络请求时同样可以定位失败原因。
- delivery 是当前投递尝试的 fulfilled Result，不等待整个业务结束。后端 acceptance 与结果继续由事件更新快照。
- dispose 幂等。未发出的尝试结束为 disposed 失败；已发出但不可确认的尝试结束为 uncertain。它释放本地资源，不发送后端取消。
- snapshot 在 revision 不变时保持同一引用；已提交事件事务完成后通知订阅者。未变化实体保持引用稳定。
- listener 错误隔离，unsubscribe 幂等；Vue 与 React 只负责订阅及生命周期。
- replay 模式的导入和读取不发业务操作；恢复和实际 live resume 明确分开。
- 同一 Session 的所有者负责 dispose，借用者退出只 unsubscribe。

纯 selector 提供 pending interactions、执行进度和 action availability。默认 UI 的 AgentViewSnapshot 由共享纯投影生成，提供有序 messages、canSend 等便利字段；该视图不是第二份可写状态。

创建与使用：

```ts
const session = createAgentSession({ conversationId, adapter, initialSnapshot: archive, mode: 'live' });
const handle = session.dispatch({ type: 'send', input: { text: '规划旅行' } });
const delivery = await handle.delivery;
// delivery 只表示当前投递，通过快照追踪 acceptance 和业务结果。
session.dispatch({ type: 'resume', executionId });
session.dispatch({ type: 'respond', interactionId, response: { kind: 'approval', decision: 'approve' } });
session.dispatch({ type: 'retryOperation', operationId: handle.operationId });
session.dispatch({ type: 'cancelExecution', executionId });
session.dispose();
```

生产恢复应先对账未确定操作，再发新输入；上例仅并列展示公共动作形状，不代表所有动作依次无条件可用。

## 7. Adapter、Transport、Ports、能力

公共 AgentAdapter 与主设计一致，提供 capabilities、execute、events。Adapter 内部可以继续拆分纯 decode/encode、Transport 与宿主 ports；普通使用者不必分别创建它们。

- Transport 拥有 fetch、ReadableStream、WebSocket 和取消机制，不猜测业务状态。
- Coordinator 冻结操作、调度投递与事件观察，向 reducer 提交完整事务。
- Reducer 不访问网络、DOM、时间或随机数；执行边界注入这些值。
- Content/Surface 扩展注册受限、版本化解释器与投影，不随意修改其他领域记录。
- Host ports 提供凭据、历史、操作查询与实际后端能力；凭据不进入 snapshot。

POST SSE 只能发起一次任务请求：execute 在握手后尽快返回 receipt 与流订阅描述，events 消费同一响应，交接时缓冲事件。远端身份到达后映射到已分配的本地执行身份。每 Session 的连接状态由 context 管理，无凭据静态 adapter 配置可以复用。

能力明确区分并行 Run 的显示/观察和新用户输入的提交并发。还包括人工交互类型、批量模式、服务端取消、操作幂等、操作查询、历史、进行中续接、游标排序、Catalog 与 Surface 版本。安装一个 adapter 不表示后端已经提供这些能力；未知可选能力关闭，基础 send 保守地允许一个新执行。

纯 selectActionAvailability 再结合目标状态、未确认操作和权限投影提供 allowed/unsupported/conflict/expired 等结果。后端仍负责最终授权。

## 8. 恢复、Checkpoint 与操作对账

SessionArchive 按主设计版本化保存领域记录、稳定身份、操作 payload 与 attempts、逻辑流游标、去重信息和适配器版本。初始存档先校验并在隔离模型中恢复，再成为 createAgentSession 的 initialSnapshot；创建不会自动连接。

1. 宿主读取经过授权的归档、checkpoint 与 tail，或提供权威状态快照。
2. 纯恢复逻辑验证 schemaVersion、会话身份和适配器版本，在隔离模型中重建；UI 不看到半份归档。
3. 对账未确定操作：已接受操作只观察，未知结果维持 uncertain。不能直接用新请求重跑。
4. 恢复所有 pending Interaction，保留原身份；不自动批准或重发上次点击。
5. live Session 通过显式 resume action 续接指定 Execution 的相关 Run。适配器映射各流身份与游标。
6. 补发走同一事件校验、归并和去重逻辑。完成事务后推进游标，持久化状态和边界属于同一版本。

streamId 标识逻辑流，重连保持稳定；physical epoch 过滤旧连接回调。事件 id 的唯一性作用域、cursor 含当前事件还是下一事件、排序及 replay horizon 由 adapter 声明。去重淘汰依赖可证明的 checkpoint/replay horizon，不能任意截断后仍承诺完整去重。

replay Session 使用同一存档产生被动视图，无网络和审批/Surface action 副作用。客户端归档可回放不代表后端执行仍可续跑，不能用本地存档覆盖权威业务事实。

明确报告：事件保留期已过、checkpoint 与 tail 不匹配、适配器版本不兼容、无可观察运行身份、某个并行 Run 恢复失败。局部恢复失败不偷偷改变其他 Run 终态。

旧格式通过独立迁移转换器导入；无法可靠映射的记录和进行中执行给出诊断。继续运行必须由后端确认可恢复。

## 9. UI 投影与 SSR

共同投影是稳定 ID 的 JSON 描述，不是统一虚拟 DOM，不包含组件 constructor。Vue 与 React 各自处理 element refs、effect 挂卸载、portal/teleport、focus trap、键盘行为和事件绑定。

```text
native packet → adapter → Headless Session → shared projection
                                            ↙             ↘
                                         Vue UI         React UI
                                            ↘             ↙
                                              AgentAction
                                                  ↓
                                      coordinator → adapter → host
```

- step/progress、工具与多个交互必须在共同投影中可用，不以是否有聊天 message block 决定它是否可见。
- Core 可在无 window/document/Canvas 的 Node 环境导入、归约和恢复。公开 .d.ts 也不需要安装 Vue/React。
- SSR 创建 request-local session，读取归档/初始模型；绑定首屏使用相同 bootstrap snapshot，渲染过程不 dispatch。
- DOM 安全默认相同：未信任原始 HTML在 SSR/首次 hydration fail closed，或由宿主提供同策略 server sanitizer。不能为 SSR 禁用净化。
- 文字测量、pretext、Mermaid DOM、virtualization observers、滚动、文件预览在 client mount 后启动；服务器先渲染可访问语义内容。
- 主题 token、CSS变量转换、窗口范围算法、URL策略可以共享；页面 DOM 与生命周期不强行抽象成跨框架组件引擎。
- React Strict Mode 的重挂载不能产生重复业务 Operation；session owner 与 subscription lifecycle 分离。

## 10. 发布结构与范围

建议先确定源码边界：`core`、`adapters`、可选 `markdown/a2ui`、`dom`、`vue`、`react`。npm 包名及是否合并几个小扩展，留给实施设计；需要确保消费者不会因为导入 Core 而安装/加载 Vue、React、A2UI、Mermaid 或 Canvas 依赖。

首批目标是 Vue 和 React 使用同一核心并完成整个流程，其他 UI 框架按稳定绑定契约扩展。不是先承诺所有框架，然后分别复制现有 Vue helper。

允许破坏原 API：收敛多种 use*ChatSession 为一个结果契约，重命名含混 interrupt/resume/retry，把 RuntimeCommand 降为内部/高级接口，拆分组件 registry。存档仍需明确 v1→v2 转换，不把重写视为允许丢失已保存会话。

## 11. 必须通过的行为验收

1. 无 Vue/React/DOM 的 Node 消费者能安装/导入 Core，并用录制事件完成归约、恢复、只读回放。
2. 事件交错：两个并行 run 同时文本/工具更新，其中一个等待两项批量审批，另一个继续产出 artifact；pending 交互不丢失，ID 与显示顺序稳定。
3. 批量决策：先选一项不提交；收齐后一次提交；重复点击/同操作重试沿用 operationId；网络错误不伪装成审批成功。
4. 请求响应丢失：状态 uncertain；后端 operation lookup 或幂等能力完成对账；没有相应能力时不自动产生第二个执行。
5. 断观察与取消：disconnect 之后后端仍可运行；cancelExecution 在后端确认前不显示 cancelled。
6. 多流恢复：刷新后按各 run/cursor 只读续接；补发相同事件不重复 text/tool/artifact；坏事件不推进 cursor。
7. 同 turn 重新生成创建新 execution 并保留原执行结果关联；retryOperation 沿用原请求。
8. 受控组件：相同 capability schema 在 Vue/React 有各自本地实现；未知组件、非法 props、未知动作安全降级，原始执行事实仍可诊断。
9. A2UI：incremental model 与 action delivery/business execution 区分；重放 Surface 不发送 action；Vue/React使用同一协议 fixture。
10. Artifact 更新：building→ready/failed、版本更新与 message reference 一致；资源取回由 host/UI，Core 不自行 fetch。
11. SSR/hydration：两 UI 绑定首屏语义一致；无服务器 Canvas 要求；净化策略不因 SSR 改变；订阅销毁、React重复挂载不重复发送。
12. 单元 fixture 与两 UI 流程验收使用相同 action/event 序列，最终领域 snapshot及编码请求一致。允许视觉样式不同，不允许业务状态不同。
13. 容量与隔离：节点、内容、历史、诊断与 Surface 上限可控；listener/renderer 失败隔离；Session A 的延迟响应不能写到 Session B。

## 12. 原仓库证据

- `src/runtime/createAgentRuntime.ts`、`createBridge.ts`：运行态/桥已有可复用基础，存在计时/调度，应分离执行边界。
- `src/runtime/definePreset.ts:3-4`、`defineAdapter.ts:1`：Core工厂公开类型带 Surface与主题耦合。
- `src/core/types.ts:2,328,428`、`parseMarkdown.ts:39`：纯 Markdown数据与 Vue组件注册表同文件，解析器读取布局高度。
- `src/adapters/shared/chatFactory.ts:1,12,1414,1580`：Vue session业务状态、loading组件依赖、retry/regenerate共用send。
- `src/adapters/agno/chat.ts`、`langchain/chat.ts`、`autogen/chat.ts`：各框架自行协调审批/继续与修改呈现block，应保留协议语义、统一操作事务。
- `src/a2ui/catalog.ts:6-8`、`processor.ts:18-22`、`surfaceController.ts`：协议能力和 Vue renderer混合；processor/controller逻辑可以分离共享。
- `src/integrations/agui-a2ui/components.ts`：组件schema与Vue implementation同一声明，应拆能力描述与本地renderer。
- `src/security/sanitizeHtml.ts:42`、`components/HtmlBlock.vue`：SSR/首次mount净化边界需保持。
- `src/components/PretextTextBlock.vue:46-57`、pretext `measurement.js`：prepare先于width判断且要求Canvas；现有纯文本fallback不能视为Node SSR已验证。
- `src/adapters/agui/protocol.ts:352`、`components/RunSurface.vue:290`：STEP写node但Surface基于blocks；领域状态和聊天投影需分开。

本轮只读源码并编写仓库外设计文档；未实现、不运行新测试，也不声称上述新契约已验证。
