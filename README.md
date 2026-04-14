# Agentdown

语言导航：**中文** | [English](./README.en.md)

Agentdown 是一个给 Agent 产品前端使用的 UI Runtime，基于 Vue 3 构建。  
它接收后端返回的 SSE / JSON / 框架事件流，把原始 Agent 输出渲染成聊天消息、工具卡片、审批、handoff、artifact 和可持续更新的 Markdown 界面。

[在线文档](https://codexiaoke.github.io/agentdown/)

## 一句话理解

```text
raw packet / SSE -> protocol -> bridge -> assembler -> runtime -> Agent UI
```

## 它到底是做什么的

用最直白的话说：

> Agentdown 负责把 Agent 后端吐出来的“事件流”，变成用户真正能用的前端聊天界面。

它更像是 Agent 产品的前端渲染层，而不是模型层或后端编排层。

- 输入：Agno、LangChain、AutoGen、CrewAI 或你自己的 SSE / JSON 事件流
- 输出：聊天消息、工具调用卡片、审批块、handoff 块、artifact、长文 Markdown 和自定义 AGUI 组件
- 作用位置：Agent 产品前端

它不负责这些事情：

- 不负责调用大模型
- 不负责编排多 Agent 工作流
- 不负责替你实现后端记忆、数据库和任务队列

它主要负责这些事情：

- 把流式文本稳定渲染成 Markdown，而不是半截乱码
- 把工具调用、审批、人机交互事件渲染成真正的 UI
- 把长文本和大组件控制在浏览器可承受的性能范围内
- 让官方框架事件可以直接接到前端页面

## 最快接入官方框架

如果你的后端已经是 Agno、LangChain、AutoGen、CrewAI 之一，最推荐的入口不是自己从零拼 protocol，而是直接用：

- `useAgnoChatSession()`
- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

这层就是给真实聊天页准备的最快接法，通常几行配置就能把下面这些一起接上：

- 流式文本
- 工具调用卡片
- 消息分组和会话语义 id
- 重新生成、复制等消息操作
- approval / handoff / interrupt / resume 这类人机交互流程

如果你要做的就是“接一个真实 Agent 后端，并尽快把聊天页跑起来”，先看这层。

最短示例：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  useAgnoChatSession
} from 'agentdown';

// 当前输入框内容。
const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');

// `mode: "hitl"` 会把人机交互事件也一起接进来。
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno 助手',
  mode: 'hitl'
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <textarea v-model="prompt" rows="2" />
    <button :disabled="session.busy">
      {{ session.busy ? '请求中...' : '发送' }}
    </button>
  </form>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

如果你正在做：

- 聊天式 Agent 页面
- 工具调用卡片
- artifact / approval / 自定义 AGUI 组件
- 长文本和大组件混排的流式界面
- Agno、LangChain、AutoGen、CrewAI 这类真实框架接入

那 Agentdown 解决的就是中间最重复、最容易出错、最影响体验的那一段。

## 它解决什么问题

- 不要求后端改成某个固定协议。后端返回什么 JSON，就映射什么 JSON。
- 不把 Agent 输出当成一整坨 HTML，而是拆成稳定的 block 和组件。
- 不让流式 token 直接把半截 table、半截 code block、半截 markdown 提前渲染成乱码。
- 不让工具调用只能作为附属文本存在，而是让工具、产物、审批都能成为真正的 UI block。
- 不让长文和重型组件一起渲染时把浏览器拖慢，而是内建 pretext、slab、windowing、lazy mount。

## 当前能力

| 模块 | 能力 |
| --- | --- |
| `MarkdownRenderer` | 负责 markdown 叙事层，支持 headings、段落、列表、表格、引用、图片、代码、Mermaid、KaTeX、HTML fallback |
| `Protocol + Bridge + Runtime` | 把任意后端事件映射成稳定的运行态命令和可订阅状态 |
| `RunSurface` | 把 runtime 中的 block 渲染成聊天式界面、工具卡片流和自定义 AGUI |
| 官方适配器 | 已提供 `Agno`、`LangChain`、`AutoGen`、`CrewAI` 官方事件适配层 |
| 组件扩展 | 支持 `builtinComponents`、`renderers`、`messageShells`、`:::vue-component` |
| 性能 | 支持 pretext 文本渲染、长文本 slab、长文窗口化、group windowing、重型 block lazy mount |
| 调试回放 | 支持 transcript 导入导出、history replay、事件记录和性能遥测 |

