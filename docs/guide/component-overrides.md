---
title: 组件覆写
description: 用自己的 Design System 替换 Agentdown 的默认 block 组件与自定义 Vue 组件外壳。
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
  artifact: Component;
  approval: Component;
  timeline: Component;
}>
```

## 最常见的覆写方式

```vue
<script setup lang="ts">
import {
  MarkdownRenderer,
  DefaultMarkdownMermaidBlock,
  type MarkdownBuiltinComponentOverrides
} from 'agentdown';

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
5. `timeline`
6. `approval`
7. `artifact`
8. `mermaid`

原因很简单：这几个模块最容易直接暴露产品气质。

## 覆写 AGUI 外壳时要知道的事

默认 `AguiComponentWrapper` 做了四件关键事情：

1. 按名称从 `aguiComponents` 中解析真实组件
2. 透传 markdown 指令中声明的 props
3. 处理最小高度占位
4. 在找不到组件时给出明确占位提示

如果你完全重写 `agui` 组件，建议至少保留这四层能力，这样 markdown 里的自定义组件接入会更顺手。

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

## 运行中的值怎么传进自定义组件

当前版本不再自动提供旧式 runtime hooks。  
更推荐的做法有两种：

### 1. 静态 props 走 `:::vue-component`

```md
:::vue-component WeatherCard {"city":"北京","condition":"晴"}
```

### 2. 运行态数据走 `block.data`

也就是：

- 后端事件先映射成 `cmd.block.upsert()` / `cmd.block.patch()`
- 你的 UI 层按 `renderer` 渲染对应组件
- 组件从 `block.data` 中读取当前值

这更适合工具卡片、artifact、approval 这类持续更新的交互块。

## 一条很实用的原则

让 Agentdown 负责协议和结构，让你的 Design System 负责视觉和交互。  
这样项目会比“全自己写”快很多，也比“完全吃默认样式”更像一个产品。
