---
title: 自定义 Framework 接入
description: 把你自己的 chat helper 封装成 framework driver，让 useAgentChat() 成为项目里的统一高层入口。
---

# 自定义 Framework 接入

这篇文档只解决一件事：

`如何把你自己的 chat helper 包成 framework driver，然后交给 useAgentChat() 使用`

如果你只是：

- 单独接 Agno、LangChain、AutoGen、CrewAI
- 做一个一次性的自定义 SSE 页面
- 只是想把 packet 映射成 block

那这篇不是首选入口。

更合适的是：

- 内置框架：优先用各自的 `use*ChatSession()`
- 一次性自定义 SSE：优先用 `defineEventProtocol()` / `defineAdapter()`

只有当你想在项目里继续抽象出“我自己的 framework 层”时，再使用 `useAgentChat()`。

## 最小心智

推荐把这一层拆成三段：

```text
useAcmeChatSession() -> acmeChatFramework -> useAgentChat()
```

也就是：

1. 先有你自己的专用 chat helper
2. 再把它包成一个 framework driver
3. 页面层统一用 `useAgentChat()`

`useAgentChat()` 不会替你凭空生成 protocol、adapter、transport。  
它做的是“把你已经有的那套 chat helper，再包成一个统一高层入口”。

## 第一步：先有一层专用 chat helper

假设你已经有一个自己的后端 `Acme Agent`，并且前面已经用：

- `defineEventProtocol()`
- `defineAdapter()`
- `useAdapterSession()`

收敛出了一层专用 helper，例如：

```ts
import type { MaybeRefOrGetter } from 'vue';
import type {
  AgentChatFrameworkSessionOptions,
  RunSurfaceOptions
} from 'agentdown';

export interface AcmeEvent {
  type: string;
  session_id?: string;
  run_id?: string;
  content?: string;
}

export interface UseAcmeChatSessionOptions<TSource = string>
  extends AgentChatFrameworkSessionOptions<TSource> {
  /** 当前聊天真正要连接的 source。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** 页面层静态 surface 配置。 */
  surface?: RunSurfaceOptions;
}

export interface UseAcmeChatSessionResult<TSource = string> {
  runtime: AgentRuntime;
  surface: ComputedRef<RunSurfaceOptions>;
  send(input?: string, source?: TSource): Promise<void>;
  regenerate(source?: TSource): Promise<void>;
  busy: ComputedRef<boolean>;
  statusLabel: ComputedRef<string>;
  transportError: ComputedRef<string>;
  sessionId: ShallowRef<string>;
}

export function useAcmeChatSession<TSource = string>(
  options: UseAcmeChatSessionOptions<TSource>
): UseAcmeChatSessionResult<TSource> {
  // 这里内部通常就是你自己的：
  // - adapter
  // - transport
  // - useAdapterSession()
  return {} as UseAcmeChatSessionResult<TSource>;
}
```

这一层不需要和 Agentdown 官方四套 helper 一模一样。  
但如果你想让它能接到 `useAgentChat()`，建议至少满足这几个点：

- `options` 里有 `source`
- `options` 里按需保留 `tools / events / eventActions`
- 返回值里至少能提供你页面真正会用到的状态和方法

## 第二步：把 chat helper 包成 framework driver

这是 `useAgentChat()` 真正要吃的那一层。

```ts
import {
  defineAgentChatFramework,
  normalizeAgentChatEventActionDefinitions,
  normalizeAgentChatEventComponentDefinitions,
  normalizeAgentChatToolDefinitions,
  type AgentChatEventActionMap,
  type AgentChatEventComponentMap,
  type AgentChatToolMap
} from 'agentdown';
import {
  type AcmeEvent,
  type UseAcmeChatSessionOptions,
  type UseAcmeChatSessionResult,
  useAcmeChatSession
} from './acme-chat';

/**
 * 这是你项目里的“Acme framework driver”。
 *
 * 它做的事很简单：
 * 1. 规定统一入口允许接收哪些短写配置
 * 2. 把这些短写配置转换成底层 chat helper 真正需要的格式
 * 3. 最后委托给 useAcmeChatSession()
 */
export const acmeChatFramework = defineAgentChatFramework<
  string,
  UseAcmeChatSessionOptions<string>,
  UseAcmeChatSessionResult<string>,
  AgentChatToolMap,
  AgentChatEventComponentMap<AcmeEvent>,
  AgentChatEventActionMap<AcmeEvent>
>({
  id: 'acme',

  /**
   * 让页面层可以继续写最短的：
   * tools: { lookup_weather: WeatherToolCard }
   */
  resolveTools(input) {
    return normalizeAgentChatToolDefinitions(input);
  },

  /**
   * 让页面层可以继续写最短的：
   * events: { WeatherSnapshot: WeatherSummaryCard }
   */
  resolveEvents(input) {
    return normalizeAgentChatEventComponentDefinitions(input);
  },

  /**
   * 让页面层可以继续写最短的：
   * eventActions: { CreateSession({ event }) { ... } }
   */
  resolveEventActions(input) {
    return normalizeAgentChatEventActionDefinitions(input);
  },

  /**
   * 真正执行时，仍然回到你自己的 chat helper。
   */
  useChatSession(options) {
    return useAcmeChatSession<string>(options);
  }
});
```