## 内置 block 类型

| 类型 | 说明 |
| --- | --- |
| `text` | 标题、段落和常见 inline 富文本，优先走 `@chenglou/pretext` |
| `html` | 表格、列表、引用、图片和复杂 HTML fallback |
| `code` | 代码块 |
| `mermaid` | Mermaid 图表 |
| `math` | KaTeX 数学公式 |
| `thought` | 可折叠思考块 |
| `agui` | `:::vue-component` 注入的 Vue 组件 |
| `artifact` | Agent 产物 |
| `approval` | 审批块 |
| `timeline` | 时间线块 |

## 官方框架适配状态

如果你要快速接一个真实聊天页，这一节就是最应该先看的入口。

| 框架 | 推荐入口 | 流式文本 | 工具卡片 | 内置操作审批 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Agno | `useAgnoChatSession()` / `createAgnoAdapter()` | 支持 | 支持 | 支持 | 聊天页面优先用 `useAgnoChatSession()` |
| LangChain | `useLangChainChatSession()` / `createLangChainAdapter()` | 支持 | 支持 | 支持 | 直接消费 `astream_events()` 风格事件 |
| AutoGen | `useAutoGenChatSession()` / `createAutoGenAdapter()` | 支持 | 支持 | 支持 | 直接消费官方 `run_stream()` 事件 |
| CrewAI | `useCrewAIChatSession()` / `createCrewAIAdapter()` | 支持 | 支持 | 不默认提供 | 直接消费官方 SSE chunk，附带 `parseCrewAISseMessage()`，当前主打真实流式输出与工具展示 |

所有适配器都保持一个原则：

- 前端直接适配官方事件
- 不要求后端再包一层 Agentdown 专属协议
- 用户只需要定义“怎么渲染工具”和“哪些事件额外映射成组件”

如果你是在接内置四个框架，优先用各自专用的 `use*ChatSession()`。
`useAgentChat()` 更适合你继续封装“自定义 framework driver”或项目内部统一抽象层。

更完整的能力说明见：

