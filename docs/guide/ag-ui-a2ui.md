---
title: AG-UI 与 A2UI
description: 分别使用纯 AG-UI、独立 A2UI Runtime，或显式组合两者。
---

# AG-UI 与 A2UI

Agentdown 把两套协议做成三个独立入口：

| 入口 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `agentdown/ag-ui` | AG-UI run、message、tool、state、activity 与 transport | 不解释 A2UI，不注册 A2UI Renderer |
| `agentdown/a2ui` | A2UI v0.9/v0.9.1 状态、Catalog、Vue Renderer 与客户端消息 | 不规定后端或传输协议 |
| `agentdown/ag-ui-a2ui` | 用明确的 AG-UI 扩展事件承载 A2UI，并接好双向消息 | 不要求业务采用固定的服务端实现 |

这种分层意味着 A2UI 可以放在 AG-UI、WebSocket 或业务自定义 transport 上；只用 AG-UI 的项目也不会被生成式 UI 逻辑影响。

## 安装

核心包只要求 Vue。按实际入口安装协议 peer dependency：

```bash
npm install agentdown vue

# 纯 AG-UI
npm install @ag-ui/core

# 独立 A2UI
npm install @a2ui/web_core

# AG-UI + A2UI
npm install @ag-ui/core @a2ui/web_core
```

样式仍由应用显式引入：

```ts
import 'agentdown/style.css';
```

## 只接 AG-UI

`useAgUiChatSession()` 只处理标准 AG-UI 语义。`CUSTOM` 和 `RAW` 保持应用自定义事件，不会被猜测成 A2UI。

```ts
import { useAgUiChatSession } from 'agentdown/ag-ui';

const session = useAgUiChatSession({
  source: '/api/stream/agui',
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope)
  });
}
</script>

<template>
  <A2UiSurface
    surface-id="planner"
    :messages="messages"
    :catalogs="catalogs"
    @client-message="sendToBackend"
  />
</template>
```

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

## 显式组合 AG-UI + A2UI

组合入口会注册 A2UI Renderer，并将客户端消息放进下一次标准 AG-UI `RunAgentInput.forwardedProps`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface } from 'agentdown';
import { useAgUiA2UiChatSession } from 'agentdown/ag-ui-a2ui';

const prompt = ref('生成一个读书计划表单。');
const session = useAgUiA2UiChatSession({
  source: 'http://127.0.0.1:8000/api/stream/agui',
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

Action 和 Error 都使用官方 A2UI client message。组合 helper 默认放入以下 AG-UI `forwardedProps`：

```json
{
  "a2ui": {
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

只有服务端在 `createSurface.sendDataModel` 中启用后，`clientDataModel` 才会出现。Error 使用同一个 `clientMessage` 字段中的 `error` 分支。

`forwardedProps.a2ui` 是 Agentdown 组合 helper 的默认 transport envelope，不是 A2UI 对 HTTP body 的强制规定。业务可以完全替换序列化方式：

```ts
useAgUiA2UiChatSession({
  // ...
  serializeA2UiClient({ envelope, forwardedProps }) {
    return {
      forwardedProps,
      uiProtocol: envelope
    };
  }
});
```

也可以直接调用 `session.sendA2UiClient(envelope)`。

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

## 仓库内真实示例

仓库 FastAPI 服务中的 AG-UI+A2UI endpoint 是一个参考示例，不是库要求的固定后端：

- 前端：`src/demo/App.vue`
- DeepSeek 示例与安全转换：`backend/app/examples/agui_a2ui_deepseek.py`
- HTTP endpoint：`backend/app/main.py`
- 示例测试：`backend/tests/examples/test_agui_a2ui_deepseek.py`

它会真实调用 DeepSeek JSON mode；进程内存仅保存会话、事件、幂等和恢复状态。运行：

```bash
# 在 backend/.env 配置 DEEPSEEK_API_KEY
npm run backend:dev
npm run dev
```

生产环境应把事件归档、run 索引和幂等键换成 PostgreSQL/Redis 等持久化实现，并继续在业务层执行鉴权、校验、审计和高风险操作审批。
