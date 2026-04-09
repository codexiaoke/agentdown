import { computed, shallowRef, toValue, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import {
  useAdapterSession,
  type UseAdapterSessionReconnectOptions,
  type UseAdapterSessionResult
} from '../../composables/useAdapterSession';
import {
  useAgentDevtools,
  type UseAgentDevtoolsOptions,
  type UseAgentDevtoolsResult
} from '../../composables/useAgentDevtools';
import type { AgentdownAdapter, AgentdownAdapterSessionOptions } from '../../runtime/defineAdapter';
import { cmd } from '../../runtime/defineProtocol';
import type {
  BridgeError,
  BridgeHooks,
  RuntimeData,
  SurfaceBlockState,
  TransportAdapter
} from '../../runtime/types';
import type { EventActionRegistryResult } from '../../runtime/eventActions';
import type { RunSurfaceMessageActionItem, RunSurfaceMessageActionsRoleOptions, RunSurfaceOptions } from '../../surface/types';
import type { FrameworkAdapterOptionsLike, FrameworkAdapterProtocolOptionsLike, FrameworkEventRegistryLike, FrameworkToolRegistryLike } from './adapterFactory';
import type { FrameworkJsonSseTransportOptionsLike } from './jsonSseTransportFactory';

/**
 * 四套官方 chat helper 共享的最小消息语义 id 结构。
 */
export interface FrameworkChatIds {
  /** 当前整段对话 / session 的 id。 */
  conversationId: string;
  /** 当前一问一答这一轮的 id。 */
  turnId: string;
  /** 当前用户消息的 id。 */
  userMessageId: string;
  /** 当前 assistant 消息的 id。 */
  assistantMessageId: string;
}

/**
 * 共享 chat helper 的 sessionId 解析配置。
 */
export interface FrameworkChatSessionIdOptions<TRawPacket = unknown> {
  /** 如何从原始事件里提取后端 sessionId。 */
  resolve?: (event: TRawPacket) => string | undefined;
}

/**
 * 共享 chat helper 的用户消息预插入配置。
 */
export interface FrameworkChatUserMessageOptions {
  /** 用户消息写入到哪个 slot。默认 `main`。 */
  slot?: string;
}

/**
 * 共享 chat helper 对自动重连行为的配置。
 */
export interface FrameworkChatReconnectOptions<
  TRawPacket = unknown,
  TSource = unknown
> extends UseAdapterSessionReconnectOptions<TRawPacket, TSource> {}

/**
 * 结构化用户消息里的纯文本 block。
 */
export interface FrameworkChatUserTextBlockInput {
  /** block 类型，固定为 text。 */
  kind: 'text';
  /** 可选的稳定 block id。 */
  id?: string;
  /** 当前文本内容。 */
  text: string;
  /** 可选 slot；不传时沿用 userMessage 默认 slot。 */
  slot?: string;
}

/**
 * 结构化用户消息里的附件 block。
 */
export interface FrameworkChatUserAttachmentBlockInput {
  /** block 类型，固定为 attachment。 */
  kind: 'attachment';
  /** 可选的稳定 block id。 */
  id?: string;
  /** 可选 slot；不传时沿用 userMessage 默认 slot。 */
  slot?: string;
  /** 当前附件标题。 */
  title: string;
  /** 附件类型。 */
  attachmentKind: string;
  /** 附件唯一标识。 */
  attachmentId?: string;
  /** 附件标签或文件名。 */
  label?: string;
  /** 附件链接。 */
  href?: string;
  /** 附件说明。 */
  message?: string;
  /** 附件 MIME 类型。 */
  mimeType?: string;
  /** 已格式化大小。 */
  sizeText?: string;
  /** 预览图地址。 */
  previewSrc?: string;
  /** 业务状态文案。 */
  status?: string;
  /** 额外透传给 block 的数据。 */
  data?: RuntimeData;
}

/**
 * 结构化用户消息里的 artifact block。
 */
export interface FrameworkChatUserArtifactBlockInput {
  /** block 类型，固定为 artifact。 */
  kind: 'artifact';
  /** 可选的稳定 block id。 */
  id?: string;
  /** 可选 slot；不传时沿用 userMessage 默认 slot。 */
  slot?: string;
  /** artifact 标题。 */
  title: string;
  /** artifact 类型。 */
  artifactKind: string;
  /** artifact 唯一标识。 */
  artifactId?: string;
  /** artifact 标签。 */
  label?: string;
  /** artifact 链接。 */
  href?: string;
  /** artifact 说明。 */
  message?: string;
  /** 额外透传给 block 的数据。 */
  data?: RuntimeData;
}

/**
 * 结构化用户消息里的自定义 block。
 */
export interface FrameworkChatUserCustomBlockInput {
  /** block 类型，固定为 custom。 */
  kind: 'custom';
  /** 可选的稳定 block id。 */
  id?: string;
  /** 可选 slot；不传时沿用 userMessage 默认 slot。 */
  slot?: string;
  /** 自定义 block 的 renderer。 */
  renderer: string;
  /** 自定义 block 的 type；不传时默认沿用 renderer。 */
  type?: string;
  /** 自定义 block 的内容文本。 */
  content?: string;
  /** 自定义 block 的稳定状态。 */
  state?: SurfaceBlockState;
  /** 自定义 block 的数据载荷。 */
  data?: RuntimeData;
}

/**
 * 共享 chat helper 支持的结构化用户消息 block 联合类型。
 */
export type FrameworkChatUserMessageBlockInput =
  | FrameworkChatUserTextBlockInput
  | FrameworkChatUserAttachmentBlockInput
  | FrameworkChatUserArtifactBlockInput
  | FrameworkChatUserCustomBlockInput;

/**
 * 一次发送里可选的结构化用户消息。
 */
export interface FrameworkChatStructuredInput {
  /** 当前轮需要显示在 UI 上的主文本。 */
  text?: string;
  /** 真正发给后端的文本；不传时自动回退到 `text` 或 text block。 */
  requestText?: string;
  /** 当前用户消息里还要一起插入的结构化 blocks。 */
  blocks?: FrameworkChatUserMessageBlockInput[];
}

/**
 * chat helper 支持的统一输入结构。
 */
export type FrameworkChatInputValue = string | FrameworkChatStructuredInput;

/**
 * 共享 chat helper 的 assistant 操作栏配置。
 */
export interface FrameworkChatAssistantActionsOptions {
  /** 是否启用这一层快捷消息操作。 */
  enabled?: boolean;
  /** 自定义动作列表。 */
  actions?: RunSurfaceMessageActionItem[];
  /** draft 阶段是否也显示动作栏。 */
  showOnDraft?: boolean;
  /** 节点运行中是否也显示动作栏。 */
  showWhileRunning?: boolean;
  /** 覆写内置动作的实际业务处理。 */
  builtinHandlers?: RunSurfaceMessageActionsRoleOptions['builtinHandlers'];
}

/**
 * 共享 chat helper 暴露的 devtools 配置。
 */
export interface FrameworkChatDevtoolsOptions<TRawPacket = unknown>
  extends UseAgentDevtoolsOptions<TRawPacket> {}

/**
 * chat 工厂内部会识别的最小 protocol 语义字段。
 */
export interface FrameworkChatProtocolOptionsLike extends FrameworkAdapterProtocolOptionsLike {
  /** conversationId 解析规则。 */
  conversationId?: unknown;
  /** turnId 解析规则。 */
  turnId?: unknown;
  /** messageId 解析规则。 */
  messageId?: unknown;
}

/**
 * 四套官方 chat helper 共享的最小 adapter options 结构。
 */
export interface FrameworkChatAdapterOptionsLike<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TTitle = unknown,
  TTools extends FrameworkToolRegistryLike | undefined = FrameworkToolRegistryLike | undefined,
  TEvents extends FrameworkEventRegistryLike<TRawPacket> | undefined = FrameworkEventRegistryLike<TRawPacket> | undefined
> extends FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents> {}

/**
 * 四套官方 chat helper 共享的最小 transport options 结构。
 */
export interface FrameworkChatTransportOptionsLike<
  TRawPacket = unknown,
  TSource = unknown
> extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource> {}

/**
 * 共享 chat helper 的输入配置结构。
 */
export interface FrameworkChatSessionOptionsLike<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
> {
  /** 当前聊天真正要连接的 source。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案，或已结构化好的用户消息。 */
  input?: MaybeRefOrGetter<FrameworkChatInputValue | undefined> | undefined;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** adapter 的 run 标题简写。 */
  title?: TAdapterOptions['title'] | undefined;
  /** 传给框架 protocol 的额外协议配置。 */
  protocolOptions?: Omit<TProtocolOptions, 'conversationId' | 'turnId' | 'messageId'> | undefined;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: TAdapterOptions['tools'] | undefined;
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: TAdapterOptions['events'] | undefined;
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions | undefined;
  /** 透传给框架 SSE transport 的配置。 */
  transport?: Omit<TTransportOptions, 'message'> | undefined;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: ((input: {
    conversationId: string;
    text: string;
    at: number;
  }) => TChatIds) | undefined;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<TRawPacket> | undefined;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<TRawPacket> | undefined;
  /** 是否启用内置 devtools 采集。 */
  devtools?: false | FrameworkChatDevtoolsOptions<TRawPacket> | undefined;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | FrameworkChatSessionIdOptions<TRawPacket> | undefined;
  /** 是否在真正连接前预插一条用户消息。 */
  userMessage?: false | FrameworkChatUserMessageOptions | undefined;
  /** 当前 chat helper 是否在连接失败后自动重试。 */
  reconnect?: false | FrameworkChatReconnectOptions<TRawPacket, TSource> | undefined;
  /** assistant 默认消息操作栏的快捷配置。 */
  assistantActions?: false | FrameworkChatAssistantActionsOptions | undefined;
}

/**
 * 共享 chat helper 对外暴露的运行态结果。
 */
export interface FrameworkChatSessionResult<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds
> extends Omit<UseAdapterSessionResult<TRawPacket, TSource>, 'surface'> {
  /** 已经自动接好 regenerate 的最终 surface 配置。 */
  surface: ComputedRef<RunSurfaceOptions>;
  /** 当前是否仍在消费 SSE。 */
  busy: ComputedRef<boolean>;
  /** 适合直接展示在 demo 里的简短状态文本。 */
  statusLabel: ComputedRef<string>;
  /** 适合页面提示用的 transport 错误文本。 */
  transportError: ComputedRef<string>;
  /** 最近一次成功抓到的后端 sessionId。 */
  sessionId: ShallowRef<string>;
  /** 最近一次真正发给后端的输入文本。 */
  lastInput: ShallowRef<string>;
  /** 当前这次请求真正送给 transport 的输入文本。 */
  requestInput: ShallowRef<string>;
  /** 当前这轮消息对应的聊天语义 id。 */
  chatIds: ShallowRef<TChatIds | null>;
  /** 当前会话绑定的 devtools 状态。 */
  devtools: UseAgentDevtoolsResult<TRawPacket>;
  /** 当前是否处于“手动中断后等待恢复”的状态。 */
  interrupted: ShallowRef<boolean>;
  /** 发送当前输入框内容。 */
  send: (input?: FrameworkChatInputValue, source?: TSource) => Promise<void>;
  /** 重新生成上一条 assistant 回复。 */
  regenerate: (source?: TSource) => Promise<void>;
  /** 重新发起上一条输入；默认行为等价于 retry last input。 */
  retry: (source?: TSource) => Promise<void>;
  /** 中断当前连接，但保留现有 runtime 内容。 */
  interrupt: () => void;
  /** 在不重置 runtime 的前提下，尝试继续连接当前 source。 */
  resume: (source?: TSource) => Promise<void>;
}

/**
 * 创建共享 chat helper 时需要的配置。
 */
export interface CreateFrameworkChatSessionOptions<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
> {
  /** 当前框架的显示名，仅用于错误文案。 */
  frameworkName: string;
  /** 当前框架的 chat helper 输入配置。 */
  options: FrameworkChatSessionOptionsLike<TRawPacket, TSource, TChatIds, TProtocolOptions, TAdapterOptions, TTransportOptions>;
  /** 当前框架自己的 adapter 工厂。 */
  createAdapter: (options: TAdapterOptions) => AgentdownAdapter<TRawPacket, TSource>;
  /** 当前框架自己的 transport 工厂。 */
  createTransport: (options: TTransportOptions) => TransportAdapter<TSource, TRawPacket>;
  /** 当前框架默认的 sessionId 解析器。 */
  resolveSessionId: (event: TRawPacket) => string | undefined;
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createFrameworkChatIds(input: {
  conversationId: string;
  at: number;
}): FrameworkChatIds {
  const seed = input.at;

  return {
    conversationId: input.conversationId,
    turnId: `turn:${input.conversationId}:${seed}`,
    userMessageId: `message:user:${input.conversationId}:${seed}`,
    assistantMessageId: `message:assistant:${input.conversationId}:${seed}`
  };
}

/**
 * 读取 chat helper 最终应该使用的 id 生成器。
 */
function resolveFrameworkChatIdFactory<TChatIds extends FrameworkChatIds>(
  factory: ((input: {
    conversationId: string;
    text: string;
    at: number;
  }) => TChatIds) | undefined
): (input: {
  conversationId: string;
  text: string;
  at: number;
}) => TChatIds {
  if (factory) {
    return factory;
  }

  return (input) => createFrameworkChatIds({
    conversationId: input.conversationId,
    at: input.at
  }) as TChatIds;
}

/**
 * 共享 chat helper 内部使用的归一化输入结构。
 */
interface ResolvedFrameworkChatInput {
  /** 当前轮真正发给后端的文本。 */
  requestText: string;
  /** 当前轮要预插入到 UI 的结构化 blocks。 */
  blocks: FrameworkChatUserMessageBlockInput[];
}

/**
 * 把空值统一收敛成真正可用的消息文本。
 */
function resolveFrameworkChatText(value: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

/**
 * 为结构化用户消息 block 创建默认稳定 id。
 */
function createFrameworkChatUserBlockId(
  ids: FrameworkChatIds,
  kind: FrameworkChatUserMessageBlockInput['kind'],
  index: number
): string {
  return `block:${ids.userMessageId}:${kind}:${index}`;
}

/**
 * 提取一组结构化用户消息 blocks 里可直接发给后端的文本部分。
 */
function extractFrameworkChatRequestTextFromBlocks(
  blocks: FrameworkChatUserMessageBlockInput[]
): string {
  return blocks
    .filter((block): block is FrameworkChatUserTextBlockInput => block.kind === 'text')
    .map((block) => resolveFrameworkChatText(block.text))
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * 浅拷贝结构化用户消息 block，避免后续重试直接引用外部可变对象。
 */
function cloneFrameworkChatUserBlock(
  block: FrameworkChatUserMessageBlockInput
): FrameworkChatUserMessageBlockInput {
  switch (block.kind) {
    case 'text':
      return {
        ...block
      };
    case 'attachment':
    case 'artifact':
    case 'custom':
      return {
        ...block,
        ...(block.data ? { data: { ...block.data } } : {})
      };
    default:
      return block;
  }
}

/**
 * 把任意输入统一解析成 chat helper 后续真正要消费的结构。
 */
function resolveFrameworkChatInput(value: FrameworkChatInputValue | undefined): ResolvedFrameworkChatInput {
  if (typeof value === 'string' || value === undefined) {
    const text = resolveFrameworkChatText(value);

    return {
      requestText: text,
      blocks: text.length > 0
        ? [{
            kind: 'text',
            text
          }]
        : []
    };
  }

  const inputBlocks = Array.isArray(value.blocks)
    ? value.blocks.map((block) => cloneFrameworkChatUserBlock(block))
    : [];
  const displayText = resolveFrameworkChatText(value.text);
  const requestText = (() => {
    const explicitRequestText = resolveFrameworkChatText(value.requestText);

    if (explicitRequestText.length > 0) {
      return explicitRequestText;
    }

    if (displayText.length > 0) {
      return displayText;
    }

    return extractFrameworkChatRequestTextFromBlocks(inputBlocks);
  })();
  const blocks = displayText.length > 0
    ? [
        {
          kind: 'text',
          text: displayText
        } satisfies FrameworkChatUserTextBlockInput,
        ...inputBlocks
      ]
    : inputBlocks.length > 0
      ? inputBlocks
      : requestText.length > 0
        ? [{
            kind: 'text',
            text: requestText
          } satisfies FrameworkChatUserTextBlockInput]
        : [];

  return {
    requestText,
    blocks
  };
}

/**
 * 统一解析当前 chat session 初始要使用的 source。
 */
function resolveFrameworkChatInitialSource<TSource>(
  source: MaybeRefOrGetter<TSource | null | undefined>
): TSource | undefined {
  const resolved = toValue(source);

  if (resolved === null || resolved === undefined) {
    return undefined;
  }

  return resolved;
}

/**
 * 读取当前真正应该连接的数据源。
 */
function resolveFrameworkChatSource<TSource>(
  frameworkName: string,
  preferred: TSource | undefined,
  fallback: TSource | undefined
): TSource {
  if (preferred !== undefined) {
    return preferred;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${frameworkName} chat source is required before sending a message.`);
}

/**
 * 合并一组 bridge hooks，同时保留内置 sessionId 抓取逻辑。
 */
function mergeFrameworkChatHooks<TRawPacket>(
  base: BridgeHooks<TRawPacket> | undefined,
  extra: BridgeHooks<TRawPacket> | undefined
): BridgeHooks<TRawPacket> | undefined {
  if (!base && !extra) {
    return undefined;
  }

  return {
    onPacket(packet) {
      base?.onPacket?.(packet);
      extra?.onPacket?.(packet);
    },
    onMapped(commands, packet) {
      base?.onMapped?.(commands, packet);
      extra?.onMapped?.(commands, packet);
    },
    onFlush(commands) {
      base?.onFlush?.(commands);
      extra?.onFlush?.(commands);
    },
    onError(error) {
      base?.onError?.(error);
      extra?.onError?.(error);
    }
  };
}

/**
 * 读取 chat helper 最终应该使用的 sessionId 解析器。
 */
function resolveFrameworkChatSessionIdResolver<TRawPacket>(
  option: boolean | FrameworkChatSessionIdOptions<TRawPacket> | undefined,
  defaultResolver: (event: TRawPacket) => string | undefined
): ((event: TRawPacket) => string | undefined) | undefined {
  if (option === false) {
    return undefined;
  }

  if (option && option !== true && option.resolve) {
    return option.resolve;
  }

  return defaultResolver;
}

/**
 * 为 chat helper 创建“只提取一次 sessionId”的 bridge hooks。
 */
function createFrameworkChatCaptureHooks<TRawPacket>(
  sessionId: ShallowRef<string>,
  resolver: ((event: TRawPacket) => string | undefined) | undefined
): BridgeHooks<TRawPacket> | undefined {
  if (!resolver) {
    return undefined;
  }

  return {
    onPacket(packet) {
      if (sessionId.value.length > 0) {
        return;
      }

      const nextSessionId = resolver(packet);

      if (typeof nextSessionId === 'string' && nextSessionId.length > 0) {
        sessionId.value = nextSessionId;
      }
    }
  };
}

/**
 * 判断当前 onPacket hook 是否只是 `handleEvent()` 的直接包装。
 *
 * 如果是，我们就不再额外调用 `hooks.onPacket`，避免副作用执行两次。
 */
function isFrameworkEventActionHandleHook<TRawPacket>(
  hook: BridgeHooks<TRawPacket>['onPacket']
): boolean {
  return Boolean(
    hook
    && typeof hook === 'function'
    && '__agentdownEventActionFromHandle' in hook
  );
}

/**
 * 为非 UI eventActions 创建一层可观察的 bridge hooks。
 *
 * 这里会做两件事：
 * 1. 真正执行 `eventActions.handleEvent()`
 * 2. 把执行结果写进 devtools 的 side effect 日志
 */
function createFrameworkChatEventActionHooks<TRawPacket>(
  registry: EventActionRegistryResult<TRawPacket> | undefined,
  devtools: UseAgentDevtoolsResult<TRawPacket>
): BridgeHooks<TRawPacket> | undefined {
  if (!registry) {
    return undefined;
  }

  return {
    onPacket(packet) {
      const executions = registry.handleEvent(packet);
      devtools.recordSideEffects(packet, executions);

      if (!isFrameworkEventActionHandleHook(registry.hooks.onPacket)) {
        registry.hooks.onPacket?.(packet);
      }
    },
    onMapped(commands, packet) {
      registry.hooks.onMapped?.(commands, packet);
    },
    onFlush(commands) {
      registry.hooks.onFlush?.(commands);
    },
    onError(error) {
      registry.hooks.onError?.(error);
    }
  };
}

/**
 * 预插入一条用户消息，确保 user / assistant / tool 落在统一聊天语义里。
 */
function seedFrameworkUserMessage<TRawPacket, TSource, TChatIds extends FrameworkChatIds>(
  input: ResolvedFrameworkChatInput,
  ids: TChatIds,
  runtime: UseAdapterSessionResult<TRawPacket, TSource>['runtime'],
  options: FrameworkChatUserMessageOptions | false | undefined,
  at: number
) {
  if (options === false) {
    return;
  }

  let slot = 'main';

  if (options?.slot) {
    slot = options.slot;
  }

  const commands = input.blocks.map((block, index) => {
    const baseSemantics = {
      role: 'user' as const,
      slot: block.slot ?? slot,
      conversationId: ids.conversationId,
      turnId: ids.turnId,
      messageId: ids.userMessageId,
      at
    };

    switch (block.kind) {
      case 'text':
        return cmd.message.text({
          ...baseSemantics,
          id: block.id ?? createFrameworkChatUserBlockId(ids, block.kind, index),
          text: block.text
        });
      case 'attachment':
        return cmd.message.attachment({
          ...baseSemantics,
          id: block.id ?? createFrameworkChatUserBlockId(ids, block.kind, index),
          title: block.title,
          attachmentKind: block.attachmentKind,
          ...(block.attachmentId ? { attachmentId: block.attachmentId } : {}),
          ...(block.label ? { label: block.label } : {}),
          ...(block.href ? { href: block.href } : {}),
          ...(block.message ? { message: block.message } : {}),
          ...(block.mimeType ? { mimeType: block.mimeType } : {}),
          ...(block.sizeText ? { sizeText: block.sizeText } : {}),
          ...(block.previewSrc ? { previewSrc: block.previewSrc } : {}),
          ...(block.status ? { status: block.status } : {}),
          ...(block.data ? { data: block.data } : {})
        });
      case 'artifact':
        return cmd.message.artifact({
          ...baseSemantics,
          id: block.id ?? createFrameworkChatUserBlockId(ids, block.kind, index),
          title: block.title,
          artifactKind: block.artifactKind,
          ...(block.artifactId ? { artifactId: block.artifactId } : {}),
          ...(block.label ? { label: block.label } : {}),
          ...(block.href ? { href: block.href } : {}),
          ...(block.message ? { message: block.message } : {}),
          ...(block.data ? { data: block.data } : {})
        });
      case 'custom':
        return cmd.message.insert({
          ...baseSemantics,
          id: block.id ?? createFrameworkChatUserBlockId(ids, block.kind, index),
          type: block.type ?? block.renderer,
          renderer: block.renderer,
          state: block.state ?? 'stable',
          ...(block.content !== undefined ? { content: block.content } : {}),
          data: block.data ?? {}
        });
      default:
        return cmd.message.text({
          ...baseSemantics,
          id: createFrameworkChatUserBlockId(ids, 'text', index),
          text: input.requestText
        });
    }
  });

  if (commands.length === 0) {
    return;
  }

  runtime.apply(commands);
}

/**
 * 读取一次失败连接最适合展示给用户的错误文案。
 */
function resolveFrameworkChatErrorMessage(
  error: BridgeError<unknown> | Error,
  frameworkName: string
): string {
  const causeMessage = (
    'cause' in error
    && error.cause instanceof Error
    && typeof error.cause.message === 'string'
    && error.cause.message.trim().length > 0
  )
    ? error.cause.message
    : '';

  if (causeMessage.length > 0) {
    return causeMessage;
  }

  if (typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }

  return `${frameworkName} 请求失败。`;
}

/**
 * 在当前 assistant 消息尾部写入一个默认错误 block。
 */
function upsertFrameworkAssistantErrorBlock<TRawPacket, TSource, TChatIds extends FrameworkChatIds>(
  input: {
    frameworkName: string;
    error: BridgeError<TRawPacket> | Error;
    ids: TChatIds;
    runtime: UseAdapterSessionResult<TRawPacket, TSource>['runtime'];
    at: number;
  }
) {
  input.runtime.apply(cmd.error.upsert({
    id: `block:${input.ids.assistantMessageId}:error`,
    role: 'assistant',
    title: `${input.frameworkName} 连接失败`,
    message: resolveFrameworkChatErrorMessage(input.error, input.frameworkName),
    conversationId: input.ids.conversationId,
    turnId: input.ids.turnId,
    messageId: input.ids.assistantMessageId,
    at: input.at,
    data: {
      framework: input.frameworkName,
      error: true
    }
  }));
}

/**
 * 生成 assistant 默认动作栏配置，并把 regenerate 接到真实重新请求。
 */
function resolveFrameworkChatAssistantActions(
  surface: RunSurfaceOptions,
  busy: ComputedRef<boolean>,
  interrupted: ShallowRef<boolean>,
  regenerate: () => Promise<void>,
  retry: () => Promise<void>,
  resume: () => Promise<void>,
  interrupt: () => void,
  options: FrameworkChatAssistantActionsOptions | false | undefined
): RunSurfaceOptions {
  if (options === false) {
    return surface;
  }

  const baseAssistantActions = surface.messageActions?.assistant;

  if (baseAssistantActions === false) {
    return surface;
  }

  let actions = options?.actions;

  if (!actions) {
    actions = baseAssistantActions?.actions;
  }

  if (!actions) {
    actions = [
      'copy',
      {
        key: 'interrupt',
        visible: () => busy.value
      },
      {
        key: 'resume',
        visible: () => interrupted.value && !busy.value
      },
      {
        key: 'retry',
        visible: () => interrupted.value && !busy.value
      },
      {
        key: 'regenerate',
        disabled: () => busy.value,
        visible: () => !interrupted.value
      },
      'like',
      'dislike',
      'share'
    ] satisfies RunSurfaceMessageActionItem[];
  }

  const configuredBuiltinHandlers = {
    ...(baseAssistantActions?.builtinHandlers ?? {}),
    ...(options?.builtinHandlers ?? {})
  };

  const assistantActions: RunSurfaceMessageActionsRoleOptions = {
    enabled: true,
    showOnDraft: false,
    showWhileRunning: false,
    ...(baseAssistantActions ?? {}),
    ...(options ?? {}),
    actions,
    builtinHandlers: {
      ...configuredBuiltinHandlers,
      regenerate: async (context) => {
        if (configuredBuiltinHandlers.regenerate) {
          await configuredBuiltinHandlers.regenerate(context);
          return;
        }

        await regenerate();
      },
      retry: async (context) => {
        if (configuredBuiltinHandlers.retry) {
          await configuredBuiltinHandlers.retry(context);
          return;
        }

        await retry();
      },
      resume: async (context) => {
        if (configuredBuiltinHandlers.resume) {
          await configuredBuiltinHandlers.resume(context);
          return;
        }

        await resume();
      },
      interrupt: async (context) => {
        if (configuredBuiltinHandlers.interrupt) {
          await configuredBuiltinHandlers.interrupt(context);
          return;
        }

        interrupt();
      }
    }
  };

  return {
    ...surface,
    messageActions: {
      ...(surface.messageActions ?? {}),
      assistant: assistantActions
    }
  };
}

/**
 * 读取当前 bridge 状态对应的简短状态文案。
 */
function resolveFrameworkStatusLabel(
  phase: UseAdapterSessionResult['status']['value']['phase'],
  reconnecting: boolean
): string {
  if (reconnecting) {
    return '重连中';
  }

  switch (phase) {
    case 'consuming':
      return '连接中';
    case 'errored':
      return '连接失败';
    case 'closed':
      return '已关闭';
    default:
      return '待命';
  }
}

/**
 * 创建一个共享的聊天 session helper。
 */
export function useFrameworkChatSession<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
>(
  config: CreateFrameworkChatSessionOptions<TRawPacket, TSource, TChatIds, TProtocolOptions, TAdapterOptions, TTransportOptions>
): FrameworkChatSessionResult<TRawPacket, TSource, TChatIds> {
  const requestInput = shallowRef('');
  const lastInput = shallowRef('');
  const lastSubmission = shallowRef<ResolvedFrameworkChatInput | null>(null);
  const sessionId = shallowRef('');
  const initialSource = resolveFrameworkChatInitialSource(config.options.source);
  const interrupted = shallowRef(false);
  const activeSource = shallowRef<TSource | undefined>(initialSource);
  const chatIds: ShallowRef<TChatIds | null> = shallowRef<TChatIds | null>(null);
  const createIds = resolveFrameworkChatIdFactory(config.options.createIds);
  const transport = config.createTransport({
    ...(config.options.transport ?? {}),
    message: () => requestInput.value
  } as unknown as TTransportOptions);
  const sessionIdResolver = resolveFrameworkChatSessionIdResolver(
    config.options.sessionId,
    config.resolveSessionId
  );
  const captureHooks = createFrameworkChatCaptureHooks(sessionId, sessionIdResolver);
  const devtools = useAgentDevtools<TRawPacket>(
    config.options.devtools === false
      ? {
          enabled: false
        }
      : (config.options.devtools ?? {})
  );
  const eventActionHooks = createFrameworkChatEventActionHooks(config.options.eventActions, devtools);
  const mergedUserHooks = mergeFrameworkChatHooks(config.options.hooks, captureHooks);
  const mergedDevtoolsHooks = mergeFrameworkChatHooks(mergedUserHooks, devtools.hooks);
  const mergedHooks = mergeFrameworkChatHooks(mergedDevtoolsHooks, eventActionHooks);
  const adapterOptions = {
    protocolOptions: {
      ...(config.options.protocolOptions ?? {}),
      conversationId() {
        const activeConversationId = chatIds.value?.conversationId;

        if (activeConversationId) {
          return activeConversationId;
        }

        return toValue(config.options.conversationId);
      },
      turnId() {
        const activeTurnId = chatIds.value?.turnId;

        if (activeTurnId) {
          return activeTurnId;
        }

        return null;
      },
      messageId() {
        const activeAssistantMessageId = chatIds.value?.assistantMessageId;

        if (activeAssistantMessageId) {
          return activeAssistantMessageId;
        }

        return null;
      }
    }
  } as TAdapterOptions;

  if (config.options.title !== undefined) {
    adapterOptions.title = config.options.title;
  }

  if (config.options.tools) {
    adapterOptions.tools = config.options.tools;
  }

  if (config.options.events) {
    adapterOptions.events = config.options.events;
  }

  if (config.options.surface) {
    adapterOptions.surface = config.options.surface;
  }

  const adapter = config.createAdapter(adapterOptions);
  const sessionOverrides: AgentdownAdapterSessionOptions<TRawPacket, TSource> = {
    transport
  };

  if (initialSource !== undefined) {
    sessionOverrides.source = initialSource;
  }

  if (mergedHooks) {
    sessionOverrides.bridge = {
      hooks: mergedHooks
    };
  }

  const sessionState = useAdapterSession(adapter, {
    overrides: sessionOverrides,
    ...(config.options.reconnect !== undefined
      ? {
          reconnect: config.options.reconnect
        }
      : {})
  });
  devtools.attachRuntime(sessionState.runtime);
  const busy = computed(() => {
    return sessionState.status.value.phase === 'consuming' || sessionState.reconnecting.value;
  });
  const statusLabel = computed(() => resolveFrameworkStatusLabel(
    sessionState.status.value.phase,
    sessionState.reconnecting.value
  ));
  const transportError = computed(() => {
    if (!sessionState.error.value) {
      return '';
    }

    return resolveFrameworkChatErrorMessage(sessionState.error.value, config.frameworkName);
  });

  /**
   * 发送一次新的用户输入。
   */
  async function send(input?: FrameworkChatInputValue, source?: TSource) {
    let nextInput = input;

    if (nextInput === undefined) {
      nextInput = toValue(config.options.input);
    }

    const normalizedInput = resolveFrameworkChatInput(nextInput);
    const conversationId = toValue(config.options.conversationId);
    const at = Date.now();
    const ids = createIds({
      conversationId,
      text: normalizedInput.requestText,
      at
    });
    const resolvedSourceInput = toValue(config.options.source);
    let fallbackSource = sessionState.source.value;

    if (resolvedSourceInput !== null && resolvedSourceInput !== undefined) {
      fallbackSource = resolvedSourceInput as TSource;
    }

    const nextSource = resolveFrameworkChatSource(
      config.frameworkName,
      source,
      fallbackSource as TSource | undefined
    );

    lastInput.value = normalizedInput.requestText;
    requestInput.value = normalizedInput.requestText;
    lastSubmission.value = normalizedInput;
    chatIds.value = ids;
    activeSource.value = nextSource;
    interrupted.value = false;
    sessionState.disconnect();
    sessionState.reset();
    seedFrameworkUserMessage(normalizedInput, ids, sessionState.runtime, config.options.userMessage, at);

    try {
      await sessionState.connect(nextSource);
    } catch (error) {
      upsertFrameworkAssistantErrorBlock({
        frameworkName: config.frameworkName,
        error: error as BridgeError<TRawPacket> | Error,
        ids,
        runtime: sessionState.runtime,
        at: Date.now()
      });
      throw error;
    }
  }

  /**
   * 重新生成上一条 assistant 回复。
   */
  async function regenerate(source?: TSource) {
    await send(lastSubmission.value ?? lastInput.value, source);
  }

  /**
   * 重新发起上一条输入。
   */
  async function retry(source?: TSource) {
    await send(lastSubmission.value ?? lastInput.value, source);
  }

  /**
   * 中断当前连接，但保留现有 runtime 内容。
   */
  function interrupt() {
    const pendingButNotYetMarkedBusy = (
      sessionState.status.value.phase === 'idle'
      && chatIds.value !== null
    );

    if (!busy.value && !pendingButNotYetMarkedBusy) {
      return;
    }

    sessionState.disconnect();
    interrupted.value = true;
  }

  /**
   * 在不清空 runtime 的前提下继续连接当前 source。
   */
  async function resume(source?: TSource) {
    const resolvedSourceInput = toValue(config.options.source);
    let fallbackSource = activeSource.value ?? sessionState.source.value;

    if (resolvedSourceInput !== null && resolvedSourceInput !== undefined) {
      fallbackSource = resolvedSourceInput as TSource;
    }

    const nextSource = resolveFrameworkChatSource(
      config.frameworkName,
      source,
      fallbackSource
    );

    activeSource.value = nextSource;
    interrupted.value = false;

    try {
      await sessionState.connect(nextSource);
    } catch (error) {
      if (chatIds.value) {
        upsertFrameworkAssistantErrorBlock({
          frameworkName: config.frameworkName,
          error: error as BridgeError<TRawPacket> | Error,
          ids: chatIds.value,
          runtime: sessionState.runtime,
          at: Date.now()
        });
      }
      interrupted.value = true;
      throw error;
    }
  }

  /**
   * 基于当前 session surface 再叠一层更顺手的聊天默认值。
   */
  const surface = computed<RunSurfaceOptions>(() => {
    const handleRegenerate = async () => {
      await regenerate();
    };
    const handleRetry = async () => {
      await retry();
    };
    const handleResume = async () => {
      await resume();
    };
    const handleInterrupt = () => {
      interrupt();
    };

    return resolveFrameworkChatAssistantActions(
      sessionState.surface,
      busy,
      interrupted,
      handleRegenerate,
      handleRetry,
      handleResume,
      handleInterrupt,
      config.options.assistantActions
    );
  });

  return {
    ...sessionState,
    surface,
    busy,
    statusLabel,
    transportError,
    sessionId,
    lastInput,
    requestInput,
    chatIds,
    devtools,
    interrupted,
    send,
    regenerate,
    retry,
    interrupt,
    resume
  };
}
