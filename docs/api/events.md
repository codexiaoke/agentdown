---
title: 协议辅助函数
description: defineProtocol、when 和 cmd 的用法说明。
---

# 协议辅助函数

## `defineProtocol()`

```ts
const protocol = defineProtocol<Packet>([
  // rules
])
```

它接收一组规则，并把原始包映射成统一命令。

## `when()`

```ts
when(match, map, name?)
```

它是一个类型友好的 helper，适合配合 TypeScript 的类型守卫使用。

示例：

```ts
type Packet =
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

function isToolCall(packet: Packet): packet is Extract<Packet, { event: 'ToolCall' }> {
  return packet.event === 'ToolCall';
}

const rule = when(
  isToolCall,
  ({ event, context }) =>
    cmd.node.upsert({
      id: event.id,
      type: 'tool',
      status: 'running',
      title: event.name,
      data: {
        createdAt: context.now()
      }
    }),
  'tool-call'
);
```

## `defineHelperProtocol()`

```ts
const protocol = defineHelperProtocol<Packet, 'type'>({
  eventKey: 'type',
  defaults: {
    'content.replace': {
      kind: 'markdown'
    }
  },
  bindings: {
    'content.replace': {
      on: 'content.replace',
      resolve: (event) => ({
        id: event.blockId,
        groupId: event.groupId,
        content: event.markdown
      })
    },
    'tool.finish': {
      on: 'tool.finish',
      resolve: (event) => ({
        id: event.toolId,
        title: event.name,
        result: event.payload
      })
    }
  }
});
```

它适合“语义事件名已经固定”的项目，可以少写很多 `cmd.*` 样板。

## `createHelperProtocolFactory()`

```ts
const factory = createHelperProtocolFactory<Packet, 'type'>({
  eventKey: 'type',
  defaults: {
    'tool.start': {
      renderer: 'tool.weather'
    }
  },
  bindings: {
    'tool.start': {
      on: 'tool.start',
      resolve: (event) => ({
        id: event.toolId,
        title: event.label
      })
    }
  }
});

const protocol = factory.createProtocol();
```

它适合全局定义一套规范，再在不同 preset 或页面里复用。

## `cmd`

`cmd` 用来构造标准命令对象。

### `cmd.node.*`

- `cmd.node.upsert(node)`
- `cmd.node.patch(id, patch)`
- `cmd.node.remove(id)`

### `cmd.block.*`

- `cmd.block.insert(block, options?)`
- `cmd.block.upsert(block)`
- `cmd.block.patch(id, patch)`
- `cmd.block.remove(id)`

### `cmd.stream.*`

- `cmd.stream.open(command)`
- `cmd.stream.delta(streamId, text)`
- `cmd.stream.write(streamId, text)`
- `cmd.stream.close(streamId)`
- `cmd.stream.end(streamId)`
- `cmd.stream.abort(streamId, reason?)`

### `cmd.event.record()`

用来把原始事件或调试信息记录进 runtime history。

### 常用高阶 helper

- `cmd.run.start(input)`
- `cmd.run.finish(input)`
- `cmd.content.open(input)`
- `cmd.content.append(streamId, text)`
- `cmd.content.replace(input)`
- `cmd.content.close(streamId)`
- `cmd.tool.start(input)`
- `cmd.tool.update(input)`
- `cmd.tool.finish(input)`
- `cmd.artifact.upsert(input)`
- `cmd.approval.update(input)`
- `cmd.node.error(input)`

这些 helper 不是 core protocol 的强制语义，而是为了让协议映射层少写重复样板。

其中 `cmd.tool.start()` 如果没有传 `renderer`，默认会使用 `renderer: 'tool'`，
并由 `RunSurface` 的内置默认工具卡片渲染出来。

## 一条建议

把“后端长什么样”留在 protocol 里，把“前端怎么展示”留给 block renderer。  
这样库本身会更通用，业务代码也更容易维护。
