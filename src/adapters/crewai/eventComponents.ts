import { createEventComponentRegistry, type EventComponentDefinitionMap, type EventComponentRegistryResult, type EventComponentRegistrySharedOptions } from '../eventComponentRegistry';
import { normalizeCrewAIEventName } from './packet';
import type { CrewAIEvent } from './types';

/**
 * 为 CrewAI 创建一组“事件 -> 自定义组件”的快捷配置。
 */
export function defineCrewAIEventComponents(
  definitions: EventComponentDefinitionMap<CrewAIEvent>,
  options: EventComponentRegistrySharedOptions = {}
): EventComponentRegistryResult<CrewAIEvent> {
  return createEventComponentRegistry<CrewAIEvent>({
    ...options,
    definitions,
    resolveEventName(event) {
      const normalized = normalizeCrewAIEventName(event);
      return normalized.length > 0
        ? normalized
        : undefined;
    },
    normalizeEventName: options.normalizeEventName ?? ((name) => name)
  });
}
