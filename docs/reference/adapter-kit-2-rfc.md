---
title: Adapter Kit 2.0 RFC
description: 定义 Agentdown V2 的适配器模型、helper DSL、官方 starter 形态与迁移路径。
---

# Adapter Kit 2.0 RFC

> Status: Draft  
> Owner: Agentdown  
> Related: [V2 产品设计](/reference/v2-design)

## 背景

V1 已经有一套可工作的前端适配链路：

- `createAgnoProtocol()` / `defineAgnoPreset()`
- `defineAgnoToolComponents()`
- `defineAgnoEventComponents()`
- `createSseTransport()`
- `useBridgeTransport()`

并且 LangChain、AutoGen、CrewAI 也已经沿着这条路径接上了。

这说明 V1 的方向是对的，但它还存在一个明显问题：

**接入能力已经够了，但心智模型仍然过碎。**

现在用户需要同时理解：

- protocol
- preset
- tool component helper
- event component helper
- transport
- surface
- bridge transport hook

这对高级用户没问题，但对“只是想接一个真实框架 backend”的用户来说，仍然偏重。

## RFC 目标

Adapter Kit 2.0 的目标只有一句话：

**把“接一个真实 Agent backend”这件事，从一套分散能力，收敛成一个统一入口。**

## 设计目标

### 1. 一个主要入口

用户接入官方框架时，应该优先面对一个入口，而不是同时组合 5 到 6 个 API。

### 2. 不统一后端协议

V2 仍然坚持：

- 后端继续返回官方事件
- 前端直接适配官方事件
- 不再要求后端包成 Agentdown 私有协议

### 3. 保留 escape hatch

适配器要更简单，但不能更封闭。

用户仍然必须能：

- 自己写 protocol
- 自己写 transport
- 自己覆写 surface
- 自己扩展 tool / event helper

### 4. 让 helper 更高层

现在的 `toolComponents` 和 `eventComponents` 已经证明方向可行。  
V2 要把它们从“几个零散 helper”推进成“统一的 adapter DSL”。

### 5. 让官方框架 starter 更像产品能力

Agno、LangChain、AutoGen、CrewAI 不应该只是若干导出函数，而应形成：

- 官方 starter
- 推荐接法
- 标准 helper
- 一致的调试方式

## 非目标

这份 RFC 不负责：

- 重写 renderer 主链
- 定义 runtime devtools UI
- 定义 approval / branch / retry 工作流协议

这些内容属于其他 RFC。

## 当前痛点

## 1. 接入路径碎

当前最常见的一段代码会长成这样：

```ts
import {
  createSseTransport,
  defineAgnoPreset,
  defineAgnoToolComponents,
  useBridgeTransport
} from 'agentdown';

// 一份配置先解决工具名 -> renderer。
const tools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// 再创建 preset。
const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno 助手',
    toolRenderer: tools.toolRenderer
  },
  surface: {
    renderers: tools.renderers
  }
});

// 再创建 session。
const { runtime, bridge, surface } = preset.createSession({
  bridge: {
    transport: createSseTransport({
      mode: 'json',
      init() {
        return {
          method: 'POST'
        };
      }
    })
  }
});

// 最后再用页面级 hook 管连接。
const { start } = useBridgeTransport({
  bridge,
  source: 'http://127.0.0.1:8000/api/stream/agno'
});
```

这条链路虽然合理，但“拼装感”还是比较强。

## 2. helper 之间还没有统一语义

当前：

- `defineAgnoToolComponents()` 解决的是工具映射
- `defineAgnoEventComponents()` 解决的是事件映射

它们已经很好用了，但缺少一个统一抽象来表达：

- 这是哪个框架的 adapter
- 它默认带哪些 helper
- 它的 transport 怎么接
- 它的 surface 默认长什么样

## 3. 官方 adapter 还不像一个完整产品入口

现在更像：

- 一套能力模块

而 V2 想把它推进成：

- 一个完整接入模型

## 提议：三层 Adapter Kit 模型

V2 建议把适配器抽象为三层：

1. `Adapter Definition Layer`
2. `Adapter Helper Layer`
3. `Framework Starter Layer`

## 一. Adapter Definition Layer

这是最底层的统一模型。

核心形态建议是：

