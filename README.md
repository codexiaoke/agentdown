# Agentdown

语言导航：**中文** | [English](./README.en.md)

Agentdown 是一个面向流式输出的 Agent Markdown UI Runtime。  
它把 `MarkdownRenderer` 的叙事层、`Protocol + Bridge + Assembler + Runtime` 的运行态链路，以及可注入的 Vue 组件组合在一起，让 AI Agent 的输出不只是静态文本。

[在线文档](https://codexiaoke.github.io/agentdown/)

## FastAPI Backend

仓库里现在也带了一个 `backend/`，用于真实框架的 SSE 联调：

- `npm run backend:dev`
- 然后访问 `http://127.0.0.1:8000/api/health`

目前内置了这些真实流式 endpoint：

- `/api/stream/agno`
- `/api/stream/langchain`
- `/api/stream/autogen`
- `/api/stream/crewai`

这些 endpoint 现在都是 `DeepSeek + 真 Agent + 真工具调用`，不再带 demo/mock 流。

详细说明见 [backend/README.md](./backend/README.md)。

## 特性

- 面向 `Vue 3 + TypeScript` 的 Agent-native markdown 渲染与运行时
- `markdown-it + pretext` 驱动的 narrative 层，适合长文本和流式内容
- `defineProtocol()` 把任意后端事件映射成统一 `RuntimeCommand[]`
- `createBridge()` 负责协议映射、stream 组装、批量 flush
- `createMarkdownAssembler()` / `createPlainTextAssembler()` 处理 `stream.open / delta / close`
- 内置 `createSseTransport()` / `createNdjsonTransport()` / `createWebSocketTransport()` / `createAsyncIterableTransport()`
- 内置 `useSse()` / `useSseBridge()` / `useNdjsonBridge()` / `useWebSocketBridge()` / `useAsyncIterableBridge()` / `useRuntimeTranscript()` 等 Vue composables
- 也提供页面级 `useAgentSession()`，把 `runtime / bridge / transcript / replay` 收成一个入口
- 内置 `createRuntimeTranscript()` / `parseRuntimeTranscript()` / `createRuntimeReplayPlayer()`，方便回放、导入和导出，并直接产出 `messages / tools / artifacts / approvals`
- `createAgentRuntime()` 维护 `node / block / intent / history`
- `RunSurface` 负责把 runtime block 渲染成正式聊天界面
- 内置 `content.replace / tool.finish / artifact.upsert / approval.update / node.error` 这类高阶 helper
- 支持 `text / code / mermaid / thought / math / html / agui / approval / artifact / timeline`
- 支持 `:::vue-component` 在 markdown 中直接注入 Vue 组件
- 默认样式中性，方便接入自己的 Design System

## 安装

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 快速开始

### 1. 先跑通 Markdown 叙事层

```vue
<script setup lang="ts">
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Agentdown

这是一个最小示例。

:::thought
这里可以承载可折叠的思考过程。
:::

\`\`\`ts
console.log('hello agentdown');
\`\`\`
`;
</script>

<template>
  <MarkdownRenderer :source="source" />
</template>
```

### 2. 再把流式事件接进 Runtime

```ts
import {
  cmd,
  createHelperProtocolFactory,
  createAgentRuntime,
  createBridge,
  createMarkdownAssembler,
  defineEventProtocol
} from 'agentdown';

type Packet =
  | { event: 'RunStarted'; runId: string; title: string }
  | { event: 'ContentOpen'; streamId: string; slot: string }
  | { event: 'ContentDelta'; streamId: string; text: string }
  | { event: 'ContentClose'; streamId: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

const runtime = createAgentRuntime();

const protocol = defineEventProtocol<Packet>({
  RunStarted: (event) =>
    cmd.run.start({
      id: event.runId,
      title: event.title
    }),
  ContentOpen: (event) =>
    cmd.content.open({
      streamId: event.streamId,
      slot: event.slot
    }),
  ContentDelta: (event) => cmd.content.append(event.streamId, event.text),
  ContentClose: (event) => cmd.content.close(event.streamId),
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool.weather',
      at: context.now()
    }),
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

bridge.push([
  { event: 'RunStarted', runId: 'run:weather', title: '天气助手' },
  { event: 'ContentOpen', streamId: 'stream:answer', slot: 'main' },
  { event: 'ContentDelta', streamId: 'stream:answer', text: '我来为你查询天气' },
  { event: 'ToolCall', id: 'tool:weather', name: '查询天气' },
  {
    event: 'ToolCompleted',
    id: 'tool:weather',
    name: '查询天气',
    content: { city: '北京', condition: '晴', tempC: 26 }
  },
  { event: 'ContentClose', streamId: 'stream:answer' }
]);

console.log(runtime.snapshot());
```

如果你在 Vue 组件里直接接 SSE，更推荐直接用 composable：

```ts
const {
  runtime,
  connect,
  consuming,
  error
} = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  request: {
    body: {
      message: '帮我查一下北京天气'
    }
  },
  transport: {
    mode: 'json'
  }
})

