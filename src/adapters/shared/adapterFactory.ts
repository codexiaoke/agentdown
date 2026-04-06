import type { AgentdownAdapter, AgentdownAdapterOptions } from '../../runtime/defineAdapter';
import { composeProtocols } from '../../runtime/composeProtocols';
import { defineAdapter } from '../../runtime/defineAdapter';
import { createMarkdownAssembler } from '../../runtime/assemblers';
import type { RuntimeProtocol, StreamAssembler } from '../../runtime/types';
import type { RunSurfaceOptions } from '../../surface/types';

/**
 * 共享 adapter 工厂会识别的最小 protocol 配置结构。
 */
export interface FrameworkAdapterProtocolOptionsLike {
  /** run 标题默认值。 */
  defaultRunTitle?: unknown;
  /** 工具 renderer 解析器。 */
  toolRenderer?: unknown;
}

/**
 * 基于工具名映射 renderer 的 helper 最小结构。
 */
export interface FrameworkToolRegistryLike<TRenderer = unknown> {
  /** 工具名到 renderer 的解析器。 */
  toolRenderer: TRenderer;
  /** 最终要挂到 surface 的组件映射。 */
  renderers?: RunSurfaceOptions['renderers'];
}

/**
 * 基于事件名映射组件的 helper 最小结构。
 */
export interface FrameworkEventRegistryLike<TRawPacket = unknown> {
  /** 需要额外组合进来的协议。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** 最终要挂到 surface 的组件映射。 */
  renderers?: RunSurfaceOptions['renderers'];
}

/**
 * 四套官方 starter adapter 共享的最小 options 结构。
 */
export interface FrameworkAdapterOptionsLike<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>,
  TProtocolOptions extends FrameworkAdapterProtocolOptionsLike = FrameworkAdapterProtocolOptionsLike,
  TTitle = unknown,
  TTools extends FrameworkToolRegistryLike | undefined = FrameworkToolRegistryLike | undefined,
  TEvents extends FrameworkEventRegistryLike<TRawPacket> | undefined = FrameworkEventRegistryLike<TRawPacket> | undefined
> extends Omit<AgentdownAdapterOptions<TRawPacket, TSource>, 'name' | 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个主协议。 */
  protocol?: RuntimeProtocol<TRawPacket>;
  /** 传给框架 protocol 工厂的配置。 */
  protocolOptions?: TProtocolOptions;
  /** 增加或覆写 adapter 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
  /** 顶层 run 标题简写。 */
  title?: TTitle;
  /** 基于工具名自动选择 renderer 的 helper。 */
  tools?: TTools;
  /** 基于事件名直接渲染组件的 helper。 */
  events?: TEvents;
  /** 直接透传给 RunSurface 的配置。 */
  surface?: RunSurfaceOptions;
}

/**
 * 创建共享 starter adapter 时需要的配置。
 */
export interface CreateFrameworkAdapterOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>,
  TProtocolOptions extends FrameworkAdapterProtocolOptionsLike = FrameworkAdapterProtocolOptionsLike,
  TTitle = unknown,
  TTools extends FrameworkToolRegistryLike | undefined = FrameworkToolRegistryLike | undefined,
  TEvents extends FrameworkEventRegistryLike<TRawPacket> | undefined = FrameworkEventRegistryLike<TRawPacket> | undefined,
  TOptions extends FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents> = FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents>
> {
  /** 当前框架的 adapter 名。 */
  name: string;
  /** 当前框架真正传入的 options。 */
  options: TOptions;
  /** 当前框架自己的 protocol 工厂。 */
  createProtocol: (options: TProtocolOptions) => RuntimeProtocol<TRawPacket>;
}

/**
 * 把 title 和 tools.toolRenderer 两个高频简写合并回 protocolOptions。
 */
function resolveFrameworkProtocolOptions<TProtocolOptions extends FrameworkAdapterProtocolOptionsLike>(options: {
  /** 原始 protocol options。 */
  protocolOptions?: TProtocolOptions | undefined;
  /** 顶层 run 标题简写。 */
  title?: unknown;
  /** 工具 registry helper。 */
  tools?: FrameworkToolRegistryLike | undefined;
}): TProtocolOptions {
  const protocolOptions = {
    ...(options.protocolOptions ?? {})
  } as TProtocolOptions;

  if (protocolOptions.defaultRunTitle === undefined && options.title !== undefined) {
    protocolOptions.defaultRunTitle = options.title;
  }

  if (protocolOptions.toolRenderer === undefined && options.tools) {
    protocolOptions.toolRenderer = options.tools.toolRenderer;
  }

  return protocolOptions;
}

/**
 * 把工具 helper、事件 helper 和用户自定义 renderers 合并成最终 surface。
 */
function resolveFrameworkSurface(options: {
  /** 工具 registry helper。 */
  tools?: FrameworkToolRegistryLike | undefined;
  /** 事件 registry helper。 */
  events?: FrameworkEventRegistryLike | undefined;
  /** 用户直接传入的 surface。 */
  surface?: RunSurfaceOptions | undefined;
}): RunSurfaceOptions {
  return {
    ...(options.surface ?? {}),
    renderers: {
      ...(options.tools?.renderers ?? {}),
      ...(options.events?.renderers ?? {}),
      ...(options.surface?.renderers ?? {})
    }
  };
}

/**
 * 创建一套共享的官方 starter adapter。
 */
export function createFrameworkAdapter<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>,
  TProtocolOptions extends FrameworkAdapterProtocolOptionsLike = FrameworkAdapterProtocolOptionsLike,
  TTitle = unknown,
  TTools extends FrameworkToolRegistryLike | undefined = FrameworkToolRegistryLike | undefined,
  TEvents extends FrameworkEventRegistryLike<TRawPacket> | undefined = FrameworkEventRegistryLike<TRawPacket> | undefined,
  TOptions extends FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents> = FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents>
>(
  config: CreateFrameworkAdapterOptions<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents, TOptions>
): AgentdownAdapter<TRawPacket, TSource> {
  const baseProtocol = config.options.protocol ?? config.createProtocol(resolveFrameworkProtocolOptions(config.options));
  const protocol = config.options.events
    ? composeProtocols(baseProtocol, config.options.events.protocol)
    : baseProtocol;

  return defineAdapter<TRawPacket, TSource>({
    ...config.options,
    name: config.name,
    protocol,
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(config.options.assemblers ?? {})
    },
    surface: resolveFrameworkSurface(config.options)
  });
}
