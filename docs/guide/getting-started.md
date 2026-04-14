---
title: 快速开始
description: 用最短路径跑通 Markdown、官方框架快速接入、人机交互聊天页和自定义 SSE 协议。
---

# 快速开始

先明确一件事：

Agentdown 是给 Agent 产品前端使用的 UI Runtime，不是后端 Agent 框架。

- 它接收后端返回的 SSE / JSON / 框架事件流
- 它负责把这些事件流渲染成聊天消息、工具卡片、审批、人机接力和 Markdown 界面
- 如果你已经有后端，Agentdown 解决的就是前端这一层

如果你的目标是尽快做出一个真实 Agent 聊天页，先记住这一条：

- 官方框架优先用 `use*ChatSession()`
- 这层已经把流式文本、工具卡片、会话语义 id 和 approval / handoff / interrupt / resume 这类人机交互一起接好了

最推荐的上手顺序是：

1. 先用 `MarkdownRenderer` 跑通内容层
2. 再用 `use*ChatSession()` 跑通真实 Agent 页面
3. 最后再下钻到自定义 protocol 和 runtime

## 安装

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 1. 先跑通 Markdown

```vue
<script setup lang="ts">
// 先只验证 markdown 叙事层是否正常工作。
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Agentdown

这是普通段落。

:::thought
这里可以放思考过程。
:::

| 城市 | 天气 |
| --- | --- |
| 北京 | 晴 |

\`\`\`ts
console.log('hello agentdown');
\`\`\`
`;
</script>

<template>
  <MarkdownRenderer :source="source" />
</template>
```

## 2. 再跑通真实框架聊天页

如果你的后端已经是 Agno、LangChain、AutoGen、CrewAI 之一，优先用内置 chat helper。

下面是一个最常见的 Agno 例子：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  defineAgnoToolComponents,
  useAgnoChatSession
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 输入框内容。
const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');

// 只维护一份“工具名 -> 组件”的映射。
const tools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// 最短聊天入口：拿到 runtime、surface、send、busy 等状态。
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno 助手',
  mode: 'hitl',
  tools
});
</script>

<template>
  <button @click="session.send()">
    发送
  </button>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

### 推荐：直接用 `AgentChatWorkspace` 起完整聊天页

如果你要的不是“一个渲染面板”，而是完整聊天工作区，直接用 `AgentChatWorkspace` 会更顺手。

它默认已经带上：

- `RunSurface`
- 输入框与附件上传
- 会话尾部 loading dots
- 跟随到底部与悬浮回底按钮
- 首次加载 / 回放恢复时直接同步到底部
- 右侧悬浮 panel 容器

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  AgentChatWorkspace,
  useAgnoChatSession,
  type AgentChatComposerSendPayload
} from 'agentdown';

const prompt = ref('');
const uploads = ref([]);

const session = useAgnoChatSession({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:workspace-demo',
  title: 'Agno 助手',
  mode: 'hitl'
});

async function handleSend(payload: AgentChatComposerSendPayload) {
  await session.send(payload.input);
}
</script>

<template>
  <AgentChatWorkspace
    :runtime="session.runtime"
    :surface="session.surface"
    v-model="prompt"
    v-model:uploads="uploads"
    :busy="session.busy"
    :awaiting-human-input="session.awaitingHumanInput"
    :transport-error="session.transportError"
    @send="handleSend"
  />
</template>
```

这里最重要的一点是：

- `@send` 拿到的 `payload.input` 已经把文本和附件合并好了，直接传给 `session.send(payload.input)` 即可
- 如果用户手动滚离底部，新内容到来时不会强制把用户拉回去，而是显示悬浮回底按钮
- 默认 `conversation-tail` 会在请求已发出但正文还没开始 append 时显示 3 个 loading dots

## 3. 如果后端不是内置框架

那就直接写一层自己的 protocol。

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

// 把你自己的后端事件翻译成 runtime 命令。
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

// 最省事的 SSE 入口：拿到 runtime、connect、disconnect。
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

## 4. 回放已完成会话

如果后端在 run 结束后已经把会话存成 JSON，就不必重新连 SSE，可以直接恢复成可渲染的 runtime。

```vue
<script setup lang="ts">
import { AgentdownRenderArchiveSurface } from 'agentdown';

const archive = {
  format: 'agentdown.session/v1',
  framework: 'agno',
  status: 'completed',
  updated_at: 1770000000200,
  records: [
    {
      event: 'message',
      role: 'user',
      content: '帮我查一下北京天气',
      created_at: 1770000000000
    },
    {
      event: 'message',
      role: 'assistant',
      content: {
        text: '我来帮你查询北京今天的天气情况。',
        kind: 'markdown'
      },
      created_at: 1770000000100
    }
  ]
};
</script>

<template>
  <AgentdownRenderArchiveSurface :input="archive" />
</template>
```

如果你要自己控制恢复流程，也可以直接用：

- `useAgentdownRenderArchive()`
- `restoreAgentdownRenderArchive()`
- `defineAgentdownRecordsAdapter()`

## 下一步

- [核心概念](/guide/core-concepts)
- [官方框架适配](/guide/framework-adapters)
- [自定义协议接入](/guide/custom-framework)
- [流式 Markdown](/guide/streaming-markdown)
