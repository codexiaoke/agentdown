import { eventToBlock, type EventComponentDefinitionMap, type EventComponentRegistryResult, type EventComponentRegistrySharedOptions } from '../eventComponentRegistry';
import { normalizeAgnoEventName } from './packet';
import type { AgnoEvent } from './types';

/**
 * 为 Agno 创建一组“事件 -> 自定义组件”的快捷配置。
 *
 * 这里默认复用 Agno adapter 自己的事件名规范化规则，
 * 所以用户既可以写 `RunContent`，也可以写 `run_content`。
 */
export function defineAgnoEventComponents(
  definitions: EventComponentDefinitionMap<AgnoEvent>,
  options: EventComponentRegistrySharedOptions = {}
): EventComponentRegistryResult<AgnoEvent> {
  return eventToBlock<AgnoEvent>(definitions, {
    ...options,
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeAgnoEventName(event.event)
        : undefined;
    },
    normalizeEventName: options.normalizeEventName ?? normalizeAgnoEventName
  });
}
