---
layout: home

hero:
  name: Agentdown
  text: Streaming Agent UI for Vue 3
  tagline: 用 markdown 渲染叙事层，用 Protocol + Bridge + Runtime 驱动交互层，把后端流式事件变成真正的 Agent UI。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 协议映射
      link: /runtime/protocol
    - theme: alt
      text: GitHub
      link: https://github.com/codexiaoke/agentdown

features:
  - title: Protocol-Agnostic
    details: 不绑定 Agno、LangGraph 或任何固定后端格式，开发者自己定义映射规则即可接入。
  - title: Streaming-First
    details: 通过 assembler 处理 token 流，尽量避免半截表格、代码块、公式和复杂结构提前乱渲染。
  - title: AGUI Ready
    details: 工具调用、产物、审批和自定义 Vue 组件都可以成为 block，而不只是纯文本附属品。
  - title: Design System Friendly
    details: 默认样式尽量克制，中性不强制；内置 block 组件都可以按需覆写。
---

<div class="ad-home-section">
  <h2>为什么它适合 Agent 前端</h2>
  <p>
    Agentdown 不是“再做一个 markdown renderer”，而是把 <code>raw packet</code> 到 <code>interactive UI</code>
    之间最重复、最容易出错的一段链路收敛起来。
  </p>

  <div class="ad-home-grid">
    <div class="ad-home-card">
      <strong>内容仍然是 Markdown</strong>
      <p>长文本、解释、引用、表格、代码、图片、Mermaid、公式都可以自然写在内容里。</p>
    </div>
    <div class="ad-home-card">
      <strong>状态通过 Runtime 驱动</strong>
      <p>tool、artifact、approval、自定义 widget 都可以变成稳定 block，并随着命令持续更新。</p>
    </div>
    <div class="ad-home-card">
      <strong>后端协议不必统一</strong>
      <p>你可以把 <code>content.append</code>、<code>tool.finish</code>、<code>artifact.upsert</code> 这些自定义事件映射成统一命令。</p>
    </div>
    <div class="ad-home-card">
      <strong>适合做产品，不只是 Demo</strong>
      <p>默认 UI 保持克制，你可以把代码块、思考块、自定义工具卡片全部接进自己的设计系统。</p>
    </div>
  </div>
</div>

<div class="ad-home-section">
  <h2>你会在这里用到的核心模块</h2>
  <div class="ad-inline-tokens">
    <span class="ad-inline-token">MarkdownRenderer</span>
    <span class="ad-inline-token">createAgentRuntime()</span>
    <span class="ad-inline-token">defineProtocol()</span>
    <span class="ad-inline-token">when()</span>
    <span class="ad-inline-token">createBridge()</span>
    <span class="ad-inline-token">createMarkdownAssembler()</span>
    <span class="ad-inline-token">:::vue-component</span>
    <span class="ad-inline-token">cmd.block.upsert()</span>
    <span class="ad-inline-token">builtinComponents</span>
  </div>

  <div class="ad-callout">
    <strong>推荐阅读顺序：</strong>
    先看「快速开始」，再看「Runtime 概览」和「协议映射」，最后进入 API 与 FAQ。
  </div>
</div>

<div class="ad-home-section">
  <h2>一个最小工作流</h2>

```ts
import {
  cmd,
  createAgentRuntime,
  createBridge,
  createMarkdownAssembler,
  defineProtocol,
  when
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

const runtime = createAgentRuntime();

const protocol = defineProtocol<Packet>([
  when(
    (packet): packet is Extract<Packet, { event: 'RunContent' }> => packet.event === 'RunContent',
    ({ event, context }) => [
      cmd.stream.open({
        streamId: 'stream:main',
        slot: 'main',
        assembler: 'markdown',
        data: {
          blockId: 'block:answer'
        }
      }),
      cmd.stream.delta('stream:main', event.text),
      cmd.stream.close('stream:main')
    ],
    'run-content'
  )
]);

const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

bridge.push({ event: 'RunContent', text: '我来为你查询天气' });
```
</div>
