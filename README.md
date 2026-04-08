# Agentdown

语言导航：**中文** | [English](./README.en.md)

Agentdown 是一个面向流式输出的 Agent Markdown UI Runtime，基于 Vue 3 构建。  
它把 markdown 渲染、流式协议映射、运行态状态树和可交互组件组合在一起，让 Agent 的输出不再只是纯文本。

[在线文档](https://codexiaoke.github.io/agentdown/)

## 一句话理解

```text
raw packet / SSE -> protocol -> bridge -> assembler -> runtime -> Agent UI
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

| 框架 | 推荐入口 | 流式文本 | 工具卡片 | 内置操作审批 | 说明 |
| --- | --- | --- |
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
- [框架能力矩阵](https://codexiaoke.github.io/agentdown/guide/framework-capability-matrix)

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

对 Agno、LangChain、AutoGen、CrewAI，优先用内置 preset。  
下面这个例子是 Agno，其他框架的写法完全同一套思路。

```ts
import {
  type AgnoEvent,
  // 用官方 Agno 事件直接做 SSE 请求。
  createSseTransport,
  // preset 会把 protocol、assembler 和 surface 默认配置收起来。
  defineAgnoPreset,
  // 让“工具名 -> 组件”的配置只维护一份。
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 命中 weather/天气 的工具名时，渲染成天气卡片。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// 创建一个 Agno preset，后面页面里直接复用即可。
const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno 助手',
    toolRenderer: agnoTools.toolRenderer
  },
  surface: {
    renderers: agnoTools.renderers
  }
});

// 一次性拿到 runtime、bridge 和可直接传给 RunSurface 的 surface 配置。
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
```

```ts
import { useBridgeTransport } from 'agentdown';

// `useBridgeTransport()` 负责 start / stop / status 这层页面状态。
const { start } = useBridgeTransport({
  bridge,
  source: 'http://127.0.0.1:8000/api/stream/agno'
});

// 启动后，Agno 原始事件会被 bridge 持续消费。
await start();
```

```vue
<RunSurface
  :runtime="runtime"
  v-bind="surface"
/>
```

如果你想做“某个 SSE 事件来了，就渲染一个自定义组件”，现在也可以直接用：

- `defineAgnoEventComponents()`
- `defineLangChainEventComponents()`
- `defineAutoGenEventComponents()`
- `defineCrewAIEventComponents()`

配合 `composeProtocols()` 把“官方主协议”和“额外事件组件协议”组合起来即可。

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
- [官方框架适配](https://codexiaoke.github.io/agentdown/guide/framework-adapters)
- [Agno 深入接入](https://codexiaoke.github.io/agentdown/guide/agno-adapter)
- [Markdown 渲染](https://codexiaoke.github.io/agentdown/guide/markdown-rendering)
- [性能优化](https://codexiaoke.github.io/agentdown/guide/performance)
- [Runtime 概览](https://codexiaoke.github.io/agentdown/runtime/overview)
- [协议映射](https://codexiaoke.github.io/agentdown/runtime/protocol)
- [RunSurface API](https://codexiaoke.github.io/agentdown/api/run-surface)

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
