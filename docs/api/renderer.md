---
title: MarkdownRenderer
description: MarkdownRenderer 的 props、用途和常见接法。
---

# MarkdownRenderer

`MarkdownRenderer` 是 Agentdown 的主入口组件。  
它负责把 markdown 解析成 block 列表，并分发给对应的内置或自定义组件。

## 最小用法

```vue
<MarkdownRenderer :source="source" />
```

## Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `source` | `string` | 必填 | 要渲染的 markdown 源文本 |
| `lineHeight` | `number` | `26` | pretext 文本块的行高 |
| `font` | `string` | `400 16px "Helvetica Neue"` | pretext 布局使用的字体描述 |
| `thoughtTitle` | `string` | `Thought Process` | `:::thought` 默认标题 |
| `aguiComponents` | `AguiComponentMap` | `{}` | 可被 `:::vue-component` 引用的组件映射表 |
| `builtinComponents` | `MarkdownBuiltinComponentOverrides` | `{}` | 覆写默认 block 组件 |
| `aguiRuntime` | `AguiRuntime \| null` | `null` | AGUI 运行态实例 |
| `plugins` | `MarkdownEnginePlugin[]` | `[]` | 额外注入到 `markdown-it` 的插件 |

## 对外行为

`MarkdownRenderer` 会：

1. 在 `source` 变化时重新解析 block
2. 在容器宽度变化时重新计算 pretext 文本布局
3. 通过 `provide(AGUI_RUNTIME_KEY, aguiRuntime)` 把 runtime 注入到 AGUI wrapper

## 最常见的组合写法

```vue
<MarkdownRenderer
  :source="source"
  :agui-runtime="runtime"
  :agui-components="aguiComponents"
  :builtin-components="builtinComponents"
/>
```

## 什么时候需要传 `lineHeight` 和 `font`

只有当你真的在意 pretext 文本测量与产品字体完全一致时，才需要主动传。

例如：

```vue
<MarkdownRenderer
  :source="source"
  font='400 15px "Avenir Next"'
  :line-height="24"
/>
```

## 相关导出

除了 `MarkdownRenderer`，包入口还导出了这些默认组件，方便你做包裹式覆写：

- `DefaultMarkdownTextBlock`
- `DefaultMarkdownCodeBlock`
- `DefaultMarkdownMermaidBlock`
- `DefaultMarkdownMathBlock`
- `DefaultMarkdownThoughtBlock`
- `DefaultMarkdownHtmlBlock`
- `DefaultMarkdownAguiBlock`

如果你只想在默认实现上加一层埋点、样式或布局，优先复用这些组件会比较省力。
