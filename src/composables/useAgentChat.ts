import type { Component, MaybeRefOrGetter } from 'vue';
import {
  defineAgnoEventActions,
  defineAgnoEventComponents,
  defineAgnoToolComponents,
  type AgnoChatAssistantActionsOptions,
  type AgnoChatIdFactory,
  type AgnoChatSessionIdOptions,
  type AgnoChatUserMessageOptions,
  type AgnoEvent,
  type AgnoProtocolOptions,
  type AgnoSseTransportOptions,
  type AgnoToolRendererContext,
  useAgnoChatSession,
  type UseAgnoChatSessionOptions,
  type UseAgnoChatSessionResult
} from '../adapters/agno';
import {
  defineAutoGenEventActions,
  defineAutoGenEventComponents,
  defineAutoGenToolComponents,
  type AutoGenChatAssistantActionsOptions,
  type AutoGenChatIdFactory,
  type AutoGenChatSessionIdOptions,
  type AutoGenChatUserMessageOptions,
  type AutoGenEvent,
  type AutoGenProtocolOptions,
  type AutoGenSseTransportOptions,
  type AutoGenToolRendererContext,
  useAutoGenChatSession,
  type UseAutoGenChatSessionOptions,
  type UseAutoGenChatSessionResult
} from '../adapters/autogen';
import type {
  EventComponentDefinition,
  EventComponentDefinitionMap,
  EventComponentRegistryResult
} from '../adapters/eventComponentRegistry';
import {
  defineCrewAIEventActions,
  defineCrewAIEventComponents,
  defineCrewAIToolComponents,
  type CrewAIChatAssistantActionsOptions,
  type CrewAIChatIdFactory,
  type CrewAIChatSessionIdOptions,
  type CrewAIChatUserMessageOptions,
  type CrewAIEvent,
  type CrewAIProtocolOptions,
  type CrewAISseTransportOptions,
  type CrewAIToolRendererContext,
  useCrewAIChatSession,
  type UseCrewAIChatSessionOptions,
  type UseCrewAIChatSessionResult
} from '../adapters/crewai';
import {
  defineLangChainEventActions,
  defineLangChainEventComponents,
  defineLangChainToolComponents,
  type LangChainChatAssistantActionsOptions,
  type LangChainChatIdFactory,
  type LangChainChatSessionIdOptions,
  type LangChainChatUserMessageOptions,
  type LangChainEvent,
  type LangChainProtocolOptions,
  type LangChainSseTransportOptions,
  type LangChainToolRendererContext,
  useLangChainChatSession,
  type UseLangChainChatSessionOptions,
  type UseLangChainChatSessionResult
} from '../adapters/langchain';
import type {
  ToolNameComponentDefinition,
  ToolNameComponentMap,
  ToolNameRegistryResult
} from '../adapters/toolNameRegistry';
import type {
  EventActionContext,
  EventActionDefinition,
  EventActionDefinitionMap,
  EventActionRegistryResult
} from '../runtime/eventActions';
import type {
  RunSurfaceOptions,
  RunSurfaceRendererRegistration
} from '../surface/types';

/**
 * 当前统一 chat 入口内置支持的后端框架 id。
 */
export type AgentChatBuiltinFrameworkId = 'agno' | 'langchain' | 'autogen' | 'crewai';

/**
 * 一个可被 `useAgentChat()` 直接消费的框架 session 配置最小结构。
 *
 * 自定义 framework 不需要完全复刻官方四套 chat helper，
 * 但至少要有：
 * - `source`
 * - 可选的 `tools / events / eventActions`
 */
export interface AgentChatFrameworkSessionOptions<TSource = string> {
  /** 当前聊天真正要连接的 source。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 工具 renderer 相关配置。 */
  tools?: unknown;
  /** 事件组件相关配置。 */
  events?: unknown;
  /** 非 UI 事件副作用相关配置。 */
  eventActions?: unknown;
}

/**
 * `useAgentChat()` 可插入的 framework driver。
 *
 * 这让统一入口不再只能识别内置字符串，而是可以：
 * - `framework: 'agno'`
 * - `framework: defineAgentChatFramework({...})`
 */
export interface AgentChatFrameworkDriver<
  TSource = string,
  TSessionOptions extends AgentChatFrameworkSessionOptions<TSource> = AgentChatFrameworkSessionOptions<TSource>,
  TResult = unknown,
  TToolsInput = TSessionOptions['tools'],
  TEventsInput = TSessionOptions['events'],
  TEventActionsInput = TSessionOptions['eventActions']