```ts
interface AgentdownAdapter<TRawPacket, TSource> {
  name: string;
  protocol: RuntimeProtocol<TRawPacket>;
  createRuntime(): AgentRuntime;
  createBridge(overrides?: AdapterSessionOverrides<TRawPacket, TSource>): Bridge<TRawPacket, TSource>;
  createSession(overrides?: AdapterSessionOverrides<TRawPacket, TSource>): AgentdownAdapterSession<TRawPacket, TSource>;
  extend(extension: AgentdownAdapterExtension<TRawPacket, TSource>): AgentdownAdapter<TRawPacket, TSource>;
}
```

它和现在 `defineAgentdownPreset()` 的最大区别是：

- `preset` 是运行会话工厂
- `adapter` 是接入模型工厂

也就是说，V2 的 adapter 不只是 protocol + surface 的打包，还要显式承载：

- helper
- metadata
- 官方 starter 约定
- 扩展点

### 推荐公共创建函数

```ts
defineAdapter({
  name: 'agno',
  protocol,
  assemblers,
  bridge,
  surface,
  metadata
})
```

这会成为 V2 所有官方 adapter 的统一底座。

## 二. Adapter Helper Layer

这一层负责把高频重复逻辑收敛起来。

### 1. `toolByName()`

当前 `createToolNameRegistry()` 的升级版。

目标：

- 一份配置同时解决 `toolRenderer` 和 `surface.renderers`
- 支持更自然的名字
- 可直接作为 adapter extension 挂进去

建议形态：

```ts
const weatherTools = toolByName({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});
```

它产出的不只是：

- `toolRenderer`
- `renderers`

还可以带上：

- 默认 block data merge
- fallback renderer
- debug metadata

### 2. `eventToBlock()`

当前 `createEventComponentRegistry()` 的升级版。

目标：

- 让“某个事件来了就渲染组件”成为 adapter 的标准能力
- 默认支持 `patch` / `insert` / `upsert`
- 自动注入 `rawEvent`

建议形态：

```ts
const weatherEventBlocks = eventToBlock({
  'event.weather-summary': {
    on: 'tool_call_completed',
    component: WeatherSummaryCard,
    resolve: ({ event }) => ({
      id: 'event:block:weather-summary',
      groupId: 'turn:weather',
      data: {
        payload: event
      }
    })
  }
});
```

### 3. `contentChannel()`

这个 helper 是 V2 新增重点。

它解决的问题是：

- 同一个 backend 可能同时有主回答流、tool log 流、reasoning 流
- 用户不想每次都手写 `streamId` / `groupId` / `slot` 的规则

建议形态：

```ts
const channels = contentChannel({
  answer: {
    slot: 'main',
    assembler: 'markdown'
  },
  reasoning: {
    slot: 'thought',
    assembler: 'markdown'
  },
  log: {
    slot: 'side',
    assembler: 'plain-text'
  }
});
```

### 4. `groupStrategy()`

这个 helper 解决“哪些 block 应该归成同一条消息”的规则。

适合统一：

- user / assistant / tool 前后消息分组
- 同一 run 的多段文本分组
- 工具后新回答是否继续沿用当前 group

### 5. `errorStrategy()`

不同框架的错误事件风格不同。  
V2 可以把下面这些逻辑统一成 helper：

- 如何结束当前流
- 如何标记 node.error
- 如何结束 run
- 是否保留尾部 draft

## 三. Framework Starter Layer

这是最靠近用户的一层，也是 V2 的主要对外入口。

建议不再只是：

- `defineAgnoPreset()`

而是变成：

- `createAgnoAdapter()`
- `createLangChainAdapter()`
- `createAutoGenAdapter()`
- `createCrewAIAdapter()`

## 推荐用户 API

理想的最终接入代码，应该更接近这样：

```ts
import {
  createAgnoAdapter,
  createSseTransport,
  toolByName,
  eventToBlock
} from 'agentdown';

// 一份工具映射配置。
const tools = toolByName({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// 一份事件组件配置。
const events = eventToBlock({
  'event.weather-summary': {
    on: 'tool_call_completed',
    component: WeatherSummaryCard,
    resolve: ({ event }) => ({
      id: 'event:block:weather-summary',
      data: {
        payload: event
      }
    })
  }
});

// 直接创建官方 Agno adapter。
const agno = createAgnoAdapter({
  title: 'Agno 助手',
  tools,
  events,
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'Agno 正在思考'
      }
    }
  }
});

// 一次性创建完整会话。
const session = agno.createSession({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  transport: createSseTransport({
    mode: 'json',
    init() {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: '帮我查一下北京天气'
        })
      };
    }
  })
});

// session 直接给页面用。
const { runtime, connect, surface } = session;
```

