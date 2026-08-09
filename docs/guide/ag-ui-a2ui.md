---
title: AG-UI 与 A2UI
description: 用标准 AG-UI 事件驱动 Agentdown，并在 Vue 中安全渲染和回传 A2UI v0.9 生成式界面。
---

# AG-UI 与 A2UI

Agentdown 把两个协议放在不同层处理：

- [AG-UI](https://docs.ag-ui.com/) 是 Agent 与前端之间的运行协议，负责 run、message、tool、shared state、activity 和 custom event。
- [A2UI v0.9](https://a2ui.org/specification/v0.9-a2ui/) 是声明式 UI 协议，负责 Surface、组件树、DataModel 和用户 action。

一句话理解：

```text
Agent backend
  -> AG-UI SSE events
  -> Agentdown protocol/runtime
  -> A2UI Surface block
  -> frontend-owned Vue Catalog
  -> A2UI action
  -> next standard AG-UI RunAgentInput
```

Agent 可以决定“用哪些已允许组件、绑定什么数据、触发什么事件”，但不能下发 Vue 文件、JavaScript、HTML 或任意可执行代码。Vue 组件实现和安全策略始终归前端所有。

## 最短接入

`useAgUiChatSession()` 会一次接好：

- 标准 `RunAgentInput` POST
- 标准 AG-UI SSE event 校验与映射
- text、reasoning、tool、step、shared state、activity
- A2UI custom event 聚合和 Vue Renderer
- A2UI action 自动回传
- 后端事件归档恢复和断线续传

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface, useAgUiChatSession } from 'agentdown';

const prompt = ref('生成一个读书计划表单，包含书名、每日分钟数和提交按钮。');

const session = useAgUiChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agui',
  input: prompt,
  conversationId: 'session:reading-planner',
  recovery: {},
  transport: {
    state: { locale: 'zh-CN' },
    context: [{ description: '当前页面是阅读计划页', value: 'reading-planner' }]
  }
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

如果模板自动解包了 ref，也可以按项目现有习惯省略 `.value`。

## 后端请求契约

Transport 发送的是 AG-UI 官方 `RunAgentInput`，不会往 body 塞入 Agentdown 私有字段：

```json
{
  "threadId": "session:reading-planner",
  "runId": "request:01",
  "messages": [
    {
      "id": "message:user:request:01",
      "role": "user",
      "content": "生成一个读书计划表单"
    }
  ],
  "tools": [],
  "context": [],
  "state": {}
}
```

幂等和游标放在 HTTP/SSE 语义里：

```http
Idempotency-Key: request:01
Last-Event-ID: session:reading-planner:12
```

`createAgUiSseTransport()` 会使用 `@ag-ui/core` 的 `RunAgentInputSchema` 和 `EventSchemas` 在边界校验请求与事件。协议不合法时会直接失败，不会把未知 payload 静默渲染成可信 UI。

## 仓库示例的真实模型边界

`backend/app/providers/agui.py` 会真实调用配置的 DeepSeek Chat Completion JSON mode，而不是按关键词拼旅行卡片。模型返回受限的中间 JSON：

```json
{
  "assistantText": "我为你生成了一个可调整的读书计划。",
  "components": [],
  "dataModel": {}
}
```

后端负责固定 A2UI 版本、`surfaceId` 和 Catalog，并在发送前校验：

- 组件与属性 allowlist、组件数量和消息大小
- `root`、子组件引用、可达性和循环
- DataModel 路径存在且类型匹配
- Button 只能产生服务端 `event`，不能下发 `functionCall`
- 原型污染键、客户端函数、URL/媒体和正则表达式均不允许

模型偶尔会把单选值写成字符串，后端只做 A2UI 类型层面的窄标准化，例如把 `"moderate"` 转为 `["moderate"]`；业务标题、字段、选项、文案和 action 仍来自模型。无效输出会请求模型修复一次，仍不合规则返回标准 `RUN_ERROR`。

调用方式遵循 DeepSeek 官方的 [JSON Output](https://api-docs.deepseek.com/guides/json_mode/) 和 [Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion)。`RUN_FINISHED.result` 会保留真实响应的 model、usage 和 response id，便于测试与审计。

## 后端发送 A2UI

A2UI 消息通过 AG-UI `CUSTOM` event 传输。一个可渲染 Surface 至少包含 `createSurface`、`updateComponents` 和 `updateDataModel`：

```json
{
  "type": "CUSTOM",
  "name": "a2ui",
  "value": {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "trip-planner",
      "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
      "sendDataModel": true
    }
  }
}
```

```json
{
  "type": "CUSTOM",
  "name": "a2ui",
  "value": {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "trip-planner",
      "components": [
        { "id": "root", "component": "Column", "children": ["title", "city"] },
        { "id": "title", "component": "Text", "text": { "path": "/title" }, "variant": "h2" },
        { "id": "city", "component": "TextField", "label": "目的地", "value": { "path": "/city" } }
      ]
    }
  }
}
```

```json
{
  "type": "CUSTOM",
  "name": "a2ui",
  "value": {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "trip-planner",
      "path": "/",
      "value": { "title": "杭州周末旅行计划", "city": "杭州" }
    }
  }
}
```

同一个 Surface 的消息会按到达顺序保存在 `a2ui.surface` block 中。因此 DataModel 和组件的流式增量更新可以被 Runtime 立即渲染，也可以作为普通后端事件归档后重新解释。

默认识别的 custom event 名是：

- `a2ui`
- `a2ui.message`
- `a2ui.surface`

也支持 AG-UI `RAW` event 中直接承载 A2UI 消息。自定义 allowlist 可通过 `protocolOptions.a2uiEventNames` 配置。

## 用户 action 如何回传

Button 的 `action.event.context` 可以引用当前 DataModel：

```json
{
  "id": "submit",
  "component": "Button",
  "child": "submit-label",
  "action": {
    "event": {
      "name": "trip_submitted",
      "context": {
        "city": { "path": "/city" },
        "days": { "path": "/days" }
      }
    }
  }
}
```

用户点击后，Renderer 生成标准 A2UI client action。`useAgUiChatSession()` 自动把它放进下一次标准 AG-UI 请求：

```json
{
  "threadId": "session:trip-planner",
  "runId": "request:02",
  "messages": [],
  "tools": [],
  "context": [],
  "state": {},
  "forwardedProps": {
    "a2ui": {
      "version": "v0.9",
      "action": {
        "name": "trip_submitted",
        "surfaceId": "trip-planner",
        "sourceComponentId": "submit",
        "timestamp": "2026-08-09T10:00:00.000Z",
        "context": { "city": "杭州", "days": 2 }
      }
    }
  }
}
```

也可以直接调用 `await session.sendA2UiAction(action)`。每个 action 都是新的幂等 run，不复用上一次运行的 request id。

## 安全边界

内置 `createA2UiBasicCatalog()` 使用官方 Basic Catalog schema，但 Vue 实现由 Agentdown 提供。默认安全策略包括：

- Catalog allowlist：未知 `catalogId` 拒绝处理
- Component allowlist：未注册组件拒绝处理
- 不注册会产生浏览器副作用的 `openUrl` 函数
- URL 协议 allowlist，默认只允许 `http:` 和 `https:`
- 单条消息、消息数量、组件数量、字符串长度和组件深度上限
- 拒绝 `__proto__`、`constructor`、`prototype` 等原型污染键
- 组件循环和过深嵌套在 Renderer 层中止

可以在独立 Renderer 上收紧策略：

```vue
<A2UiSurface
  surface-id="trip-planner"
  :messages="messages"
  :security-policy="{
    maxComponents: 80,
    maxDepth: 12,
    allowedUrlProtocols: new Set(['https:'])
  }"
  @action="handleAction"
  @error="reportA2UiError"
/>
```

业务组件需要自己控制视觉或行为时，覆盖前端 Renderer，不让 Agent 指定组件源码：

```ts
import { createA2UiBasicCatalog } from 'agentdown';
import ProductCard from './ProductCard.vue';

const catalog = createA2UiBasicCatalog({
  renderers: {
    Card: ProductCard
  }
});
```

Schema 仍由 Catalog 校验；覆盖只改变 Vue 呈现实现。

## Shared state 与低层入口

页面可以读取 AG-UI 的共享状态：

```ts
session.agUiState.value.state
session.agUiState.value.messages
session.agUiState.value.activities
```

需要自己组合运行链时，可以使用：

- `createAgUiProtocol()`
- `createAgUiAdapter()`
- `createAgUiSseTransport()`
- `createAgUiStateStore()`
- `applyAgUiJsonPatch()`
- `createA2UiProcessor()`
- `A2UiSurface`

`applyAgUiJsonPatch()` 支持 RFC 6902 的 `add`、`remove`、`replace`、`copy`、`move` 和 `test`，并拒绝危险 JSON Pointer 片段。

## 会话恢复

传入 `recovery: {}` 后，AG-UI 与其他 Agentdown chat helper 使用同一套后端权威恢复协议：

```http
GET /api/v1/conversations/{threadId}
GET /api/v1/conversations/{threadId}/events?request_id={activeRequestId}
```

归档保存原始 AG-UI/A2UI 事件，不保存浏览器组件实例。页面刷新后，Adapter 会重新解释事件并重建 Runtime、Surface、组件树和 DataModel。运行中断线则使用稳定 SSE id 和 `Last-Event-ID` 只补缺失事件。

完整 HTTP 契约见[后端会话恢复](/guide/backend-conversation-recovery)。

## 运行仓库内示例

这个示例会真实调用 DeepSeek，需要先在 `backend/.env` 配置 `DEEPSEEK_API_KEY`。进程内存只用于会话上下文、事件归档、幂等和恢复，不生成业务答案：

```bash
npm run backend:dev
npm run dev
```

打开 `http://localhost:5173/`，默认第一个适配器就是 **AG-UI + A2UI**：

1. 点击任意生成式界面快捷提示，例如读书计划。
2. 修改书名、每日分钟数和阅读节奏。
3. 点击模型生成的提交按钮。
4. 后端把 A2UI action 和当前 context 交给 DeepSeek，返回新的 AG-UI run 和 Surface。
5. 刷新页面，确认后端事件归档能恢复同一 Surface 和 DataModel。

对应实现：

- 前端：`src/demo/App.vue`
- DeepSeek provider 与安全转换：`backend/app/providers/agui.py`
- HTTP endpoint：`backend/app/main.py`
- 后端协议/安全测试和显式在线测试：`backend/tests/test_agui.py`

## 线上落地建议

仓库示例使用进程内 `ConversationEventStore`，服务重启后数据会消失。线上应把事件归档、run 索引和幂等键替换成 PostgreSQL/Redis 等持久化实现，同时保持 AG-UI body、SSE event 和恢复 HTTP 契约不变。

不要把 A2UI 当成“让模型生成任意前端代码”。生产环境应继续遵循：

1. 后端/Agent 只能发声明式消息。
2. 前端 Catalog 是唯一可执行实现来源。
3. action 到达后端仍要做鉴权、业务校验、幂等和审计。
4. 高风险业务操作要在业务层加入 approval，不能因为来自已渲染按钮就默认可信。
