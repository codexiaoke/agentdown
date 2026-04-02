# Agentdown

`Agentdown` 是一个面向 Vue 3 的 agent-native markdown UI runtime，目标是把 `markdown-it` 的结构化解析能力、`@chenglou/pretext` 的高性能文本布局能力，以及 AGUI 组件注入组合起来，服务 AI 长文本、流式输出、工具调用和多 agent 协作场景。

## 当前首版包含什么

- `Vue 3 + Vite + TypeScript` 的 npm 库工程
- `MarkdownRenderer` 组件
- `@chenglou/pretext` 纯文本段落/标题布局
- `markdown-it` 解析链路
- `:::thought` 折叠块
- `:::vue-component ComponentName {...}` AGUI 组件注入
- 响应式 AGUI runtime 与事件流
- 自定义 AGUI reducer
- `Shiki` 代码高亮
- `KaTeX` 块级公式渲染
- 本地 demo 页面

## 安装

```bash
npm install @codexiaoke/agentdown
```

```ts
import { MarkdownRenderer } from '@codexiaoke/agentdown';
import '@codexiaoke/agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 使用

```vue
<script setup lang="ts">
import { MarkdownRenderer } from '@codexiaoke/agentdown';
import '@codexiaoke/agentdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Hello

:::thought
这是可以折叠的思考过程。
:::

:::vue-component ApprovalCard {"id": 1, "status": "pending"}
`;

const aguiComponents = {
  ApprovalCard: {
    component: ApprovalCard,
    minHeight: 96
  }
};
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :agui-components="aguiComponents"
  />
</template>
```

## AGUI 语法

```md
:::vue-component ApprovalCard {"id": 1, "status": "pending"}
```

也支持简单的 key-value 形式：

```md
:::vue-component ApprovalCard id=1 status="pending"
```

## AGUI Runtime

```ts
import {
  createAguiRuntime,
  useAguiEvents,
  useAguiState,
  type AgentNodeState
} from '@codexiaoke/agentdown';

const runtime = createAguiRuntime({
  reducer: ({ event, previousState }) => {
    if (event.type === 'agent.blocked') {
      return {
        patch: {
          kind: previousState?.kind ?? 'agent',
          status: 'waiting_tool',
          message: event.message ?? 'Waiting for downstream tool output.'
        }
      };
    }
  }
});

runtime.emit({
  type: 'agent.blocked',
  nodeId: 'node:agent-1',
  message: 'Waiting for pricing.lookup'
});
```

在 AGUI 组件内部，推荐直接使用细粒度 hooks：

```ts
const state = useAguiState<AgentNodeState>();
const events = useAguiEvents();
```

说明：

- `runtime.emit(event)` 会先记录事件，再把事件归约成节点状态
- 内置事件如 `run.started`、`agent.started`、`tool.finished` 会自动更新状态
- 自定义事件如 `agent.blocked` 可以通过 `reducer` 映射成你自己的状态语义
- 如果两个组件使用相同的 `ref`，它们会共享同一份 runtime binding

## 设计约束

- 纯文本段落和标题优先走 `pretext`
- 含有复杂行内标记的块会先回退到 HTML 渲染
- 复杂块元素如列表、引用、表格目前也先回退到 HTML 渲染
- AGUI 当前首版支持块级组件注入

## 开发

```bash
npm install
npm run dev
```

## 后续路线

1. 把 AGUI runtime 从 demo 能力收敛成稳定的公开 API，并补齐更多 reducer / node schema 示例。
2. 把更多 Markdown block 和 inline token 接入精细化布局树。
3. 增加流式输出优化、事件驱动状态流和多 agent 视图。
4. 补齐测试、文档站和 CI 发布流程。