- [官方框架适配](https://codexiaoke.github.io/agentdown/guide/framework-adapters)
- [核心概念](https://codexiaoke.github.io/agentdown/guide/core-concepts)
- [自定义协议接入](https://codexiaoke.github.io/agentdown/guide/custom-framework)

## 安装

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 30 秒先跑通内容层

```vue
<script setup lang="ts">
// 引入最小渲染入口和样式。
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

// 这里先放一段固定 markdown，方便先验证叙事层。
const source = `
# Agentdown

这是一段普通 markdown。

:::thought
这里可以承载可折叠的思考过程。
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

## 接任意 SSE / JSON 后端

如果你的后端不是内置框架，也没关系。  
直接把事件映射成 `RuntimeCommand[]` 就可以。

```ts
import {
  // `RunSurface` 负责把 runtime 渲染成聊天式界面。
  RunSurface,
  // `cmd` 用来创建 runtime 命令。
  cmd,
  // markdown assembler 负责把流式文本组装成更稳定的 markdown block。
  createMarkdownAssembler,
  // 最常见的 event -> handler 分发入口。
  defineEventProtocol,
  // 直接在 Vue 页面里消费 SSE。
  useSseBridge
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

// 把后端 packet 映射成 runtime 命令。
const protocol = defineEventProtocol<Packet>({
  // assistant 文本到来时，持续追加到同一条流里。
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ],
  // 回答结束时，关闭当前文本流。
  RunCompleted: () => cmd.content.close('stream:assistant'),
  // 工具开始时创建一个独立工具块。
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool',
      at: context.now()
    }),
  // 工具完成时更新回同一个工具块。
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

// 这里会返回 runtime 和连接控制方法。
const { runtime, connect } = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  transport: {
    mode: 'json'
  }
});

// 建立连接后，后端事件就会持续进入 runtime。
await connect();
```

```vue
<RunSurface :runtime="runtime" />
```

如果你的后端返回的是“当前完整内容快照”而不是 token append，可以直接用：

```ts
// 如果后端直接返回完整 markdown 快照，就直接替换当前消息块。
cmd.content.replace({
  id: 'block:assistant',
  groupId: 'turn:1',
  content: '我已经整理好了。\\n\\n- 北京晴\\n- 26°C',
  kind: 'markdown'
});
```

## 接官方框架最推荐的方式

对 Agno、LangChain、AutoGen、CrewAI，聊天页面优先用各自的 `use*ChatSession()`。  
下面这个例子是最新的 `useAgnoChatSession()` 写法，其他框架只需要把 helper 换成对应版本即可。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  // 让“工具名 -> 组件”的配置只维护一份。
  defineAgnoToolComponents,
  // 聊天页面优先使用这一层高阶 helper。
  useAgnoChatSession
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 当前输入框里的问题。
const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');

// `useAgnoChatSession()` 会自动帮你：
// 1. 创建 adapter / transport
// 2. 生成 turnId / messageId
// 3. 预插入用户消息
// 4. 把 regenerate 接回同一个聊天流
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno 助手',
  mode: 'hitl',
  tools: defineAgnoToolComponents({
    lookup_weather: {
      match: 'lookup_weather',
      component: WeatherToolCard
    }
  })
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <textarea
      v-model="prompt"
      rows="2"
      placeholder="帮我查一下北京天气"
    />

    <button :disabled="session.busy">
      {{ session.busy ? '请求中...' : '发送' }}
    </button>

    <p v-if="session.sessionId">
      后端 sessionId：{{ session.sessionId }}
    </p>
  </form>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

如果你想接另外三个内置框架，只需要把 helper 换成：

- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

如果你需要更底层的控制，再往下用：

- `createAgnoAdapter()`
- `createAgnoProtocol()`
- `defineAgnoPreset()`

## 更推荐的聊天页入口：`AgentChatWorkspace`

如果你不是只想“把 runtime 渲染出来”，而是想直接做一个完整聊天工作区，优先用 `AgentChatWorkspace`。

它把这些页面层能力合在了一起：

- `RunSurface`
- 内置输入框、附件上传和发送逻辑
- 请求刚发出但对话区还没追加新内容时的默认 loading dots
- 右侧悬浮 panel
- 跟随到底部、脱离底部后的悬浮回底按钮
- 首次进入 / 刷新回放时直接同步到底部，避免先闪一下再滚下来

最短示例：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  AgentChatWorkspace,
  useAgnoChatSession,
  type AgentChatComposerSendPayload,
  type AgentChatWorkspaceExposed
} from 'agentdown';

const workspaceRef = ref<AgentChatWorkspaceExposed | null>(null);
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
    ref="workspaceRef"
    :runtime="session.runtime"
    :surface="session.surface"
    v-model="prompt"
    v-model:uploads="uploads"
    :busy="session.busy"
    :awaiting-human-input="session.awaitingHumanInput"
    :transport-error="session.transportError"
    placeholder="给智能体发送消息"
    :upload-file="async (file) => ({
      fileId: `file:${file.name}`
    })"
    @send="handleSend"
  >
    <template #scroll-to-bottom="{ visible, unread, scrollToBottom }">
      <button
        v-if="visible"
        type="button"
        @click="scrollToBottom()"
      >
        回到底部<span v-if="unread"> •</span>
      </button>
    </template>
  </AgentChatWorkspace>
