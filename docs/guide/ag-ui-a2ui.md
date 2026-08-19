---
title: 统一 Chat、AG-UI 与 A2UI
description: 用一个聊天入口承载文字、前端组件与动态 A2UI，并了解各低层协议入口。
---

# 统一 Chat、AG-UI 与 A2UI

产品层推荐只有一个入口：

```text
useAgentChat() -> POST /api/stream/chat
                         ├─ TEXT_MESSAGE_*   普通文字
                         ├─ TOOL_CALL_*      前端注册组件
                         └─ CUSTOM name=a2ui 动态 A2UI
```

AG-UI 是聊天事件协议，不是页面上供用户选择的 Provider；A2UI 是一种回答表现，也不需要独立聊天接口。固定、高频业务卡片优先由前端注册，Agent 只选择组件并提供 props。只有现有组件无法表达动态布局或交互时才使用 A2UI。

底层仍保留三个可独立使用的入口：

| 入口 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `agentdown/ag-ui` | AG-UI run、message、tool、state、activity 与 transport | 不解释 A2UI，不注册 A2UI Renderer |
| `agentdown/a2ui` | A2UI v0.9/v0.9.1 状态、Catalog、Vue Renderer 与客户端消息 | 不规定后端或传输协议 |
| `agentdown/ag-ui-a2ui` | 用明确的 AG-UI 扩展事件承载 A2UI，并接好双向消息 | 不要求业务采用固定的服务端实现 |

这种分层意味着 A2UI 也可以放在 WebSocket 或业务自定义 transport 上；低层入口不会限制产品必须采用统一 Chat helper。

## 安装

核心包只要求 Vue。按实际入口安装协议 peer dependency：

```bash
npm install agentdown vue

# 纯 AG-UI
npm install @ag-ui/core

# 独立 A2UI
npm install @a2ui/web_core

# 统一 Chat（推荐）
npm install @ag-ui/core @a2ui/web_core
```

样式仍由应用显式引入：

```ts
import 'agentdown/style.css';
```

## 推荐：统一 Chat

```ts
import { useAgentChat } from 'agentdown';
import WeatherCard from './WeatherCard.vue';

const session = useAgentChat({
  source: '/api/stream/chat',
  conversationId: 'session:assistant',
  components: {
    weather_card: {
      component: WeatherCard,
      description: '展示已有可信数据的天气结果',
      propsSchema: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          temperature: { type: 'number' },
          condition: { type: 'string' }
        },
        required: ['city', 'temperature', 'condition'],
        additionalProperties: false
      }
    }
  }
});
```

前端组件表会同时生成标准 AG-UI tools 和本地白名单 renderer。传给 Agent 的只有名称、description 与 JSON Schema；Vue 组件不会离开浏览器。

## 低层：只接 AG-UI

`useAgUiChatSession()` 只处理标准 AG-UI 语义。`CUSTOM` 和 `RAW` 保持应用自定义事件，不会被猜测成 A2UI。

```ts
import { useAgUiChatSession } from 'agentdown/ag-ui';

const session = useAgUiChatSession({
  source: '/api/examples/agui',
  conversationId: 'session:assistant',
  recovery: {}
});
```

低层入口也位于同一个 subpath：

- `createAgUiProtocol()`
- `createAgUiAdapter()`
- `createAgUiSseTransport()`
- `createAgUiStateStore()`
- `applyAgUiJsonPatch()`

## 独立使用 A2UI

A2UI Renderer 不依赖 AG-UI。宿主只需要提供服务端消息，并自行发送 `client-message`：

A2UI Surface 不等于表单。只读结果（例如天气、汇率、搜索摘要）只需声明
`Text / Row / Column / List / Card / Divider` 等展示组件，不需要 Button 或 action；
只有业务确实需要交互时才增加按钮。结构固定且高频的天气卡也可以直接使用
前端注册的 `WeatherCard` 工具 renderer，A2UI 更适合动态组合的展示结构。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  A2UiSurface,
  createA2UiBasicCatalog,
  type A2UiClientEnvelope
} from 'agentdown/a2ui';

const messages = ref<unknown[]>([]);
const catalogs = [createA2UiBasicCatalog()];

