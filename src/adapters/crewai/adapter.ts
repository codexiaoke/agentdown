import { composeProtocols } from '../../runtime/composeProtocols';
import { defineAdapter, type AgentdownAdapter } from '../../runtime/defineAdapter';
import { createMarkdownAssembler } from '../../runtime/assemblers';
import type { RunSurfaceOptions } from '../../surface/types';
import { createCrewAIProtocol } from './protocol';
import type {
  CrewAIAdapterOptions,
  CrewAIEvent,
  CrewAIProtocolOptions
} from './types';

/**
 * 统一解析 CrewAI adapter 最终要使用的协议配置。
 *
 * 这里把几个高频简写收敛回 CrewAI protocol 自己认识的字段：
 * - `title` -> `defaultRunTitle`
 * - `tools.toolRenderer` -> `toolRenderer`
 */
function resolveCrewAIProtocolOptions<TSource>(
  options: CrewAIAdapterOptions<TSource>
): CrewAIProtocolOptions {
  const protocolOptions: CrewAIProtocolOptions = {
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
function resolveCrewAISurface<TSource>(options: CrewAIAdapterOptions<TSource>): RunSurfaceOptions {
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
 * 创建 CrewAI 官方 starter adapter。
 */
export function createCrewAIAdapter<
  TSource = AsyncIterable<CrewAIEvent> | Iterable<CrewAIEvent>
>(options: CrewAIAdapterOptions<TSource> = {}): AgentdownAdapter<CrewAIEvent, TSource> {
  const baseProtocol = options.protocol ?? createCrewAIProtocol(resolveCrewAIProtocolOptions(options));
  const protocol = options.events
    ? composeProtocols(baseProtocol, options.events.protocol)
    : baseProtocol;

  return defineAdapter<CrewAIEvent, TSource>({
    ...options,
    name: 'crewai',
    protocol,
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    },
    surface: resolveCrewAISurface(options)
  });
}
