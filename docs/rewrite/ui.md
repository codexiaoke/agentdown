# Agentdown 下一代消费 API 与组件契约

日期：2026-10-10。本文是设计交付稿，未修改库实现。以 master 设计的 core 契约为规范；允许破坏性更新，首批支持 Vue 与 React。

## 1. 用户入口与包边界

Agentdown 把 Agent 后端变成可以完成任务的前端：发送请求、看进度、理解工具操作、处理审批、使用产物，并在后端支持时恢复中断的任务。

普通用户认识 `useAgentSession()`、`AgentWorkspace` 和所选协议的 adapter 工厂即可。默认 UI、自建 UI 使用同一个 core session。定制布局时再使用 Provider 与分解组件。

| 包 | 责任 |
| --- | --- |
| `@agentdown/core` | 无框架会话状态、命令、订阅、协议 adapter 契约、catalog 数据、A2UI Surface 模型 |
| `@agentdown/vue` | Vue composable、provider、默认 UI、可组合组件、Vue renderers |
| `@agentdown/react` | React hooks、provider、默认 UI、可组合组件、React renderers |
| `@agentdown/ag-ui` 等协议包 | 用户选择安装的协议与传输实现，不默认安装全部协议 |

Vue 包不依赖 React，React 包不依赖 Vue。Core 不依赖 DOM 或两种框架。协议包只在被选择时进入依赖与构建；两种 UI 包使用同一个 adapter 契约。

`endpoint` 不是 core 对 AG-UI 的暗约定。最短示例显式选择 `createAgUiAdapter({ endpoint })`。自有 SSE 或 AI SDK 后端更换 adapter，Session 和 UI 不变。

## 2. 唯一 core 契约

```ts
createAgentSession(options): AgentSession;

interface AgentSession {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(action: AgentAction): OperationHandle;
  dispose(): void;
}

interface OperationHandle {
  operationId: string;
  attemptId: string;
  delivery: Promise<DeliveryOutcome>;
}

type DeliveryOutcome =
  | { status: 'delivered' }
  | { status: 'uncertain' }
  | { status: 'failed' };
```

这是拟议正式消费契约，具体类型应与 master 定义一致。`conversationId` 是 core 的统一会话身份；adapter 把它映射到协议的 threadId 等 wire 字段，UI 不需要知道映射。

- `createAgentSession` 是本地、无网络操作，不打开连接，不启动生成或定时任务。
- `getSnapshot` 返回稳定、不可变快照；状态未变时返回同一快照引用。
- `subscribe` 只建立本地通知，不自动请求历史、连接 SSE 或启动任务；退订也不取消远端任务。
- `dispatch(action)` 是唯一写入口。UI 不直接修改状态，adapter 产生的输入也进入统一的状态归并路径。
- `dispose` 是幂等的终结性客户端清理，关闭本地连接与资源、拒绝后续命令；不发送远端取消，不删除会话或产物。

典型显式 action 是 send、respond、cancel、resume。bindings 的 `actions.send/respond/cancel/resume` 只是对应 dispatch 的薄封装，不另有状态机。Live 恢复必须显式 `resume`；导入历史或快照不自动恢复网络连接。

`dispatch(action)` 同步返回 OperationHandle；bindings 的 actions 同样返回该 handle。operationId 标识一次逻辑操作，attemptId 标识这次投递尝试。`handle.delivery` 的 Promise 不 reject，使用 delivered / uncertain / failed 判别结果，不靠 try/catch 判断投递是否成功。

delivered 只表示完成投递，不表示后端接受或执行成功。后端 acceptance、operation 与 run 的 execution outcome 通过各自状态/事件明确表达；例如 HTTP 投递完成后，服务端仍可能拒绝业务请求。uncertain 表示无法确定是否已投递，不能当作失败后盲目重复发送。客户端幂等身份仍需要后端执行幂等配合。

## 3. Bindings 的正式返回形状

两个框架都返回：