async function sendToBackend(envelope: A2UiClientEnvelope) {
  await fetch('/api/a2ui/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': envelope.requestId
    },
    body: JSON.stringify(envelope)
  });
}
</script>

<template>
  <A2UiSurface
    surface-id="planner"
    :messages="messages"
    :catalogs="catalogs"
    :send-client-message="sendToBackend"
  />
</template>
```

`sendClientMessage` 是可等待的 transport callback。它返回的 Promise 只驱动
`sending / delivered / failed` delivery 状态：`delivered` 表示 envelope 已交给宿主，
不表示业务 action 已成功。`@client-message` 仍可用于埋点观察，但不会被 Vue 等待，
因此不能代替 transport callback。

`A2UiSurface` 内部持有长生命周期 `MessageProcessor`。当服务端消息历史只是追加时，它只处理新增消息，不重放旧历史，因此用户在 TextField、ChoicePicker 等组件中的本地输入不会被下一条服务端消息覆盖。只有历史发生替换或回退时才重建 Surface。

需要完全脱离 Vue 时使用：

```ts
import { createA2UiSurfaceController } from 'agentdown/a2ui';

const controller = createA2UiSurfaceController({
  surfaceId: 'planner',
  catalogs,
  onClientMessage: sendToBackend
});

controller.sync(serverMessages);
```

## 低层：显式组合 AG-UI + A2UI

组合入口会注册 A2UI Renderer，并将客户端消息放进下一次标准 AG-UI `RunAgentInput.forwardedProps`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface } from 'agentdown';
import { useAgUiA2UiChatSession } from 'agentdown/ag-ui-a2ui';

const prompt = ref('生成一个读书计划表单。');
const session = useAgUiA2UiChatSession({
  source: 'http://127.0.0.1:8000/api/stream/chat',
  input: prompt,
  conversationId: 'session:reading-planner',
  recovery: {}
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <input v-model="prompt">
    <button :disabled="session.busy.value">发送</button>
  </form>
  <RunSurface :runtime="session.runtime" v-bind="session.surface.value" />
</template>
```

后端通过命名明确的 AG-UI `CUSTOM` event 发送 A2UI：

```json
{
  "type": "CUSTOM",
  "name": "a2ui",
  "value": {
    "version": "v0.9.1",
    "createSurface": {
      "surfaceId": "planner",
      "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
      "sendDataModel": true
    }
  }
}
```

默认允许的 `CUSTOM` name 是 `a2ui`、`a2ui.message` 和 `a2ui.surface`。命中后的 payload 必须通过官方 A2UI schema；非法消息会报错，不会静默丢弃。

`RAW` 默认完全禁用。只有明确配置 source 后才解析：

```ts
useAgUiA2UiChatSession({
  // ...
  a2uiProtocolOptions: {
    rawEventSources: new Set(['my-a2ui-bridge'])
  }
});
```

也可以用 `extractMessages(event, context)` 完全接管扩展事件提取逻辑。

## 跨 run Surface

组合协议按 `threadId + surfaceId` 保存消息历史。新的 AG-UI run 不会清空 Surface；后端可以在下一次 run 只发送新的 `updateDataModel` 或 `updateComponents`。扩展层会把完整历史重新写入 Runtime block，浏览器 A2UI controller 则只处理真正新增的消息。

`RUN_FINISHED` 后 block 仍保持 `stable`，不会被错误地标为不可再更新的 `settled`。`deleteSurface` 才会移除历史和 block。

如果业务确实要清理历史，可以持有 `createAgUiA2UiProtocol()` 的返回值并调用 `clearSurfaces(threadId?)`。

## 客户端消息契约

组合 helper 会在首次普通文本请求中先发送能力握手：

```json
{
  "a2ui": {
    "clientCapabilities": {
      "v0.9.1": {
        "supportedCatalogIds": [
          "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
        ]
      }
    }
  }
}
```

这样服务端可以在生成第一个 Surface 前选择客户端真实支持的 Catalog。Action 和 Error 才会额外携带官方 A2UI client message：

