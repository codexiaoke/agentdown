import { composeProtocols } from '../../runtime/composeProtocols';
import { defineAdapter, type AgentdownAdapter } from '../../runtime/defineAdapter';
import { createMarkdownAssembler } from '../../runtime/assemblers';
import type { RunSurfaceOptions } from '../../surface/types';
import { createAutoGenProtocol } from './protocol';
import type {
  AutoGenAdapterOptions,
  AutoGenEvent,
  AutoGenProtocolOptions
} from './types';

/**
 * 统一解析 AutoGen adapter 最终要使用的协议配置。
 *
 * 这里把几个高频简写收敛回 AutoGen protocol 自己认识的字段：
 * - `title` -> `defaultRunTitle`
 * - `tools.toolRenderer` -> `toolRenderer`
 */
function resolveAutoGenProtocolOptions<TSource>(
  options: AutoGenAdapterOptions<TSource>
): AutoGenProtocolOptions {
  const protocolOptions: AutoGenProtocolOptions = {
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
function resolveAutoGenSurface<TSource>(options: AutoGenAdapterOptions<TSource>): RunSurfaceOptions {
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
 * 创建 AutoGen 官方 starter adapter。
 */
export function createAutoGenAdapter<
  TSource = AsyncIterable<AutoGenEvent> | Iterable<AutoGenEvent>
>(options: AutoGenAdapterOptions<TSource> = {}): AgentdownAdapter<AutoGenEvent, TSource> {
  const baseProtocol = options.protocol ?? createAutoGenProtocol(resolveAutoGenProtocolOptions(options));
  const protocol = options.events
    ? composeProtocols(baseProtocol, options.events.protocol)
    : baseProtocol;

  return defineAdapter<AutoGenEvent, TSource>({
    ...options,
    name: 'autogen',
    protocol,
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    },
    surface: resolveAutoGenSurface(options)
  });
}