> {
  /** 当前 framework 的稳定标识。 */
  id: string;
  /** 实际执行 chat session 的接入函数。 */
  useChatSession: (options: TSessionOptions) => TResult;
  /** 把统一入口收到的 tools 输入转换成底层 session 所需格式。 */
  resolveTools?: (input: TToolsInput) => TSessionOptions['tools'];
  /** 把统一入口收到的 events 输入转换成底层 session 所需格式。 */
  resolveEvents?: (input: TEventsInput) => TSessionOptions['events'];
  /** 把统一入口收到的 eventActions 输入转换成底层 session 所需格式。 */
  resolveEventActions?: (input: TEventActionsInput) => TSessionOptions['eventActions'];
}

/**
 * framework driver 注册表的最小结构。
 */
export type AgentChatFrameworkRegistry = Record<
  string,
  AgentChatFrameworkDriver<
    any,
    any,
    any,
    any,
    any,
    any
  >
>;

/**
 * `framework` 字段最终可接收的值：
 * - 内置框架 id
 * - 自定义 framework driver
 */
export type AgentChatFramework =
  | AgentChatBuiltinFrameworkId
  | AgentChatFrameworkDriver<any, any, any, any, any, any>;

/**
 * 定义一个可插入 `useAgentChat()` 的 framework driver。
 */
export function defineAgentChatFramework<
  TSource = string,
  TSessionOptions extends AgentChatFrameworkSessionOptions<TSource> = AgentChatFrameworkSessionOptions<TSource>,
  TResult = unknown,
  TToolsInput = TSessionOptions['tools'],
  TEventsInput = TSessionOptions['events'],
  TEventActionsInput = TSessionOptions['eventActions']
>(
  driver: AgentChatFrameworkDriver<
    TSource,
    TSessionOptions,
    TResult,
    TToolsInput,
    TEventsInput,
    TEventActionsInput
  >
): AgentChatFrameworkDriver<
  TSource,
  TSessionOptions,
  TResult,
  TToolsInput,
  TEventsInput,
  TEventActionsInput
> {
  return driver;
}

/**
 * 定义一组可复用的 framework driver 注册表。
 */
export function createAgentChatFrameworkRegistry<
  TRegistry extends AgentChatFrameworkRegistry
>(
  registry: TRegistry
): TRegistry {
  return registry;
}

/**
 * 统一入口里一条“工具名 -> 组件”的简写定义。
 *
 * 和底层 `ToolNameComponentDefinition` 相比：
 * - `match` 可省略，默认直接使用当前 key
 * - 如果只是最简单场景，也可以直接把值写成组件本身
 */
export interface AgentChatToolDefinitionInput extends Omit<ToolNameComponentDefinition, 'match'> {
  /** 工具名匹配规则；不传时默认使用当前 key。 */
  match?: ToolNameComponentDefinition['match'];
}

/**
 * 统一入口支持的“工具组件简写表”。
 *
 * 最简单写法：
 *
 * ```ts
 * tools: {
 *   lookup_weather: WeatherToolCard
 * }
 * ```
 */
export type AgentChatToolMap = Record<string, Component | AgentChatToolDefinitionInput>;

/**
 * 统一入口里一条“事件名 -> 组件”的简写定义。
 *
 * 和底层 `EventComponentDefinition` 相比：
 * - `on` 可省略，默认直接使用当前 key
 * - `resolve` 可省略，默认按 `insert` 写入一个 event block
 */
export interface AgentChatEventComponentInput<TRawEvent>
  extends Omit<EventComponentDefinition<TRawEvent>, 'on'> {
  /** 当前规则会命中的事件名；不传时默认使用当前 key。 */
  on?: EventComponentDefinition<TRawEvent>['on'];
}

/**
 * 统一入口支持的“事件组件简写表”。
 */
export type AgentChatEventComponentMap<TRawEvent> = Record<
  string,
  Component | RunSurfaceRendererRegistration | AgentChatEventComponentInput<TRawEvent>
>;

/**
 * 统一入口里一条“事件名 -> 副作用”的简写定义。
 *
 * 最简单写法：
 *
 * ```ts
 * eventActions: {
 *   CreateSession({ event }) {
 *     sessionId.value = event.session_id;
 *   }
 * }
 * ```
 */
export type AgentChatEventActionInput<TRawEvent> =
  | ((input: EventActionContext<TRawEvent>) => void)
  | Omit<EventActionDefinition<TRawEvent>, 'on'>;