```json
{
  "a2ui": {
    "requestId": "a2ui:7a90d64f-...",
    "clientMessage": {
      "version": "v0.9.1",
      "action": {
        "name": "plan_submitted",
        "surfaceId": "planner",
        "sourceComponentId": "submit",
        "timestamp": "2026-08-09T10:00:00.000Z",
        "context": { "book": "深度工作" }
      }
    },
    "clientCapabilities": {
      "v0.9.1": {
        "supportedCatalogIds": [
          "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
        ]
      }
    },
    "clientDataModel": {
      "version": "v0.9.1",
      "surfaces": {
        "planner": { "book": "深度工作" }
      }
    }
  }
}
```

`requestId` 是 Agentdown envelope 的 transport 元数据，不是 A2UI 标准消息字段。按钮
快速重复点击时只发送一次；失败后的“重试”会原样复用同一个 envelope 和 `requestId`，
宿主应把它映射到 HTTP `Idempotency-Key` 或等价的后端幂等字段。

只有服务端在 `createSurface.sendDataModel` 中启用后，`clientDataModel` 才会出现。Error 使用同一个 `clientMessage` 字段中的 `error` 分支。

`forwardedProps.a2ui` 是 Agentdown 组合 helper 的默认 transport envelope，不是 A2UI 对 HTTP body 的强制规定。业务可以完全替换序列化方式：

```ts
useAgUiA2UiChatSession({
  // ...
  serializeA2UiClient({ client, forwardedProps }) {
    return {
      forwardedProps,
      uiProtocol: client
    };
  }
});
```

也可以直接调用 `session.sendA2UiClient(envelope)`。

## Action 状态边界

### 前端 Action Handler

已知的轻量动作不必绕到 Agent。通过 `actionHandlers` 可以按 action name
在前端处理；未注册动作仍默认发送给宿主 transport。需要“乐观更新 + 后端确认”时，
handler 显式调用 `forward()` 即可，同一次执行只会真正转发一次：

```ts
useAgUiA2UiChatSession({
  // ...
  a2uiRenderer: {
    actionHandlers: {
      toggle_temperature_unit({ action }) {
        weatherStore.toggleUnit(action.context?.city);
      },
      async book_hotel({ action, forward }) {
        bookingStore.optimisticallyBook(action.context?.hotelId);
        await forward();
      }
    }
  }
});
```

handler 抛错时会进入现有 delivery failure/retry 流程。长时间运行的业务状态仍应通过
`A2UiActionStateSource` 提供；前端 handler 不会把“成功交给处理函数”误认为后端业务已完成。

Agentdown 是前端库，因此把 transport delivery 与业务 execution 明确分开：

- Agentdown 自己管理 `sending / delivered / failed`，用于阻止双击和重试发送失败；
- 宿主通过可选 `A2UiActionStateSource` 投影 `pending / succeeded / failed / cancelled`；
- `sendClientMessage` 正常返回绝不会被解释为业务 `succeeded`；
- 宿主 execution 状态优先于同一组件的本地 delivery 状态；
- `interactionDisabled` 可以来自组件 props，也可以来自宿主状态源；
- 业务失败只有声明 `retryable: true` 且配置 `retryExecution` 时才显示重试入口。

```ts
import type {
  A2UiActionExecutionSnapshot,
  A2UiActionStateSource
} from 'agentdown/a2ui';

let snapshot: A2UiActionExecutionSnapshot = {
  surfaceId: 'planner',
  interactionDisabled: false,
  states: {}
};
const listeners = new Set<(value: A2UiActionExecutionSnapshot) => void>();

const actionStateSource: A2UiActionStateSource = {
  getSnapshot: () => snapshot,
  subscribe(_surfaceId, listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

// WebSocket、SSE、AG-UI runtime 或纯本地 executor 都可以更新同一个状态源。
function updateActionState(next: A2UiActionExecutionSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener(snapshot));
}
```

将 `actionStateSource` 传给 `A2UiSurface`，或放入组合 helper 的
`a2uiRenderer.actionStateSource`。Agentdown 不规定状态来自后端还是本地 executor，仓库内
FastAPI 仅用于示例和端到端测试。

