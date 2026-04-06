import { composeProtocols } from '../../runtime/composeProtocols';
import { defineAdapter, type AgentdownAdapter } from '../../runtime/defineAdapter';
import { createMarkdownAssembler } from '../../runtime/assemblers';
import type { RunSurfaceOptions } from '../../surface/types';
import { createAgnoProtocol } from './protocol';
import type {
  AgnoAdapterOptions,
  AgnoEvent,
  AgnoProtocolOptions
} from './types';

/**
 * 统一解析 Agno adapter 最终要使用的协议配置。
 *
 * 这里把几个高频简写收敛回 Agno protocol 自己认识的字段：
 * - `title` -> `defaultRunTitle`
 * - `tools.toolRenderer` -> `toolRenderer`
 */
function resolveAgnoProtocolOptions<TSource>(
  options: AgnoAdapterOptions<TSource>
): AgnoProtocolOptions {
  return {
    ...(options.protocolOptions ?? {}),
    ...(options.protocolOptions?.defaultRunTitle !== undefined || options.title === undefined
      ? {}
      : {
          defaultRunTitle: options.title
        }),
    ...(options.protocolOptions?.toolRenderer !== undefined || !options.tools
      ? {}
      : {
          toolRenderer: options.tools.toolRenderer
        })
  };
}

/**
 * 把工具组件 helper、事件组件 helper 和用户自定义 surface.renderers 合并成一份 surface 配置。
 *
 * 优先级从低到高：
 * 1. tools.renderers
 * 2. events.renderers
 * 3. surface.renderers
 */
function resolveAgnoSurface<TSource>(options: AgnoAdapterOptions<TSource>): RunSurfaceOptions {
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
 * 创建 Agno 官方 starter adapter。
 *
 * 这个入口会自动帮用户装配：
 * - Agno 官方事件协议
 * - markdown assembler
 * - 工具名组件 helper
 * - 事件到组件 helper
 */
export function createAgnoAdapter<
  TSource = AsyncIterable<AgnoEvent> | Iterable<AgnoEvent>
>(options: AgnoAdapterOptions<TSource> = {}): AgentdownAdapter<AgnoEvent, TSource> {
  const baseProtocol = options.protocol ?? createAgnoProtocol(resolveAgnoProtocolOptions(options));
  const protocol = options.events
    ? composeProtocols(baseProtocol, options.events.protocol)
    : baseProtocol;

  return defineAdapter<AgnoEvent, TSource>({
    ...options,
    name: 'agno',
    protocol,
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    },
    surface: resolveAgnoSurface(options)
  });
}
