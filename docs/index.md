---
layout: home

hero:
  name: Agentdown
  text: Streaming Agent UI Runtime for Vue 3
  tagline: 用 Markdown 渲染叙事层，用 Protocol + Bridge + Runtime 接住真实 Agent 事件流，把纯文本输出升级成真正的交互界面。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 官方适配器
      link: /guide/framework-adapters
    - theme: alt
      text: 性能优化
      link: /guide/performance
    - theme: alt
      text: GitHub
      link: https://github.com/codexiaoke/agentdown

features:
  - title: 协议不强绑
    details: "后端返回什么事件，就映射什么事件。Agentdown 不要求你为了前端再设计一套统一后端协议。"
  - title: 流式优先
    details: "通过 assembler 和 draft/stable block，把 token 流收敛成更稳定的 UI，而不是一到 token 就乱渲染。"
  - title: Agent 原生 UI
    details: "工具调用、产物、审批和自定义组件都可以成为一等 block，而不是只能附着在纯文本后面。"
  - title: 官方框架适配
    details: "当前已内置 Agno、LangChain、AutoGen、CrewAI 的前端适配层，直接消费官方事件。"
  - title: 性能主链
    details: "内置 pretext、长文本 slab、长文窗口化、聊天分组窗口和重型 block lazy mount。"
  - title: 设计系统友好
    details: "`builtinComponents`、`renderers`、`messageShells` 都可以覆写，默认样式尽量克制。"
---

## 这不是又一个 Markdown Renderer

Agentdown 的重点不是“把 markdown 显示出来”，而是把这一整段链路收敛起来：

```text
raw packet / SSE -> protocol -> bridge -> assembler -> runtime -> Agent UI
```

它特别适合下面这类页面：

- 聊天式 Agent 界面
- 有工具卡片、artifact、approval 的运行态页面
- 需要边输出边更新的 markdown 长文
- 后端来自 Agno、LangChain、AutoGen、CrewAI 或你自己的 SSE 协议

## 你可以拿它做什么

- 用 `MarkdownRenderer` 先渲染静态或一次性 markdown 内容
- 用 `RunSurface` 把 runtime 里的 block 渲染成聊天界面
- 用 `defineEventProtocol()` 适配任意自定义后端事件
- 用官方 preset 直接接真实框架事件
- 用 `define*ToolComponents()` 按工具名挂接自定义卡片
- 用 `define*EventComponents()` 在特定 SSE 事件到来时直接渲染组件

## 当前官方适配器

| 框架 | 入口 | 适合什么场景 |
| --- | --- | --- |
| Agno | `createAgnoProtocol()` / `defineAgnoPreset()` | 想直接消费官方 Agno SSE 事件 |
| LangChain | `createLangChainProtocol()` / `defineLangChainPreset()` | 想直接消费 `astream_events()` |
| AutoGen | `createAutoGenProtocol()` / `defineAutoGenPreset()` | 想消费官方 `run_stream()` 事件 |
| CrewAI | `createCrewAIProtocol()` / `defineCrewAIPreset()` | 想消费官方 SSE chunk 和最终 `CrewOutput` |

它们都遵循同一个原则：

- 不要求后端包成 Agentdown 专属 JSON
- 不要求你把框架事件二次统一
- 前端直接适配官方事件，再按需覆写 UI

## 推荐接入顺序

1. 先用 [快速开始](/guide/getting-started) 跑通 `MarkdownRenderer`。
2. 如果后端是自定义 SSE，就用 `defineEventProtocol()` 接入。
3. 如果后端是主流框架，就直接用 [官方框架适配](/guide/framework-adapters)。
4. 最后再根据设计系统覆写 `builtinComponents`、`renderers` 和 `messageShells`。

## 性能为什么是主链能力

Agentdown 从一开始就假设你会遇到这些问题：

- 长文本持续流式输出
- 文本和大组件混排
- 文档很长
- 会话很长
- 不能让浏览器一次性挂满 DOM

所以它默认提供：

- pretext 文本渲染
- markdown draft/stable 稳定化
- `textSlabChars`
- `virtualize`
- `groupWindow`
- `lazyMount`
- `@telemetry`
- 内置性能实验室 demo

详情见 [性能优化](/guide/performance)。

## 一个最小工作流

```ts
import {
  // `cmd` is the helper layer used by protocols to create runtime commands.
  cmd,
  // Runtime stores nodes, blocks, intents, and history.
  createAgentRuntime,
  // Bridge wires protocol mapping and stream assembly together.
  createBridge,
  // Markdown assembler stabilizes streaming markdown blocks.
  createMarkdownAssembler,
  // The lightest way to map event-based packets.
  defineEventProtocol
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

// Create one runtime for the whole conversation/session.
const runtime = createAgentRuntime();

// Map backend packets into runtime commands.
const protocol = defineEventProtocol<Packet>({
  // Stream assistant text into a markdown block.
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ],
  // Close the stream when this answer is done.
  RunCompleted: () => cmd.content.close('stream:assistant'),
  // Insert a tool block when the tool starts.
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      at: context.now()
    }),
  // Update that same tool block with the final payload.
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

// Bridge is where protocol mapping and stream assembly actually run.
const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
```

## 下一步阅读

- [快速开始](/guide/getting-started)
- [官方框架适配](/guide/framework-adapters)
- [Markdown 渲染](/guide/markdown-rendering)
- [Runtime 概览](/runtime/overview)
- [协议映射](/runtime/protocol)