/**
 * 统一入口支持的“事件副作用简写表”。
 */
export type AgentChatEventActionMap<TRawEvent> = Record<string, AgentChatEventActionInput<TRawEvent>>;

/**
 * `useAgentChat()` 的通用配置形状。
 *
 * 这一层的作用是把“底层 session options”与“统一入口简写输入”分离开：
 * - `tools / events / eventActions` 允许保持更短的用户写法
 * - 剩余字段继续直接透传给具体 framework 的 chat helper
 */
export type UseAgentChatFrameworkOptions<
  TFramework,
  TSessionOptions extends AgentChatFrameworkSessionOptions<any>,
  TToolsInput = TSessionOptions['tools'],
  TEventsInput = TSessionOptions['events'],
  TEventActionsInput = TSessionOptions['eventActions']
> = Omit<TSessionOptions, 'tools' | 'events' | 'eventActions'> & {
  /** 当前统一入口要走哪套 framework。 */
  framework: TFramework;
  /** 工具组件配置，支持 framework 自己决定接收何种简写。 */
  tools?: TToolsInput;
  /** 事件组件配置，支持 framework 自己决定接收何种简写。 */
  events?: TEventsInput;
  /** 非 UI 事件副作用配置，支持 framework 自己决定接收何种简写。 */
  eventActions?: TEventActionsInput;
};

/**
 * Agno 统一 chat 入口里 `tools` 可接收的输入。
 */
export type AgentChatAgnoToolsInput =
  | ToolNameRegistryResult<AgnoToolRendererContext>
  | ToolNameComponentMap
  | AgentChatToolMap;

/**
 * Agno 统一 chat 入口里 `events` 可接收的输入。
 */
export type AgentChatAgnoEventsInput =
  | EventComponentRegistryResult<AgnoEvent>
  | EventComponentDefinitionMap<AgnoEvent>
  | AgentChatEventComponentMap<AgnoEvent>;

/**
 * Agno 统一 chat 入口里 `eventActions` 可接收的输入。
 */
export type AgentChatAgnoEventActionsInput =
  | EventActionRegistryResult<AgnoEvent>
  | EventActionDefinitionMap<AgnoEvent>
  | AgentChatEventActionMap<AgnoEvent>;

/**
 * LangChain 统一 chat 入口里 `tools` 可接收的输入。
 */
export type AgentChatLangChainToolsInput =
  | ToolNameRegistryResult<LangChainToolRendererContext>
  | ToolNameComponentMap
  | AgentChatToolMap;

/**
 * LangChain 统一 chat 入口里 `events` 可接收的输入。
 */
export type AgentChatLangChainEventsInput =
  | EventComponentRegistryResult<LangChainEvent>
  | EventComponentDefinitionMap<LangChainEvent>
  | AgentChatEventComponentMap<LangChainEvent>;

/**
 * LangChain 统一 chat 入口里 `eventActions` 可接收的输入。
 */
export type AgentChatLangChainEventActionsInput =
  | EventActionRegistryResult<LangChainEvent>
  | EventActionDefinitionMap<LangChainEvent>
  | AgentChatEventActionMap<LangChainEvent>;

/**
 * AutoGen 统一 chat 入口里 `tools` 可接收的输入。
 */
export type AgentChatAutoGenToolsInput =
  | ToolNameRegistryResult<AutoGenToolRendererContext>
  | ToolNameComponentMap
  | AgentChatToolMap;

/**
 * AutoGen 统一 chat 入口里 `events` 可接收的输入。
 */
export type AgentChatAutoGenEventsInput =
  | EventComponentRegistryResult<AutoGenEvent>
  | EventComponentDefinitionMap<AutoGenEvent>
  | AgentChatEventComponentMap<AutoGenEvent>;

/**
 * AutoGen 统一 chat 入口里 `eventActions` 可接收的输入。
 */
export type AgentChatAutoGenEventActionsInput =
  | EventActionRegistryResult<AutoGenEvent>
  | EventActionDefinitionMap<AutoGenEvent>
  | AgentChatEventActionMap<AutoGenEvent>;

/**
 * CrewAI 统一 chat 入口里 `tools` 可接收的输入。
 */
export type AgentChatCrewAIToolsInput =
  | ToolNameRegistryResult<CrewAIToolRendererContext>
  | ToolNameComponentMap
  | AgentChatToolMap;