</template>
```

几个关键点：

- `@send` 收到的 `payload.input` 已经把文本和附件合并好了，直接传给 `session.send(payload.input)` 即可
- `uploadFile()` 返回的最小结果只需要 `fileId`；如果你已经有对象存储地址或图片预览，也可以继续返回 `href` / `previewSrc`
- 默认自带 `conversation-tail`，当请求已经发出但新内容还没 append 到对话区时，会显示 3 个 loading dots
- 默认开启跟随到底部；用户自己往上滚之后不会被强制拉回去，有新内容时只会显示一个悬浮回底按钮
- 想手动控制时，可以通过 `ref` 调 `scrollToBottom()`、`scheduleScrollToBottom()`、`scheduleInitialBottomSync()`

```ts
import { ref } from 'vue';
import type { AgentChatWorkspaceExposed } from 'agentdown';

const workspaceRef = ref<AgentChatWorkspaceExposed | null>(null);

workspaceRef.value?.scrollToBottom('smooth');
```

## 已完成对话的回放 / 存档恢复

如果后端会在 run 完成后把结果存成 JSON，前端就不必再重放整段 SSE，可以直接恢复成 `RunSurface` 能渲染的 runtime。

Agentdown 内置推荐的通用 archive 外壳很简单：

```ts
type AgentdownRenderRecord = {
  event: string;
  role: string;
  content: unknown;
  created_at: number;
};

type AgentdownRenderArchive = {
  format: 'agentdown.session/v1';
  framework: string;
  status: string;
  updated_at: number;
  records: AgentdownRenderRecord[];
};
```

最短方式：

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
    },
    {
      event: 'tool',
      role: 'assistant',
      content: {
        name: 'lookup_weather',
        status: 'completed',
        result: {
          city: '北京',
          temperature: '22°C'
        }
      },
      created_at: 1770000000150
    }
  ]
};
</script>

<template>
  <AgentdownRenderArchiveSurface :input="archive" />
</template>
```

如果你的后端 records 结构不是内置这一套，也可以继续用：

- `defineAgentdownRecordsAdapter()`
- `useAgentdownRenderArchive()`
- `restoreAgentdownRenderArchive()`

## 某些非 UI 事件怎么处理

如果你想做“某个 SSE 事件来了，就执行一个副作用”，例如抓后端回传的 sessionId、标题、埋点或日志，可以继续叠加事件 action。

```ts
import { defineAgnoEventActions, useAgnoChatSession } from 'agentdown';

const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  conversationId: 'session:weather-demo',
  eventActions: defineAgnoEventActions({
    SessionCreated: {
      run({ event }) {
        console.log('raw agno event:', event);
      }
    }
  })
});
```

如果你想把“某个 SSE 事件来了，就渲染一个自定义组件”，现在也可以直接用：

- `defineAgnoEventComponents()`
- `defineLangChainEventComponents()`
- `defineAutoGenEventComponents()`
- `defineCrewAIEventComponents()`

配合 `composeProtocols()` 把“官方主协议”和“额外事件组件协议”组合起来即可。

## 更底层的 Agno 写法

如果你的页面已经有自己的一套 bridge / protocol / transport 组织方式，再用更底层的 `preset` / `adapter` 即可。

```ts
import {
  type AgnoEvent,
  createSseTransport,
  defineAgnoPreset,
  defineAgnoToolComponents,
  useBridgeTransport
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const agnoTools = defineAgnoToolComponents({
  lookup_weather: {
    match: 'lookup_weather',
    component: WeatherToolCard
  }
});

const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno 助手',
    toolRenderer: agnoTools.toolRenderer
  },
  surface: {
    renderers: agnoTools.renderers
  }
});

const { runtime, bridge, surface } = preset.createSession({
  bridge: {
    transport: createSseTransport<AgnoEvent, string>({
      mode: 'json',
      init() {
        return {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // 真实业务里这里通常来自用户输入。
          body: JSON.stringify({
            message: '帮我查一下北京天气'
          })
        };
      }
    })
  }
});

// `useBridgeTransport()` 负责 start / stop / status 这层页面状态。
const { start } = useBridgeTransport({
  bridge,
  source: 'http://127.0.0.1:8000/api/stream/agno'
});

// 启动后，Agno 原始事件会被 bridge 持续消费。
await start();
```