await connect(undefined, {
  request: {
    body: {
      message: '帮我再查一次'
    }
  }
})
```

如果你暂时还不需要 bridge，只想像普通业务 hook 一样直接收 SSE：

```ts
const { status, lastMessage, connect, abort } = useSse<MyPacket>({
  onMessage: (packet) => {
    console.log(packet)
  }
})

await connect('/api/chat/sse', {
  request: {
    body: {
      message: 'hello'
    }
  }
})
```

如果后端不是 token append，而是直接返回“当前完整内容快照”，也可以直接用：

```ts
cmd.content.replace({
  id: 'block:assistant',
  groupId: 'turn:1',
  content: '我已经整理好了。\\n\\n- 北京晴\\n- 26°C',
  kind: 'markdown'
});
```

回放或导出时：

```ts
const transcript = createRuntimeTranscript(runtime)

console.log(transcript.messages)
console.log(transcript.tools)
console.log(transcript.artifacts)
console.log(transcript.approvals)
```

如果你要把导出的 JSON 再导回应用里：

```ts
const importedTranscript = parseRuntimeTranscript(jsonText)

const player = createRuntimeReplayPlayer(importedTranscript.history)
```

如果你已经有一套固定的事件规范，可以再往前一步，直接定义一个全局协议工厂：

```ts
const helperProtocolFactory = createHelperProtocolFactory<Packet, 'type'>({
  eventKey: 'type',
  defaults: {
    'content.replace': {
      kind: 'markdown'
    },
    'tool.start': {
      renderer: 'tool.weather'
    }
  },
  bindings: {
    'content.replace': {
      on: 'content.replace',
      resolve: (event) => ({
        id: event.blockId,
        groupId: event.groupId,
        content: event.markdown
      })
    },
    'tool.start': {
      on: 'tool.start',
      resolve: (event) => ({
        id: event.toolId,
        title: event.label,
        groupId: event.groupId
      })
    }
  }
});

const protocol = helperProtocolFactory.createProtocol();
```

## 核心心智模型

```text
raw packet -> protocol -> bridge -> assembler -> runtime -> your UI
```

- `MarkdownRenderer` 负责静态/叙事型 markdown 渲染
- `Protocol` 负责把任意后端事件转成统一命令
- `Assembler` 负责安全处理 token 流，避免半截表格、代码块、公式乱渲染
- `Runtime` 负责保存同步、可重放的运行态数据
- `RunSurface` 负责把这些 block 真正渲染成聊天界面或卡片流

## 覆写内置组件

```ts
import {
  MarkdownRenderer,
  type MarkdownBuiltinComponentOverrides
} from 'agentdown';

import MyCodeBlock from './MyCodeBlock.vue';
import MyThoughtBlock from './MyThoughtBlock.vue';

const builtinComponents: MarkdownBuiltinComponentOverrides = {
  code: MyCodeBlock,
  thought: MyThoughtBlock
};
```

## 文档

- 文档首页：[https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)
- 快速开始：[https://codexiaoke.github.io/agentdown/guide/getting-started](https://codexiaoke.github.io/agentdown/guide/getting-started)
- Runtime 概览：[https://codexiaoke.github.io/agentdown/runtime/overview](https://codexiaoke.github.io/agentdown/runtime/overview)
- 协议映射：[https://codexiaoke.github.io/agentdown/runtime/protocol](https://codexiaoke.github.io/agentdown/runtime/protocol)
- API 参考：[https://codexiaoke.github.io/agentdown/api/runtime](https://codexiaoke.github.io/agentdown/api/runtime)

## 开发

```bash
npm install
npm run dev
npm run docs:dev
npm run build
```

## License

[MIT](./LICENSE)