```ts
const { session, snapshot, actions } = useAgentSession(configOrSession);
```

| 字段 | Vue | React |
| --- | --- | --- |
| `session` | 同一个 core AgentSession | 同一个 core AgentSession |
| `snapshot` | 只读 computed/ref，script 中读取 `.value` | 当前 render 的不可变 AgentSnapshot |
| `actions` | 稳定的便捷命令函数集合，返回 OperationHandle | 稳定的便捷命令函数集合，返回 OperationHandle |

Core 的 SessionSnapshot 是按 id 组织的领域记录；binding 的 AgentSnapshot 是共享纯投影产生的 AgentViewSnapshot，提供有序 messages 与 canSend 等只读便利字段。该投影按 revision 缓存，不是第二份可修改状态。下文示例消费这个视图快照。

Vue 使用 refs/composables/provide-inject，React 使用 hooks/context/外部 store 订阅。共享概念与语义，保持各框架响应式习惯。

支持两个重载：

1. `useAgentSession(config)`：binding 创建并拥有 session；scope/owner 真正结束时释放该 session。
2. `useAgentSession(existingSession)`：binding 只借用实例；unmount 只退订，不 dispose，也不关闭该实例的连接。实例由创建它的应用拥有者释放。

两个重载都不会因为创建、订阅或 UI 挂载发起请求。配置对象的普通重新创建不能导致重建会话；adapter 与 conversationId 构成明确身份。React 示例保持 adapter 引用稳定，adapter 定义本身可复用且不持有跨 session 的运行连接。

## 4. 完整默认 UI 示例

为两个前端共用无副作用的 adapter 定义：

```ts
// agent-adapter.ts：adapter 定义不启动网络；运行连接归各 session 所有。
import { createAgUiAdapter } from '@agentdown/ag-ui';

export const adapter = createAgUiAdapter({ endpoint: '/api/agent' });
```

Vue：

```vue
<script setup lang="ts">
import { useAgentSession, AgentWorkspace } from '@agentdown/vue';
import { adapter } from './agent-adapter';

const { session } = useAgentSession({
  adapter,
  conversationId: 'research-001'
});
</script>

<template>
  <AgentWorkspace :session="session" />
</template>
```

React：

```tsx
import { useAgentSession, AgentWorkspace } from '@agentdown/react';
import { adapter } from './agent-adapter';

export function ResearchChat() {
  const { session } = useAgentSession({
    adapter,
    conversationId: 'research-001'
  });

  return <AgentWorkspace session={session} />;
}
```

Workspace 接 core session，内部只订阅该实例。它不创建第二份 session，也不在挂载时自动请求。发送来自用户提交输入；恢复已有活动任务来自明确恢复操作或应用主动调用 `actions.resume()`。

## 5. 自建 UI 与分解 UI 示例

Vue 自建输入与布局，仍使用同一状态与命令：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  useAgentSession, AgentProvider, AgentMessage, AgentArtifactPanel
} from '@agentdown/vue';
import { adapter } from './agent-adapter';

const { session, snapshot, actions } = useAgentSession({
  adapter,
  conversationId: 'research-001'
});
const prompt = ref('');
const error = ref('');

async function submit() {
  const text = prompt.value.trim();
  if (!text) return;
  error.value = '';
  const handle = actions.send({ text });
  const delivery = await handle.delivery;
  if (delivery.status === 'delivered') {
    // 仅投递完成；消息仍应呈现等待后端接受/执行的状态。
    if (prompt.value.trim() === text) prompt.value = '';
  } else if (delivery.status === 'uncertain') {
    error.value = '投递结果待确认，请勿重复发送';
  } else {
    error.value = '未能投递，请检查失败原因';
  }
}
</script>

