---
title: 组件覆写
description: 用自己的 Design System 替换 Agentdown 的默认代码块、思考块、HTML 块和 AGUI 外壳。
---

# 组件覆写

Agentdown 的默认 UI 是“可以直接用，但不强迫你接受”的思路。  
如果你已经有自己的 Design System，最推荐的接法就是覆写内置组件。

## 可覆写的 key

```ts
type MarkdownBuiltinComponentOverrides = Partial<{
  text: Component;
  code: Component;
  mermaid: Component;
  math: Component;
  thought: Component;
  html: Component;
  agui: Component;
}>
```

## 最常见的覆写方式

```vue
<script setup lang="ts">
import {
  MarkdownRenderer,
  DefaultMarkdownMermaidBlock,
  type MarkdownBuiltinComponentOverrides
} from '@codexiaoke/agentdown';

import MyCodeBlock from './MyCodeBlock.vue';
import MyThoughtBlock from './MyThoughtBlock.vue';
import MyAguiShell from './MyAguiShell.vue';

const builtinComponents: MarkdownBuiltinComponentOverrides = {
  code: MyCodeBlock,
  thought: MyThoughtBlock,
  agui: MyAguiShell
};
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :builtin-components="builtinComponents"
  />
</template>
```

## 推荐的覆写优先级

1. `code`
2. `thought`
3. `html`
4. `agui`
5. `mermaid`

原因很简单：这几个模块最容易直接暴露产品气质。

## 覆写 AGUI 外壳时要知道的事

默认 `AguiComponentWrapper` 做了四件关键事情：

1. 按名称从 `aguiComponents` 中解析真实组件
2. 读取 markdown 里的 `ref`
3. 自动把 `ref` 绑定到 `runtime.binding(ref)`
4. 通过 provide/inject 暴露 `useAguiState()`、`useAguiEvents()` 等 hooks 所需上下文

如果你完全重写 `agui` 组件，建议保留这四层能力，不然内部组件就只能吃 props，没法直接用 hooks。

## `aguiComponents` 的两种注册方式

### 简写

```ts
const aguiComponents = {
  DemoRunBoard
};
```

### 完整写法

```ts
const aguiComponents = {
  DemoRunBoard: {
    component: DemoRunBoard,
    minHeight: 128
  }
};
```

`minHeight` 用来控制 markdown 里 AGUI block 的初始占位高度，避免布局在异步状态更新时抖动得太厉害。

## 组件内部拿状态的两种方式

### 推荐：直接用 hooks

```ts
const state = useAguiState<AgentNodeState>();
const events = useAguiEvents();
```

### 兼容：读取 wrapper 透传 props

默认 wrapper 也会把这些值透传给实际组件：

- `agui`
- `aguiRefId`
- `aguiState`
- `aguiChildren`
- `aguiEvents`
- `aguiRuntime`

如果你希望组件在普通页面和 AGUI 场景里复用，这种写法会更柔和。

## 一条很实用的原则

让 Agentdown 负责协议和结构，让你的 Design System 负责视觉和交互。  
这样项目会比“全自己写”快很多，也比“完全吃默认样式”更像一个产品。
