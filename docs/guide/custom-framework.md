---
title: 自定义协议接入
description: 当后端不是内置框架时，如何用 defineEventProtocol、useSseBridge 和 runtime 接入。
---

# 自定义协议接入

如果你的后端不是 Agno、LangChain、AutoGen、CrewAI，Agentdown 仍然适合。

这时最常见的接法是：

1. 用 `defineEventProtocol()` 把后端事件翻译成 `RuntimeCommand[]`
2. 用 `useSseBridge()` 或 `createBridge()` 驱动协议
3. 用 `RunSurface` 渲染 runtime

## 最短例子

```ts
import {
  cmd,
  createMarkdownAssembler,
  defineEventProtocol,
  useSseBridge
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; result: Record<string, unknown> };

const protocol = defineEventProtocol<Packet>({
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ],
  RunCompleted: () => cmd.content.close('stream:assistant'),
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool',
      at: context.now()
    }),
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.result,
      at: context.now()
    })
});

const session = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  transport: {
    mode: 'json'
  }
});

await session.connect();
```

## 什么时候用 `append`，什么时候用 `replace`

### 后端返回 token 流

优先用：

- `cmd.content.open()`
- `cmd.content.append()`
- `cmd.content.close()`

### 后端每次返回完整快照

优先用：

- `cmd.content.replace()`

```ts
cmd.content.replace({
  id: 'block:assistant',
  groupId: 'turn:1',
  kind: 'markdown',
  content: '我已经整理好了。\\n\\n- 北京晴\\n- 26°C'
});
```

## 非 UI 事件怎么处理

有些事件和界面没关系，但前端仍然要监听：

- `CreateSession`
- `SetTitle`
- `UpdateUsage`
- 埋点

这种情况不要强行转 block。

直接用 `eventToAction()` 或框架专用 `define*EventActions()`。

```ts
import { eventToAction } from 'agentdown';

const eventActions = eventToAction<Packet>({
  CreateSession({ event }) {
    console.log('new session id', event.sessionId);
  },
  SetTitle({ event }) {
    document.title = event.title;
  }
});
```

## 某个事件想直接渲染成组件

如果某类事件本身不是 tool，但你想把它直接插进界面里，优先用 `eventToBlock()`。

它的作用是：

- 命中指定事件
- 直接产出 block
- 再由 `RunSurface` 走 renderer 渲染

## 什么时候才需要 `useAgentChat()`

如果你只是接一个自定义 SSE 后端，不需要先上 `useAgentChat()`。

先用：

- `defineEventProtocol()`
- `useSseBridge()`

就够了。

`useAgentChat()` 更适合你在项目里继续抽象出“统一 framework 层”时使用。