这个模型的好处是：

- 用户面对的是“一个 adapter”
- helper 挂载方式统一
- `transport`、`surface`、`runtime` 的拼装感更少

## 提议：Session API 也要同步升级

当前：

- `preset.createSession()` 返回 `runtime + bridge + surface`
- 页面还要再用 `useBridgeTransport()`

V2 建议 adapter 的 `createSession()` 直接返回：

```ts
interface AgentdownAdapterSession<TRawPacket, TSource> {
  runtime: AgentRuntime;
  bridge: Bridge<TRawPacket, TSource>;
  surface: RunSurfaceOptions;
  connect(source?: TSource): Promise<void>;
  disconnect(): void;
  restart(source?: TSource): Promise<void>;
  status: ShallowRef<BridgeStatus>;
  error: ComputedRef<Error | undefined>;
}
```

也就是把当前 `preset + useBridgeTransport()` 常见组合直接提升成 session 默认能力。

## 为什么不直接取消底层 API

因为 V2 仍然要保留这条能力链：

- `createBridge()`
- `defineProtocol()`
- `defineEventProtocol()`
- `createSseTransport()`

底层 API 仍然是必要的。  
Adapter Kit 的目标不是替代底层，而是为 80% 用户提供更顺手的入口。

## 向后兼容策略

V2 建议采用“软兼容一段时间”的策略：

### 保留现有导出

- `defineAgnoPreset()`
- `defineLangChainPreset()`
- `defineAutoGenPreset()`
- `defineCrewAIPreset()`

### 但内部逐步迁移到 adapter 底座

也就是说，V2 内部应该让：

- preset 成为 adapter 的轻包装
- `toolComponents` / `eventComponents` 成为 adapter helper 的兼容包装

### 文档层优先推广新写法

新的文档和 demo 优先使用：

- `createAgnoAdapter()`
- `toolByName()`
- `eventToBlock()`

## 实现拆分建议

## Phase A: Adapter Core

先做统一底座：

- `defineAdapter()`
- `AgentdownAdapter`
- `AgentdownAdapterSession`
- session 内建 connect/disconnect

## Phase B: Helper DSL

再把 helper 升级掉：

- `toolByName()`
- `eventToBlock()`
- `contentChannel()`
- `groupStrategy()`

## Phase C: Framework Starters

最后把官方 starter 接到新模型：

- `createAgnoAdapter()`
- `createLangChainAdapter()`
- `createAutoGenAdapter()`
- `createCrewAIAdapter()`

## Phase D: Docs + Demo + Devtools Hooks

- 全部 demo 迁移到 adapter 写法
- 文档更新
- Devtools 预埋 adapter metadata

## 成功标准

Adapter Kit 2.0 如果做对了，用户应该能明显感受到：

- 接一个官方框架时不再需要理解那么多离散 API
- 工具组件和事件组件挂接方式更统一
- session 生命周期更完整，不需要手动拼太多 bridge hook
- 仍然保留全部 escape hatch

## Open Questions

### 1. `createSession()` 是否直接内建 Vue 响应式状态

可选方向：

- 只返回 runtime/bridge，状态仍由 composable 接管
- 或者直接返回 session 级响应式状态

我倾向：

- core adapter 返回可框架复用的 session
- Vue 层再提供 `useAdapterSession()`

### 2. `toolByName()` 和 `eventToBlock()` 是否保留框架专属包装

例如：

- `defineAgnoToolComponents()`
- `defineAgnoEventComponents()`

我倾向保留。  
原因是：

- 对用户更友好
- 可以复用框架自己的 normalize 规则

但它们内部应收敛到统一 helper 上。

### 3. 官方 starter 是否应内置 transport 默认值

我倾向：

- 可以提供默认 transport builder
- 但不要强绑 source / request

这样才能保留足够灵活性。

## 下一步

如果本 RFC 方向确认，下一步建议直接开始：

1. `defineAdapter()` 原型设计
2. `toolByName()` / `eventToBlock()` 新 DSL 原型
3. `createAgnoAdapter()` 第一版实现草图