/**
 * CrewAI 统一 chat 入口里 `events` 可接收的输入。
 */
export type AgentChatCrewAIEventsInput =
  | EventComponentRegistryResult<CrewAIEvent>
  | EventComponentDefinitionMap<CrewAIEvent>
  | AgentChatEventComponentMap<CrewAIEvent>;

/**
 * CrewAI 统一 chat 入口里 `eventActions` 可接收的输入。
 */
export type AgentChatCrewAIEventActionsInput =
  | EventActionRegistryResult<CrewAIEvent>
  | EventActionDefinitionMap<CrewAIEvent>
  | AgentChatEventActionMap<CrewAIEvent>;

/**
 * Agno 统一 chat 入口配置。
 */
export type UseAgentChatAgnoOptions<TSource = string> = UseAgentChatFrameworkOptions<
  'agno',
  UseAgnoChatSessionOptions<TSource>,
  AgentChatAgnoToolsInput,
  AgentChatAgnoEventsInput,
  AgentChatAgnoEventActionsInput
>;

/**
 * LangChain 统一 chat 入口配置。
 */
export type UseAgentChatLangChainOptions<TSource = string> = UseAgentChatFrameworkOptions<
  'langchain',
  UseLangChainChatSessionOptions<TSource>,
  AgentChatLangChainToolsInput,
  AgentChatLangChainEventsInput,
  AgentChatLangChainEventActionsInput
>;

/**
 * AutoGen 统一 chat 入口配置。
 */
export type UseAgentChatAutoGenOptions<TSource = string> = UseAgentChatFrameworkOptions<
  'autogen',
  UseAutoGenChatSessionOptions<TSource>,
  AgentChatAutoGenToolsInput,
  AgentChatAutoGenEventsInput,
  AgentChatAutoGenEventActionsInput
>;

/**
 * CrewAI 统一 chat 入口配置。
 */
export type UseAgentChatCrewAIOptions<TSource = string> = UseAgentChatFrameworkOptions<
  'crewai',
  UseCrewAIChatSessionOptions<TSource>,
  AgentChatCrewAIToolsInput,
  AgentChatCrewAIEventsInput,
  AgentChatCrewAIEventActionsInput
>;

/**
 * 自定义 framework 的统一 chat 入口配置。
 */
export type UseAgentChatCustomOptions<
  TSource = string,
  TSessionOptions extends AgentChatFrameworkSessionOptions<TSource> = AgentChatFrameworkSessionOptions<TSource>,
  TResult = unknown,
  TToolsInput = TSessionOptions['tools'],
  TEventsInput = TSessionOptions['events'],
  TEventActionsInput = TSessionOptions['eventActions']
> = UseAgentChatFrameworkOptions<
  AgentChatFrameworkDriver<
    TSource,
    TSessionOptions,
    TResult,
    TToolsInput,
    TEventsInput,
    TEventActionsInput
  >,
  TSessionOptions,
  TToolsInput,
  TEventsInput,
  TEventActionsInput
>;

/**
 * 统一 chat 入口支持的全部配置联合类型。
 */
export type UseAgentChatOptions<TSource = string> =
  | UseAgentChatAgnoOptions<TSource>
  | UseAgentChatLangChainOptions<TSource>
  | UseAgentChatAutoGenOptions<TSource>
  | UseAgentChatCrewAIOptions<TSource>
  | UseAgentChatFrameworkOptions<
    AgentChatFrameworkDriver<any, any, any, any, any, any>,
    any,
    any,
    any,
    any
  >;

/**
 * 统一 chat 入口的默认返回结果类型。
 *
 * 内置 framework 会自动收敛到更精确的结果；
 * 自定义 framework 时，`useAgentChat()` 会直接返回 driver 自己声明的返回值。
 */
export type UseAgentChatResult<
  TSource = string,
  TResult =
  | UseAgnoChatSessionResult<TSource>
  | UseLangChainChatSessionResult<TSource>
  | UseAutoGenChatSessionResult<TSource>
  | UseCrewAIChatSessionResult<TSource>
> = TResult;

/**
 * 从 `useAgentChat()` 的输入里提取原始 source 类型。
 */
export type InferAgentChatSource<TOptions> =
  TOptions extends { source: MaybeRefOrGetter<infer TSource | null | undefined> }
    ? TSource
    : string;

/**
 * 根据 `useAgentChat()` 的输入自动推导返回结果。
 */