如果你的目标只是“让 `useAgentChat()` 支持最短对象写法”，这一版已经够用。

## 第三步：页面里统一使用 `useAgentChat()`

到了页面层，心智就很简单了：

```ts
import { ref } from 'vue';
import { useAgentChat } from 'agentdown';
import WeatherSummaryCard from './WeatherSummaryCard.vue';
import WeatherToolCard from './WeatherToolCard.vue';
import { acmeChatFramework } from './acme-framework';

const prompt = ref('帮我查一下北京天气');
const backendSessionId = ref('');

const chat = useAgentChat({
  framework: acmeChatFramework,
  source: 'http://127.0.0.1:8000/api/stream/acme',
  input: prompt,
  conversationId: 'session:demo:acme',

  /**
   * 最短工具映射：工具名 -> 组件
   */
  tools: {
    lookup_weather: WeatherToolCard
  },

  /**
   * 最短事件组件映射：事件名 -> 组件
   */
  events: {
    WeatherSnapshot: WeatherSummaryCard
  },

  /**
   * 最短非 UI 副作用映射：事件名 -> 回调
   */
  eventActions: {
    CreateSession({ event }) {
      backendSessionId.value = event.session_id ?? '';
    }
  }
});

await chat.send();
```

然后页面里继续正常接：

```vue
<RunSurface
  :runtime="chat.runtime"
  v-bind="chat.surface"
/>
```

## 第四步：什么时候该继续做更强的 driver

上面的 driver 是“最小模板”。  
如果你还想让它继续支持这些高级输入：

- `toolByName()` 返回的 registry result
- `eventToBlock()` 返回的 registry result
- `eventToAction()` 返回的 registry result

那就要把 driver 的输入类型再放宽一层，而不是只接受最短对象写法。

这时候推荐做法是：

1. 把 `tools / events / eventActions` 类型扩成 union
2. 先判断用户传进来的是否已经是 registry result
3. 如果是，直接透传
4. 如果不是，再走 `normalizeAgentChat*Definitions()` 这层短写归一化

这一块可以直接参考内置四个 framework 在 `useAgentChat.ts` 里的实现方式。

## 最常见的误区

### 1. 内置框架也强行用 `useAgentChat()`

不推荐。

如果你只是单独接：

- Agno
- LangChain
- AutoGen
- CrewAI

优先用各自的 `use*ChatSession()`，类型提示会更自然，点进去也更直观。

### 2. 把 `framework` 先存成普通 `string`

例如：

```ts
const framework: string = 'acme';
```

这样会让 TS 很难保留精确推导。

更好的写法是直接传 driver 对象：

```ts
framework: acmeChatFramework
```

或者至少保留字面量 / `as const`。

### 3. 希望 `useAgentChat()` 替自己搭完整 adapter

也不推荐。

`useAgentChat()` 更适合做“统一上层入口”，不是最低层协议工厂。
如果你还没有自己的 adapter / chat helper，先把那一层搭出来，再回来包 driver。

## 什么时候不用这篇方案

如果你的目标只是：

- 让某个页面直接接一个自定义 SSE
- 并不打算在项目里沉淀出“自定义 framework”

那通常更简单的是：

- `defineEventProtocol()`
- `createMarkdownAssembler()`
- `defineAdapter()`
- `useAdapterSession()`

这条链更直接，也更少抽象。

## 进一步阅读

- [官方框架适配](/guide/framework-adapters)
- [快速开始](/guide/getting-started)
- [Runtime 概览](/runtime/overview)
- [Streaming 组装](/runtime/reducer)
