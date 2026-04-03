---
layout: home

hero:
  name: Agentdown
  text: Agent Native Markdown for Vue 3
  tagline: 用 markdown 渲染叙事层，用 AGUI runtime 驱动状态层，把一次 agent run 变成可阅读、可回放、可干预的界面。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: Runtime 协议
      link: /runtime/protocol
    - theme: alt
      text: GitHub
      link: https://github.com/codexiaoke/agentdown

features:
  - title: Narrative + State
    details: 同一份内容里同时表达 markdown 叙事层和 agent 节点状态层，适合 AI 对话、工具调用、多 agent 协作场景。
  - title: Pretext First
    details: 纯文本段落和标题优先走 pretext，既保留流式文本表现，也为复杂块级回退保留扩展空间。
  - title: AGUI Ready
    details: 支持 :::vue-component 注入运行态组件，用 ref 绑定 runtime，组件内部通过 hooks 直接读取节点状态、事件和子节点。
  - title: Design System Friendly
    details: 默认样式尽量克制，中性而不强制；text、code、mermaid、thought、html、agui 等内置组件都可以按需覆写。
---

<div class="ad-home-section">
  <h2>为什么它适合 Agent 前端</h2>
  <p>
    Agentdown 不是“再做一个 markdown renderer”，而是把 <code>内容层</code> 和 <code>状态层</code>
    合在一起：用户看到的不只是文本，还有 run、agent、tool、approval、artifact 的动态结构。
  </p>

  <div class="ad-home-grid">
    <div class="ad-home-card">
      <strong>内容仍然是 Markdown</strong>
      <p>长文本、解释、引用、表格、代码、图片、Mermaid、公式都可以自然写在内容里。</p>
    </div>
    <div class="ad-home-card">
      <strong>状态通过 Runtime 驱动</strong>
      <p>事件流会被归约成节点状态，再通过 ref 绑定回 AGUI 组件，形成真正响应式的 run UI。</p>
    </div>
    <div class="ad-home-card">
      <strong>组件接入学习成本低</strong>
      <p>大多数情况下只需要 <code>runtime.emit()</code>、<code>useAguiState()</code>、<code>useAguiEvents()</code>。</p>
    </div>
    <div class="ad-home-card">
      <strong>适合做产品，不只是 Demo</strong>
      <p>默认 UI 保持克制，你可以把代码块、思考块、AGUI 外壳全部接进自己的设计系统。</p>
    </div>
  </div>
</div>

<div class="ad-home-section">
  <h2>你会在这里用到的核心模块</h2>
  <div class="ad-inline-tokens">
    <span class="ad-inline-token">MarkdownRenderer</span>
    <span class="ad-inline-token">createAguiRuntime()</span>
    <span class="ad-inline-token">runtime.emit()</span>
    <span class="ad-inline-token">useAguiState()</span>
    <span class="ad-inline-token">useAguiEvents()</span>
    <span class="ad-inline-token">:::vue-component</span>
    <span class="ad-inline-token">```mermaid</span>
    <span class="ad-inline-token">builtinComponents</span>
  </div>

  <div class="ad-callout">
    <strong>推荐阅读顺序：</strong>
    先看「快速开始」，再看「Markdown 渲染」和「AGUI Runtime 概览」，最后进入 API 与 FAQ。
  </div>
</div>

<div class="ad-home-section">
  <h2>一个最小工作流</h2>

```vue
<script setup lang="ts">
import { MarkdownRenderer, createAguiRuntime, runStarted, toolStarted } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

const runtime = createAguiRuntime();

const source = `
# 智能报价助手

:::vue-component DemoRunBoard {"ref":"run:pricing"}

\`\`\`mermaid
flowchart LR
  User[用户] --> Agent[报价 Agent]
  Agent --> Tool[pricing.lookup]
\`\`\`
`;

runtime.emit(runStarted({
  nodeId: 'run:pricing',
  title: '报价运行'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:lookup',
  parentId: 'run:pricing',
  toolName: 'pricing.lookup',
  title: '查询价格库'
}));
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :agui-runtime="runtime"
    :agui-components="{ DemoRunBoard }"
  />
</template>
```
</div>