export type ResolveUseAgentChatResult<TOptions> =
  TOptions extends { framework: infer TFramework }
    ? TFramework extends 'agno'
      ? UseAgnoChatSessionResult<InferAgentChatSource<TOptions>>
      : TFramework extends 'langchain'
        ? UseLangChainChatSessionResult<InferAgentChatSource<TOptions>>
        : TFramework extends 'autogen'
          ? UseAutoGenChatSessionResult<InferAgentChatSource<TOptions>>
          : TFramework extends 'crewai'
            ? UseCrewAIChatSessionResult<InferAgentChatSource<TOptions>>
            : TFramework extends AgentChatFrameworkDriver<any, any, infer TResult, any, any, any>
              ? TResult
              : never
    : never;

/**
 * 判断当前值是否是普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断当前值是否已经是工具 registry。
 */
function isToolRegistryResult<TContext>(value: unknown): value is ToolNameRegistryResult<TContext> {
  return isRecord(value)
    && typeof value.toolRenderer === 'function'
    && isRecord(value.renderers);
}

/**
 * 判断当前值是否已经是事件组件 registry。
 */
function isEventComponentRegistryResult<TRawEvent>(value: unknown): value is EventComponentRegistryResult<TRawEvent> {
  return isRecord(value)
    && typeof value.mapEvent === 'function'
    && isRecord(value.renderers)
    && isRecord(value.protocol);
}

/**
 * 判断当前值是否已经是事件副作用 registry。
 */
function isEventActionRegistryResult<TRawEvent>(value: unknown): value is EventActionRegistryResult<TRawEvent> {
  return isRecord(value)
    && typeof value.handleEvent === 'function'
    && isRecord(value.hooks);
}

/**
 * 判断当前值是否更像一个 renderer registration。
 */
function isRendererRegistration(value: unknown): value is RunSurfaceRendererRegistration {
  return isRecord(value)
    && 'component' in value
    && ('mode' in value || 'props' in value);
}

/**
 * 判断当前值是否是工具定义对象，而不是普通 Vue 组件对象。
 */
function isAgentToolDefinition(value: unknown): value is AgentChatToolDefinitionInput {
  return isRecord(value)
    && (
      'match' in value
      || 'registration' in value
      || 'component' in value
      || 'mode' in value
    );
}

/**
 * 判断当前值是否是事件组件定义对象，而不是普通 Vue 组件对象。
 */
function isAgentEventComponentDefinition<TRawEvent>(
  value: unknown
): value is AgentChatEventComponentInput<TRawEvent> {
  return isRecord(value)
    && (
      'on' in value
      || 'match' in value
      || 'resolve' in value
      || 'registration' in value
      || 'component' in value
    );
}

/**
 * 把统一入口的工具简写表转换成底层 registry definitions。
 *
 * 这个 helper 主要给自定义 framework driver 复用：
 * 用户仍然可以继续写最短的 `{ toolName: Component }`。
 */
export function normalizeAgentChatToolDefinitions(
  input: ToolNameComponentMap | AgentChatToolMap
): ToolNameComponentMap {
  const definitions: ToolNameComponentMap = {};

  for (const [renderer, value] of Object.entries(input)) {
    if (isAgentToolDefinition(value)) {
      const definition: ToolNameComponentDefinition = {
        match: value.match ?? renderer
      };

      if (value.registration !== undefined) {
        definition.registration = value.registration;
      } else if (value.component !== undefined) {
        definition.component = value.component;
      } else if (isRendererRegistration(value)) {
        definition.registration = value;
      }

      if (value.mode !== undefined) {
        definition.mode = value.mode;
      }

      definitions[renderer] = definition;
      continue;
    }

    definitions[renderer] = {
      match: renderer,
      component: value
    };
  }

  return definitions;
}

/**
 * 给最简单的事件组件配置补一套默认 resolve 逻辑。
 */
function createDefaultEventComponentResolve() {
  return ({ renderer }: { renderer: string }) => ({
    mode: 'insert' as const,
    renderer
  });
}

/**
 * 把统一入口的事件组件简写表转换成底层 registry definitions。
 *
 * 自定义 framework 可以复用这层，把 `events` 的短写法映射成自己的 registry 输入。
 */
