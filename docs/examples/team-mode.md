---
title: SSE 天气示例
description: 用 Agentdown 把一段简单 SSE JSON 流映射成聊天文本和工具卡片。
---

# SSE 天气示例

这是当前 demo 里最小但最真实的一条链路：

- 文本流先显示一句话
- 工具调用开始时渲染天气组件
- 工具调用结束时更新天气值

## 假设后端返回的包

```ts
type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };
```

## 映射规则

```ts
const protocol = defineProtocol<Packet>([
  when(
    (packet): packet is Extract<Packet, { event: 'RunContent' }> => packet.event === 'RunContent',
    ({ event }) => [
      cmd.stream.open({
        streamId: 'stream:weather',
        slot: 'main',
        assembler: 'markdown'
      }),
      cmd.stream.delta('stream:weather', event.text),
      cmd.stream.close('stream:weather')
    ]
  ),
  when(
    (packet): packet is Extract<Packet, { event: 'ToolCall' }> => packet.event === 'ToolCall',
    ({ event, context }) =>
      cmd.tool.start({
        id: event.id,
        title: event.name,
        renderer: 'tool.weather',
        at: context.now()
      })
  ),
  when(
    (packet): packet is Extract<Packet, { event: 'ToolCompleted' }> => packet.event === 'ToolCompleted',
    ({ event, context }) =>
      cmd.tool.finish({
        id: event.id,
        title: event.name,
        result: event.content,
        at: context.now()
      })
  )
]);
```

## 一次推入的数据

```ts
bridge.push([
  { event: 'RunContent', text: '我来为你查询天气' },
  { event: 'ToolCall', id: 'tool:weather', name: '查询天气' },
  {
    event: 'ToolCompleted',
    id: 'tool:weather',
    name: '查询天气',
    content: { city: '北京', condition: '晴', tempC: 26 }
  }
]);
```

## 最后会发生什么

- 文本区出现“我来为你查询天气”
- 自定义天气工具卡片先显示加载中
- 工具返回后，卡片更新成最终天气结果

如果你还没写自定义天气组件，也可以先省略 `renderer: 'tool.weather'`，
让它落到内置默认 `tool` renderer。