## 为什么它在流式场景下体验更稳定

### 1. 文本不是全部走 innerHTML

标题、普通段落，以及包含粗体、斜体、删除线、链接、行内代码的常见 inline 富文本，都会优先走 `@chenglou/pretext`。

### 2. markdown 不会一收到 token 就乱渲染

Agentdown 在 `stream -> assembler -> block` 这一步会尽量把未闭合结构先保留在 draft 态，避免半截 table、半截 code fence、半截公式直接出现在页面上。

### 3. 长文档不是一次性全挂进 DOM

`MarkdownRenderer` 支持：

- `textSlabChars`
- `virtualize`
- `virtualizeMargin`

`RunSurface` 支持：

- `groupWindow`
- `groupWindowStep`
- `lazyMount`
- `lazyMountMargin`
- `textSlabChars`

推荐配置：

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    textSlabChars: 1200,
    virtualize: true,
    virtualizeMargin: '1400px 0px'
  }"
/>

<RunSurface
  :runtime="runtime"
  :performance="{
    groupWindow: 80,
    groupWindowStep: 40,
    lazyMount: true,
    lazyMountMargin: '720px 0px',
    textSlabChars: 1600
  }"
/>
```

### 4. 当前内置性能实验室可直接导出 JSON

仓库 demo 里已经内置了“性能实验室”页面，可以直接复制 benchmark JSON 做优化前后对比。

一组当前参考数据，来自内置优化预设、Chrome 146、macOS：

- 大文档：`84,610` 字符、`963` 个 renderable block，首轮稳定耗时约 `124ms ~ 151ms`
- 超大文档：`169,870` 字符、`1,923` 个 renderable block，首轮稳定耗时约 `223ms ~ 280ms`
- 两组数据在运行中常驻挂载 block 都维持在约 `24` 个，滚动巡检峰值约 `53 ~ 56` 个

这不是绝对承诺值，但能说明当前优化主链已经生效，而且可观测。

## 仓库内置真实 FastAPI backend

仓库里的 `backend/` 已经不是 mock，而是真实框架联调 backend：

- `/api/stream/agno`
- `/api/stream/langchain`
- `/api/stream/autogen`
- `/api/stream/crewai`

启动方式：

```bash
cp backend/.env.example backend/.env
python3 backend/run.py
```

你需要在 `backend/.env` 里配置：

- `DEEPSEEK_API_KEY`
- 可选的 `DEEPSEEK_MODEL`
- 可选的 `DEEPSEEK_BASE_URL`

详细说明见 [backend/README.md](./backend/README.md)。

## 文档导航

- [快速开始](https://codexiaoke.github.io/agentdown/guide/getting-started)
- [核心概念](https://codexiaoke.github.io/agentdown/guide/core-concepts)
- [官方框架适配](https://codexiaoke.github.io/agentdown/guide/framework-adapters)
- [自定义协议接入](https://codexiaoke.github.io/agentdown/guide/custom-framework)
- [RunSurface](https://codexiaoke.github.io/agentdown/guide/run-surface)
- [流式 Markdown](https://codexiaoke.github.io/agentdown/guide/streaming-markdown)
- [性能优化](https://codexiaoke.github.io/agentdown/guide/performance)
- [FastAPI 后端接入](https://codexiaoke.github.io/agentdown/guide/backend-fastapi)
- [Runtime API](https://codexiaoke.github.io/agentdown/api/runtime)
- [RunSurface API](https://codexiaoke.github.io/agentdown/api/run-surface)
- [MarkdownRenderer API](https://codexiaoke.github.io/agentdown/api/markdown-renderer)
- [适配器 API](https://codexiaoke.github.io/agentdown/api/adapters)

## 开发命令

```bash
npm run dev
npm run docs:dev
npm run typecheck
npm test
npm run backend:dev
```

## License

MIT