export function normalizeAgentChatEventComponentDefinitions<TRawEvent>(
  input: EventComponentDefinitionMap<TRawEvent> | AgentChatEventComponentMap<TRawEvent>
): EventComponentDefinitionMap<TRawEvent> {
  const definitions: EventComponentDefinitionMap<TRawEvent> = {};

  for (const [renderer, value] of Object.entries(input)) {
    if (isRendererRegistration(value)) {
      definitions[renderer] = {
        on: renderer,
        registration: value,
        resolve: createDefaultEventComponentResolve()
      };
      continue;
    }

    if (isAgentEventComponentDefinition<TRawEvent>(value)) {
      definitions[renderer] = {
        ...value,
        on: value.on ?? renderer,
        resolve: value.resolve ?? createDefaultEventComponentResolve()
      };
      continue;
    }

    definitions[renderer] = {
      on: renderer,
      component: value,
      resolve: createDefaultEventComponentResolve()
    };
  }

  return definitions;
}

/**
 * 把统一入口的事件副作用简写表转换成底层 definitions。
 *
 * 自定义 framework 可以复用这层，把 `{ EventName() {} }` 这种简写收敛成标准 action 定义。
 */
export function normalizeAgentChatEventActionDefinitions<TRawEvent>(
  input: EventActionDefinitionMap<TRawEvent> | AgentChatEventActionMap<TRawEvent>
): EventActionDefinitionMap<TRawEvent> {
  const definitions: EventActionDefinitionMap<TRawEvent> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'function') {
      definitions[key] = {
        on: key,
        run: value
      };
      continue;
    }

    const resolvedOn: EventActionDefinition<TRawEvent>['on'] =
      isRecord(value) && 'on' in value
        ? (value.on as EventActionDefinition<TRawEvent>['on']) ?? key
        : key;

    definitions[key] = {
      ...value,
      on: resolvedOn
    };
  }

  return definitions;
}

/**
 * 统一解析 Agno tools 输入。
 */
function resolveAgnoTools(
  input: UseAgentChatAgnoOptions['tools']
) {
  if (!input) {
    return undefined;
  }

  if (isToolRegistryResult<AgnoToolRendererContext>(input)) {
    return input;
  }

  return defineAgnoToolComponents(normalizeAgentChatToolDefinitions(input));
}

/**
 * 统一解析 Agno 事件组件输入。
 */
function resolveAgnoEvents(
  input: UseAgentChatAgnoOptions['events']
) {
  if (!input) {
    return undefined;
  }

  if (isEventComponentRegistryResult<AgnoEvent>(input)) {
    return input;
  }

  return defineAgnoEventComponents(normalizeAgentChatEventComponentDefinitions(input));
}

/**
 * 统一解析 Agno 事件副作用输入。
 */
function resolveAgnoEventActions(
  input: UseAgentChatAgnoOptions['eventActions']
) {
  if (!input) {
    return undefined;
  }

  if (isEventActionRegistryResult<AgnoEvent>(input)) {
    return input;
  }

  return defineAgnoEventActions(normalizeAgentChatEventActionDefinitions(input));
}

/**
 * 统一解析 LangChain tools 输入。
 */
function resolveLangChainTools(
  input: UseAgentChatLangChainOptions['tools']
) {
  if (!input) {
    return undefined;
  }

  if (isToolRegistryResult<LangChainToolRendererContext>(input)) {
    return input;
  }

  return defineLangChainToolComponents(normalizeAgentChatToolDefinitions(input));
}

/**
 * 统一解析 LangChain 事件组件输入。
 */
function resolveLangChainEvents(
  input: UseAgentChatLangChainOptions['events']
) {
  if (!input) {
    return undefined;
  }

  if (isEventComponentRegistryResult<LangChainEvent>(input)) {
    return input;
  }

  return defineLangChainEventComponents(normalizeAgentChatEventComponentDefinitions(input));
}

/**
 * 统一解析 LangChain 事件副作用输入。
 */
function resolveLangChainEventActions(
  input: UseAgentChatLangChainOptions['eventActions']
) {
  if (!input) {
    return undefined;
  }

  if (isEventActionRegistryResult<LangChainEvent>(input)) {
    return input;
  }

  return defineLangChainEventActions(normalizeAgentChatEventActionDefinitions(input));
}

/**
 * 统一解析 AutoGen tools 输入。
 */
function resolveAutoGenTools(
  input: UseAgentChatAutoGenOptions['tools']
) {
  if (!input) {
    return undefined;
  }

  if (isToolRegistryResult<AutoGenToolRendererContext>(input)) {
    return input;
  }

  return defineAutoGenToolComponents(normalizeAgentChatToolDefinitions(input));
}

/**
 * 统一解析 AutoGen 事件组件输入。
 */
