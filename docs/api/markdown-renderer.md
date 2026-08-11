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
| `allowUnsafeHtml` | `boolean` | `false` | 是否允许解析原始 HTML；允许后仍会净化 |
| `htmlSanitizer` | `MarkdownHtmlSanitizer` | DOMPurify | 替换原始 HTML 的净化策略 |
| `componentRegistry` | `AgentComponentRegistry` | `{}` | `:::vue-component` 可用的受控组件注册表 |
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
- `component`
- `artifact`
- `approval`
- `handoff`

如果要换外观，优先改 `builtinComponents`。

## HTML 安全边界

默认不解析原始 HTML。即使显式开启 `allowUnsafeHtml`，Agentdown 也不会
把这部分内容直接交给 `v-html`，而是先经过 DOMPurify：

- 移除 script、事件属性和危险 URL
- 禁止 style、iframe、object、embed、form 和 `srcdoc`
- 浏览器不支持 sanitizer 或 SSR 阶段时 fail closed
- Runtime 传入的 HTML 永远按不可信内容处理，不能自行声明为可信

如果宿主已有统一安全策略，可以注入自己的 sanitizer：

```vue
<MarkdownRenderer
  :source="agentOutput"
  allow-unsafe-html
  :html-sanitizer="(html, context) => companySanitizer(html, context)"
/>
```

自定义 sanitizer 是安全边界的一部分，应返回已经净化的 HTML。不要用
`html => html` 绕过这一层。内容安全策略（CSP）仍应保持严格，不能把
sanitizer 当作允许 `unsafe-eval` 或任意脚本来源的理由。
