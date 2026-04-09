---
title: MarkdownRenderer
description: MarkdownRenderer 的主要 props、性能选项和安全策略。
---

# MarkdownRenderer

`MarkdownRenderer` 负责 markdown 叙事层渲染。

它适合：

- 静态 markdown
- 一次性生成结果
- 长文阅读
- 不需要 runtime 的展示页

## 最小用法

```vue
<MarkdownRenderer :source="source" />
```

## 主要 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `source` | `string` | 必填 | 当前 markdown 内容 |
| `lineHeight` | `number` | `26` | 文本行高 |
| `font` | `string` | 内置默认字体 | pretext 文本布局用的字体描述 |
| `thoughtTitle` | `string` | `'Thought Process'` | `:::thought` 默认标题 |
| `allowUnsafeHtml` | `boolean` | `false` | 是否允许不安全 HTML |
| `aguiComponents` | `AguiComponentMap` | `{}` | `:::vue-component` 可用组件表 |
| `builtinComponents` | `MarkdownBuiltinComponentOverrides` | `{}` | 覆写内置 markdown block 组件 |
| `plugins` | `MarkdownEnginePlugin[]` | `[]` | 额外 markdown-it 插件 |
| `performance` | `MarkdownRendererPerformanceOptions` | `{}` | 长文和窗口化性能配置 |

## `performance`

最常用的几个字段：

| 字段 | 说明 |
| --- | --- |
| `textSlabChars` | 把超长文本块切成更小片段 |
| `virtualize` | 是否开启长文窗口化 |
| `virtualizeMargin` | 视口上下预热范围 |

## `@telemetry`

`MarkdownRenderer` 会发出 `telemetry` 事件。

```vue
<MarkdownRenderer
  :source="source"
  @telemetry="snapshot => {
    console.log(snapshot.mountedBlockCount);
  }"
/>
```

你最常看的字段通常是：

- `parsedBlockCount`
- `renderableBlockCount`
- `mountedBlockCount`
- `virtualized`
- `viewportSyncPasses`

## 默认支持的 block

- `text`
- `html`
- `code`
- `mermaid`
- `math`
- `thought`
- `agui`
- `artifact`
- `approval`
- `handoff`

如果要换外观，优先改 `builtinComponents`。