function resolveAutoGenEvents(
  input: UseAgentChatAutoGenOptions['events']
) {
  if (!input) {
    return undefined;
  }

  if (isEventComponentRegistryResult<AutoGenEvent>(input)) {
    return input;
  }

  return defineAutoGenEventComponents(normalizeAgentChatEventComponentDefinitions(input));
}

/**
 * 统一解析 AutoGen 事件副作用输入。
 */
function resolveAutoGenEventActions(
  input: UseAgentChatAutoGenOptions['eventActions']
) {
  if (!input) {
    return undefined;
  }

  if (isEventActionRegistryResult<AutoGenEvent>(input)) {
    return input;
  }

  return defineAutoGenEventActions(normalizeAgentChatEventActionDefinitions(input));
}

/**
 * 统一解析 CrewAI tools 输入。
 */
function resolveCrewAITools(
  input: UseAgentChatCrewAIOptions['tools']
) {
  if (!input) {
    return undefined;
  }

  if (isToolRegistryResult<CrewAIToolRendererContext>(input)) {
    return input;
  }

  return defineCrewAIToolComponents(normalizeAgentChatToolDefinitions(input));
}

/**
 * 统一解析 CrewAI 事件组件输入。
 */
function resolveCrewAIEvents(
  input: UseAgentChatCrewAIOptions['events']
) {
  if (!input) {
    return undefined;
  }

  if (isEventComponentRegistryResult<CrewAIEvent>(input)) {
    return input;
  }

  return defineCrewAIEventComponents(normalizeAgentChatEventComponentDefinitions(input));
}

/**
 * 统一解析 CrewAI 事件副作用输入。
 */
function resolveCrewAIEventActions(
  input: UseAgentChatCrewAIOptions['eventActions']
) {
  if (!input) {
    return undefined;
  }

  if (isEventActionRegistryResult<CrewAIEvent>(input)) {
    return input;
  }

  return defineCrewAIEventActions(normalizeAgentChatEventActionDefinitions(input));
}

/**
 * 内置的 Agno chat framework driver。
 */
export const agnoChatFramework = defineAgentChatFramework<
  string,
  UseAgnoChatSessionOptions<string>,
  UseAgnoChatSessionResult<string>,
  AgentChatAgnoToolsInput,
  AgentChatAgnoEventsInput,
  AgentChatAgnoEventActionsInput
>({
  id: 'agno',
  useChatSession(sessionOptions) {
    return useAgnoChatSession<string>(sessionOptions);
  },
  resolveTools: resolveAgnoTools,
  resolveEvents: resolveAgnoEvents,
  resolveEventActions: resolveAgnoEventActions
});

/**
 * 内置的 LangChain chat framework driver。
 */
export const langChainChatFramework = defineAgentChatFramework<
  string,
  UseLangChainChatSessionOptions<string>,
  UseLangChainChatSessionResult<string>,
  AgentChatLangChainToolsInput,
  AgentChatLangChainEventsInput,
  AgentChatLangChainEventActionsInput
>({
  id: 'langchain',
  useChatSession(sessionOptions) {
    return useLangChainChatSession<string>(sessionOptions);
  },
  resolveTools: resolveLangChainTools,
  resolveEvents: resolveLangChainEvents,
  resolveEventActions: resolveLangChainEventActions
});

/**
 * 内置的 AutoGen chat framework driver。
 */
export const autoGenChatFramework = defineAgentChatFramework<
  string,
  UseAutoGenChatSessionOptions<string>,
  UseAutoGenChatSessionResult<string>,
  AgentChatAutoGenToolsInput,
  AgentChatAutoGenEventsInput,
  AgentChatAutoGenEventActionsInput
>({
  id: 'autogen',
  useChatSession(sessionOptions) {
    return useAutoGenChatSession<string>(sessionOptions);
  },
  resolveTools: resolveAutoGenTools,
  resolveEvents: resolveAutoGenEvents,
  resolveEventActions: resolveAutoGenEventActions
});

/**
 * 内置的 CrewAI chat framework driver。
 */
export const crewAIChatFramework = defineAgentChatFramework<
  string,
  UseCrewAIChatSessionOptions<string>,
  UseCrewAIChatSessionResult<string>,
  AgentChatCrewAIToolsInput,
  AgentChatCrewAIEventsInput,
  AgentChatCrewAIEventActionsInput
>({
  id: 'crewai',
  useChatSession(sessionOptions) {
    return useCrewAIChatSession<string>(sessionOptions);
  },
  resolveTools: resolveCrewAITools,
  resolveEvents: resolveCrewAIEvents,
  resolveEventActions: resolveCrewAIEventActions
});

