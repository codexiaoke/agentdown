import { createEventComponentRegistry, type EventComponentDefinitionMap, type EventComponentRegistryResult, type EventComponentRegistrySharedOptions } from '../eventComponentRegistry';
import { normalizeAutoGenEventName } from './packet';
import type { AutoGenEvent } from './types';

/**
 * 为 AutoGen 创建一组“事件 -> 自定义组件”的快捷配置。
 */
export function defineAutoGenEventComponents(
  definitions: EventComponentDefinitionMap<AutoGenEvent>,
  options: EventComponentRegistrySharedOptions = {}
): EventComponentRegistryResult<AutoGenEvent> {
  return createEventComponentRegistry<AutoGenEvent>({
    ...options,
    definitions,
    resolveEventName(event) {
      return typeof event.type === 'string'
        ? normalizeAutoGenEventName(event.type)
        : undefined;
    },
    normalizeEventName: options.normalizeEventName ?? normalizeAutoGenEventName
  });
}
