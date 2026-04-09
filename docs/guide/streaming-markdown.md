---
title: 流式 Markdown
description: 让 token 流进入稳定的 markdown 渲染，而不是把半截结构直接画到页面上。
---

# 流式 Markdown

Agent 的输出通常不是一次性返回，而是 token 流。

如果前端把这些 token 直接拼进 DOM，就会出现很差的体验：

- 半截表格先渲染成乱码
- fenced code block 没闭合就提前落成错误结构
- HTML / markdown 结构反复抖动

Agentdown 的处理方式是：

把流式文本先交给 assembler，再决定什么时候真正渲染成稳定 block。

## 默认用 `createMarkdownAssembler()`

```ts
import {
  createMarkdownAssembler,
  defineEventProtocol,
  useSseBridge
} from 'agentdown';

const protocol = defineEventProtocol({
  content: (event) => ({
    type: 'content.append',
    id: 'stream:assistant',
    content: event.text
  })
});

const session = useSseBridge({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
```

## draft 和 stable

流式 markdown 不是“来了就立刻渲染”，而是有两个状态：

| 状态 | 含义 |
| --- | --- |
| `draft` | 内容还在增长，结构可能不完整 |
| `stable` | 内容足够稳定，可以作为正式 block 落地 |

典型规则：

- 表头没完整，不渲染 table
- fenced code block 没闭合，不渲染 code block
- 某些复杂 inline / html 结构没稳定，不强行提前渲染

## 本地 token 流例子

```ts
import {
  createMarkdownAssembler,
  defineEventProtocol,
  useAsyncIterableBridge
} from 'agentdown';

type Packet = {
  event: 'token';
  text: string;
};

async function* createTokenStream(): AsyncIterable<Packet> {
  const tokens = [
    { event: 'token', text: '# 标题\\n\\n' },
    { event: 'token', text: '| 城市 | 天气 |\\n' },
    { event: 'token', text: '| --- | --- |\\n' },
    { event: 'token', text: '| 北京 | 晴 |\\n' }
  ] as const;

  for (const token of tokens) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    yield token;
  }
}

const session = useAsyncIterableBridge<Packet>({
  source: createTokenStream(),
  protocol: defineEventProtocol<Packet>({
    token: (event) => ({
      type: 'content.append',
      id: 'stream:assistant',
      content: event.text
    })
  }),
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
```

## `MarkdownRenderer` 也有窗口化

如果你是在“长文阅读”场景，而不是聊天 surface，也可以直接把完整 markdown 丢给 `MarkdownRenderer`。

它本身也带：

- text slab
- markdown windowing
- telemetry

所以它并不只是一个“parse 一次然后全量渲染”的组件。

## HTML 安全

`MarkdownRenderer` 默认 `allowUnsafeHtml = false`。

也就是说：

- 原生 HTML 默认不会直接无条件注入
- 更复杂的 HTML 会优先走 safe fallback / block 渲染

如果你的场景确实要开放不安全 HTML，再显式打开。

## 调试 draft 阶段

开发阶段如果你想看“为什么这段内容还没 stable”，可以配合：

- `RunSurfaceDraftOverlay`
- Agent Devtools

这对表格、代码块、长列表这些结构特别有用。