/**
 * 内置 framework driver 注册表。
 */
export const builtinAgentChatFrameworks = createAgentChatFrameworkRegistry({
  agno: agnoChatFramework,
  langchain: langChainChatFramework,
  autogen: autoGenChatFramework,
  crewai: crewAIChatFramework
});

/**
 * 把 `framework` 字段解析成真正可执行的 driver。
 */
export function resolveAgentChatFrameworkDriver(
  framework: AgentChatFramework
): AgentChatFrameworkDriver<
  any,
  any,
  any,
  any,
  any,
  any
> {
  if (typeof framework !== 'string') {
    return framework;
  }

  const driver = builtinAgentChatFrameworks[framework];

  if (driver) {
    return driver;
  }

  throw new Error(`Unsupported agent chat framework: ${framework}`);
}

/**
 * 使用某个 framework driver 真正执行统一 chat 入口。
 */
function runAgentChatWithFramework<
  TSource = string,
  TFramework = AgentChatFramework,
  TSessionOptions extends AgentChatFrameworkSessionOptions<TSource> = AgentChatFrameworkSessionOptions<TSource>,
  TResult = unknown,
  TToolsInput = TSessionOptions['tools'],
  TEventsInput = TSessionOptions['events'],
  TEventActionsInput = TSessionOptions['eventActions']
>(
  driver: AgentChatFrameworkDriver<
    TSource,
    TSessionOptions,
    TResult,
    TToolsInput,
    TEventsInput,
    TEventActionsInput
  >,
  options: UseAgentChatFrameworkOptions<
    TFramework,
    TSessionOptions,
    TToolsInput,
    TEventsInput,
    TEventActionsInput
  >
): TResult {
  const {
    framework,
    tools,
    events,
    eventActions,
    ...rest
  } = options;
  void framework;
  const resolvedOptions = {
    ...rest
  } as unknown as TSessionOptions;

  if (tools !== undefined) {
    resolvedOptions.tools = driver.resolveTools
      ? driver.resolveTools(tools)
      : tools as TSessionOptions['tools'];
  }

  if (events !== undefined) {
    resolvedOptions.events = driver.resolveEvents
      ? driver.resolveEvents(events)
      : events as TSessionOptions['events'];
  }

  if (eventActions !== undefined) {
    resolvedOptions.eventActions = driver.resolveEventActions
      ? driver.resolveEventActions(eventActions)
      : eventActions as TSessionOptions['eventActions'];
  }

  return driver.useChatSession(resolvedOptions);
}

/**
 * 统一 chat 入口。
 *
 * 目标：
 * - 对用户只保留一套 `useAgentChat()` 心智
 * - 允许直接传工具组件简写、事件组件简写、事件副作用简写
 * - 内部仍然完全复用四套官方框架各自的适配层
 */
export function useAgentChat<
  TSource = string,
  TOptions extends UseAgentChatOptions<TSource> = UseAgentChatOptions<TSource>
>(
  options: TOptions
): ResolveUseAgentChatResult<TOptions> {
  return runAgentChatWithFramework(
    resolveAgentChatFrameworkDriver(options.framework as AgentChatFramework),
    options as UseAgentChatFrameworkOptions<any, any, any, any, any>
  ) as ResolveUseAgentChatResult<TOptions>;
}

export type {
  AgnoChatAssistantActionsOptions,
  AgnoChatIdFactory,
  AgnoChatSessionIdOptions,
  AgnoChatUserMessageOptions,
  AgnoProtocolOptions,
  AgnoSseTransportOptions,
  AutoGenChatAssistantActionsOptions,
  AutoGenChatIdFactory,
  AutoGenChatSessionIdOptions,
  AutoGenChatUserMessageOptions,
  AutoGenProtocolOptions,
  AutoGenSseTransportOptions,
  CrewAIChatAssistantActionsOptions,
  CrewAIChatIdFactory,
  CrewAIChatSessionIdOptions,
  CrewAIChatUserMessageOptions,
  CrewAIProtocolOptions,
  CrewAISseTransportOptions,
  LangChainChatAssistantActionsOptions,
  LangChainChatIdFactory,
  LangChainChatSessionIdOptions,
  LangChainChatUserMessageOptions,
  LangChainProtocolOptions,
  LangChainSseTransportOptions,
  RunSurfaceOptions
};