自定义 Catalog renderer 会收到合并后的 `actionState`、`retryAction` 和
`interactionDisabled` props。组合 helper 还通过 `session.a2uiActionStates` 暴露会话级
只读快照，方便宿主做埋点或全局提示。

## Catalog 与安全边界

Basic Catalog 只是零配置起点。业务可以覆盖基础组件，也可以声明完全独立的 Catalog：

```ts
import { Catalog } from '@a2ui/web_core/v0_9';
import { defineA2UiCatalog } from 'agentdown/a2ui';
import ProductCard from './ProductCard.vue';

const protocol = new Catalog('https://example.com/catalog/product/v1', componentApis);
const productCatalog = defineA2UiCatalog({
  id: protocol.id,
  protocol,
  renderers: { ProductCard }
});
```

`defineA2UiCatalog()` 会检查协议 ID 和每个组件的 Vue Renderer 是否完整。多个 Catalog 可同时传给 `catalogs`，具体 Surface 只能使用自己声明的 Catalog。

默认安全策略还包括：

- 未注册 Catalog 和 Component 拒绝处理
- 不注册会产生浏览器副作用的 Basic Catalog `openUrl`
- URL 协议 allowlist
- 消息大小、消息数、组件数、字符串长度和组件深度上限
- 拒绝原型污染键、组件循环和过深嵌套
- Agent 只能发送声明式数据，不能发送 Vue、JavaScript 或任意 HTML 实现

## 浏览器交互基线

Basic Catalog 的交互不是只验证“能渲染”。当前基线同时覆盖：

- Text 的加粗、强调、行内代码和删除线；链接、图片与 HTML 保持为普通文本
- TextField 校验错误与输入框的可访问性关联
- ChoicePicker 的多选、chips 样式和前端筛选
- Tabs 的方向键、Home、End 和 roving tabindex
- Modal 的初始焦点、Tab 焦点约束、Escape 关闭和触发按钮焦点恢复
- Action 发送中的 `disabled`、`aria-busy`、重复提交抑制和完整 DataModel context

仓库使用 Playwright 对同一套真实 Runtime、Markdown Renderer 和 A2UI Surface 跑浏览器测试：

```bash
# 使用当前电脑安装的 Google Chrome
npm run test:e2e:chrome

# Google Chrome、Firefox、WebKit 三引擎
npm run test:e2e
```

这些测试通过浏览器内的轻量 transport fixture 验证前端库行为，不把仓库 FastAPI
示例后端算作组件能力或生产依赖。

## 仓库内真实示例

仓库提供三个独立 Vue 消费者，分别验证公开 npm 入口：

- `examples/vue-ag-ui` → `agentdown/ag-ui` → `/api/examples/agui`
- `examples/vue-a2ui` → `agentdown/a2ui` → `/api/examples/a2ui`
- 主 Demo → `useAgentChat()` → `/api/stream/chat`
- `examples/vue-ag-ui-a2ui` → 低层 `agentdown/ag-ui-a2ui` → `/api/stream/chat`

三条后端都真实调用 DeepSeek。纯 AG-UI 端点只发送标准 lifecycle/text events；独立 A2UI 端点使用普通 JSON transport；组合端点才通过 AG-UI `CUSTOM` 承载 A2UI。它们都是参考示例，不是库要求的固定后端：

- 前端：`src/demo/App.vue`
- DeepSeek 示例与安全转换：`backend/app/examples/agui_a2ui_deepseek.py`
- 纯协议示例后端：`backend/app/examples/agui_deepseek.py`、`backend/app/examples/a2ui_deepseek.py`
- HTTP endpoint：`backend/app/main.py`
- 示例测试：`backend/tests/examples/test_agui_a2ui_deepseek.py`

它会真实调用 DeepSeek JSON mode；进程内存仅保存会话、事件、幂等和恢复状态。运行：

```bash
# 在 backend/.env 配置 DEEPSEEK_API_KEY
npm run backend:dev
npm run dev
```

生产环境应把事件归档、run 索引和幂等键换成 PostgreSQL/Redis 等持久化实现，并继续在业务层执行鉴权、校验、审计和高风险操作审批。