<template>
  <AgentProvider :session="session">
    <main class="research-layout">
      <section>
        <AgentMessage
          v-for="message in snapshot.messages"
          :key="message.id"
          :message-id="message.id"
        />
        <form @submit.prevent="submit">
          <textarea v-model="prompt" aria-label="研究任务" />
          <button :disabled="!snapshot.canSend">发送</button>
          <p v-if="error" role="alert">{{ error }}</p>
        </form>
      </section>
      <AgentArtifactPanel />
    </main>
  </AgentProvider>
</template>
```

React 自建输入与布局：

```tsx
import { useState, type FormEvent } from 'react';
import {
  useAgentSession, AgentProvider, AgentMessage, AgentArtifactPanel
} from '@agentdown/react';
import { adapter } from './agent-adapter';

export function ResearchWorkbench() {
  const { session, snapshot, actions } = useAgentSession({
    adapter,
    conversationId: 'research-001'
  });
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    setError('');
    const handle = actions.send({ text });
    const delivery = await handle.delivery;
    if (delivery.status === 'delivered') {
      // 仅投递完成；消息仍应呈现等待后端接受/执行的状态。
      setPrompt(current => current.trim() === text ? '' : current);
    } else if (delivery.status === 'uncertain') {
      setError('投递结果待确认，请勿重复发送');
    } else {
      setError('未能投递，请检查失败原因');
    }
  }

  return (
    <AgentProvider session={session}>
      <main className="research-layout">
        <section>
          {snapshot.messages.map(message => (
            <AgentMessage key={message.id} messageId={message.id} />
          ))}
          <form onSubmit={submit}>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} aria-label="研究任务" />
            <button disabled={!snapshot.canSend}>发送</button>
            {error && <p role="alert">{error}</p>}
          </form>
        </section>
        <AgentArtifactPanel />
      </main>
    </AgentProvider>
  );
}
```

消息组件只是一种便利。纯自建 UI 可以完全不用 Agentdown 组件，仅读取 snapshot、调用 actions；自建输入在 failed 或 uncertain 时保留草稿。默认 UI 与自建 UI 不能产生两套不一致的请求或状态。示例中的 snapshot.canSend 是能力与并发状态的派生判断：依据 adapter 的最大并发能力、尚未确认的操作和运行状态计算，不假定只有一个 active run。

只定制布局、不自建输入时，Vue 与 React 都可以组合：

```text
AgentProvider(session)
  AgentConversation
  AgentArtifactPanel
  AgentComposer
```

Vue 使用 slots，React 使用有类型的 render callbacks / slot components；区域名称和行为一致，不要求 DOM 或组件源码相同。

## 6. Core ownership、cleanup 与 SSR

### Owned session

`useAgentSession(config)` 的 binding 是拥有者，Provider 与子组件只是借用者。拥有者离开时清理客户端连接、订阅和异步任务；远端任务继续运行，除非用户已经显式 cancel。

React StrictMode 的临时 mount-cleanup-remount 不能把即将复用的 owned 实例永久 dispose。binding 要实现可重入 owner/lease 管理，把最终释放与临时退订区分，并用该生命周期验收；不能把 dispose 直接绑定在每一次 subscribe cleanup 上。未 commit 的纯实例不应已拥有网络资源。

### Borrowed session

应用可以显式创建并保存 core session，再将它传给两种 UI：

```ts
import { createAgentSession } from '@agentdown/core';

