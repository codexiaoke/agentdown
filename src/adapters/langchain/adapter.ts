import { composeProtocols } from '../../runtime/composeProtocols';
import { defineAdapter, type AgentdownAdapter } from '../../runtime/defineAdapter';
import { createMarkdownAssembler } from '../../runtime/assemblers';
import type { RunSurfaceOptions } from '../../surface/types';
import { createLangChainProtocol } from './protocol';
import type {
  LangChainAdapterOptions,
  LangChainEvent,
  LangChainProtocolOptions
} from './types';

/**
 * 统一解析 LangChain adapter 最终要使用的协议配置。
 *
 * 这里把几个高频简写收敛回 LangChain protocol 自己认识的字段：
 * - `title` -> `defaultRunTitle`
 * - `tools.toolRenderer` -> `toolRenderer`
 */
function resolveLangChainProtocolOptions<TSource>(
  options: LangChainAdapterOptions<TSource>
): LangChainProtocolOptions {
  const protocolOptions: LangChainProtocolOptions = {
    ...(options.protocolOptions ?? {})
  };

  if (protocolOptions.defaultRunTitle === undefined && options.title !== undefined) {
    protocolOptions.defaultRunTitle = options.title;
  }

  if (protocolOptions.toolRenderer === undefined && options.tools) {
    protocolOptions.toolRenderer = options.tools.toolRenderer;
  }

  return protocolOptions;
}

/**
 * 把工具组件 helper、事件组件 helper 和用户自定义 surface.renderers 合并成一份 surface 配置。
 *
 * 优先级从低到高：
 * 1. tools.renderers
 * 2. events.renderers
 * 3. surface.renderers
 */
function resolveLangChainSurface<TSource>(options: LangChainAdapterOptions<TSource>): RunSurfaceOptions {
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
 * 创建 LangChain 官方 starter adapter。
 *
 * 这个入口会自动帮用户装配：
 * - LangChain 官方事件协议
 * - markdown assembler
 * - 工具名组件 helper
 * - 事件到组件 helper
 */
export function createLangChainAdapter<
  TSource = AsyncIterable<LangChainEvent> | Iterable<LangChainEvent>
>(options: LangChainAdapterOptions<TSource> = {}): AgentdownAdapter<LangChainEvent, TSource> {
  const baseProtocol = options.protocol ?? createLangChainProtocol(resolveLangChainProtocolOptions(options));
  const protocol = options.events
    ? composeProtocols(baseProtocol, options.events.protocol)
    : baseProtocol;

  return defineAdapter<LangChainEvent, TSource>({
    ...options,
    name: 'langchain',
    protocol,
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    },
    surface: resolveLangChainSurface(options)
  });
}