const session = createAgentSession({ adapter, conversationId: 'research-001' });
// UI：useAgentSession(session)，或 <AgentWorkspace session={session} />。
// UI unmount 只退订。应用拥有者最终执行：
session.dispose();
```

Workspace 与 Provider 不拥有传入的 session，无权因为自身卸载 dispose。多个消费者共享一个实例时，一个退出不关闭其他消费者仍使用的连接。

### Async 与线程切换

所有已失效请求的异步回调检查 session identity / generation，不更新新会话。conversationId 改变时 owned binding 建立隔离实例并释放旧本地实例，不取消旧远端任务；新实例不自动恢复。借用实例模式通过更换传入 session 实现切换，不由 UI 改写实例身份。

并发 send 按 adapter 声明的最大并发能力与 master 策略处理；core 的并发限制与 canSend 等派生 selector 必须一致。不能以一个 snapshot.activeRun 字段冒充所有后端的真实运行状态，也不能用后发请求覆盖前一任务。未确定投递的操作仍需要跟踪，避免再次点击生成重复操作。`cancel` 与客户端断线是不同动作，UI 必须呈现一致语义。

### SSR

每个 SSR 请求使用独立、被动实例，禁止模块级 session 单例；无副作用的 adapter 定义可以共享。SSR、订阅、Workspace 挂载、hydration 都不自动请求。初始 snapshot 只能含带版本的公开、可校验数据，不能含 token/header、组件实现、transport 实例或活跃连接。

React server snapshot 与 Vue 首次渲染使用同一数据。依赖 DOM 测量的长文优化延迟至 hydration 后，服务端先给确定性内容。Vue scope dispose 与 React owner release 都不会留下服务器请求级资源。

## 7. 组件行为契约

- Composer 管理本地草稿与受支持附件；failed / uncertain 时保留草稿；发送只 dispatch action。delivered 后显示待后端确认，而不是直接显示“任务已接受”或“任务已完成”。
- Conversation 保持阅读位置；阅读历史时不强行滚动；普通 token 更新不打断文字选择和复制。
- Tool 展示阶段、输入、输出与错误；等待审批与普通工具执行有区别。
- Approval 绑定稳定 action id，区分等待、提交中、已决定、过期与失败；结果由后端事实确认，重复点击按同一身份防重。
- Artifact 展示稳定身份、类型与版本；下载/预览遵守应用 URL、资源与授权策略。
- Workspace 根据真实 capabilities 提供操作。后端不支持取消或 live 恢复时，不呈现会误导用户的完整能力。

样式使用 tokens 与 class；保持语义和可访问性，允许各框架独立实现呈现。

## 8. Schema / catalog 与 framework registry

catalog 是纯数据：组件名称、描述、props schema、action schema 与必要资源限制。Vue/React registry 是本地渲染实现，留在 framework Provider / Workspace，绝不进入 core snapshot、后端请求或模型上下文。

两个前端共用 catalog，分别提供 renderers：

```ts
const { session } = useAgentSession({
  adapter,
  conversationId: 'weather-001',
  catalog: weatherCatalog
});
```

```vue
<AgentWorkspace :session="session" :renderers="{ weather: WeatherCard }" />
```

```tsx
<AgentWorkspace session={session} renderers={{ weather: WeatherCard }} />
```

Provider 支持同样的 renderers，供分解 UI 使用。注册名称与 schema 必须验证；未知组件、缺失 renderer 或 props 校验失败采用可理解的 fallback 和结构化诊断，不执行 Agent 提供的 HTML/JS。

catalog 公布给后端的 wire 方式属于 adapter 能力与双方接入约定，不能假定任意 AG-UI 服务都会理解某个专属字段。简单文本聊天无需配置 catalog。应用与 adapter 需要明确本次可用目录，不能把前端组件源码发给 Agent。

## 9. Shared state、capabilities 与恢复边界

区分三个状态来源：

1. Agent 业务状态：后端 snapshot/delta，例如计划、查询条件；通过明确 action 请求更改，不能直接修改前端对象冒充同步。
2. 交互运行状态：core 根据事件生成，例如工具完成、等待审批、任务失败。
3. 页面状态：本地草稿、折叠、滚动、焦点；由 UI 管理，不默认发送 Agent。

capabilities 描述本次端到端可用行为，如历史加载、active-run resume、cancel、approval/actions、agent-state update、catalog advertisement、A2UI actions。未知不算可用；能力不能仅依据 core 有某个方法来声明。

历史重放与 live 恢复分开。快照导入后，只有显式 resume 才可能连接后端；服务端必须具备历史/游标/运行身份等必要能力。客户端无法独立提供服务端持久化、授权或执行幂等。

生产责任：服务端校验 conversation/run 的用户授权、审批时效与执行幂等；客户端校验安全渲染、schema、URL 和资源上限；两方互不替代。

## 10. A2UI 跨框架 parity

Core 共享版本处理、Surface 生命周期、组件树、数据模型、action 格式和校验。Vue/React 分别实现输入控件 catalog 与呈现，首批覆盖文本、基础布局、按钮、输入、选择和表单。

共同契约包括字段值、schema 校验、disabled、提交 payload、Surface 删除、同 Surface 增量更新、错误 fallback 与 URL 策略。焦点、光标、IME composition、滚动由各框架实现，但必须支持相同任务。

按所选 A2UI 版本处理数据更新。用户草稿和冲突提示是明确 UI 策略，两个框架保持一致，不悄悄改写协议含义；普通增量更新不应整树 remount 导致焦点与输入丢失。复杂控件进入清晰的 catalog/capability 清单，不发布同名但交互不同的伪 parity。

## 11. 真实场景的 API 审查与共同验收

| 场景 | API 使用 | 必须验证 |
| --- | --- | --- |
| 最简单聊天 | adapter + hook + Workspace | 创建、订阅、挂载均零请求；用户提交才 send |
| 自建研究台 | 同一 session + snapshot/actions + 本地布局 | 无第二份状态；失败保留草稿；默认和自建 UI 请求一致 |
| 审批前刷新 | 快照恢复后明确 resume | 同一 action id；提交语义一致；后端防重 |
| 切换研究任务 | 新 conversationId / 更换借用实例 | 旧异步回调隔离；不自动 cancel 或 resume |
| 两个区域共享会话 | 同一 borrowed session | 任一区域卸载只退订，另一处继续；应用拥有者 dispose |
| Python SSE 换 AG-UI / AI SDK | 只改所选 adapter | 消息/工具/审批/产物语义不变，缺失能力明确 |
| 双框架天气卡片 | 相同 catalog + 各自 renderer | schema/name/actions 相同；组件实现不上传 |
| A2UI 表单边输入边更新 | 同一 Surface 模型 | 值/校验/提交/草稿策略一致；焦点与 IME 正确 |
| Nuxt / React SSR | 被动初始 snapshot | 请求隔离；hydration 零请求；无凭据泄漏 |

三组发布验收：

1. 完整任务：请求 → 文本 → 工具 → 审批 → 产物。相同 trace 产生相同身份和状态，用户回应产生同一后端请求与结果。
2. 连续性：显式 resume、刷新/断线、切换 conversation、明确 cancel。无重复输出，待审批可恢复，旧事件隔离，断线不等于取消。
3. 生成式 UI：同一 A2UI 表单增量更新与 shared-state/action 交互。字段、校验、提交、Surface 生命周期和 fallback 相同；分别通过焦点与 IME 体验验收。

先完成前两组的 Vue/React 纵向流程，再补第三组。通过共同契约后扩展第三种框架。

## 12. 已有事实与范围

assistant-ui 已发布共享 runtime 的 Vue bindings；CopilotKit 已发布 Vue 包并支持 A2UI、工具和 HITL；AI SDK 有 Vue 客户端。多框架扩大可用面，差异应通过后端开放性、完整任务可靠性和接入体验证明。

- https://github.com/assistant-ui/assistant-ui/blob/main/packages/vue/README.md
- https://github.com/assistant-ui/assistant-ui/blob/main/packages/react-ag-ui/README.md
- https://github.com/CopilotKit/CopilotKit/blob/main/packages/vue/README.md
- https://github.com/CopilotKit/CopilotKit/blob/main/packages/vue/PARITY.md
- https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/03-chatbot-resume-streams.mdx

本文包名、组件名与具体 action payload 是设计建议；core 的统一身份、四个实例方法、无自动网络、副作用所有权和显式 resume 均以 master 契约为规范。未修改源码或执行实施。
