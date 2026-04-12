import { eventToBlock, type EventComponentDefinitionMap, type EventComponentRegistryResult, type EventComponentRegistrySharedOptions } from '../eventComponentRegistry';
import { normalizeSpringAiEventName } from './packet';
import type { SpringAiEvent } from './types';

/**
 * 为 Spring AI 创建一组“事件 -> 自定义组件”的快捷配置。
 */
export function defineSpringAiEventComponents(
  definitions: EventComponentDefinitionMap<SpringAiEvent>,
  options: EventComponentRegistrySharedOptions = {}
): EventComponentRegistryResult<SpringAiEvent> {
  return eventToBlock<SpringAiEvent>(definitions, {
    ...options,
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeSpringAiEventName(event.event)
        : undefined;
    },
    normalizeEventName: options.normalizeEventName ?? normalizeSpringAiEventName
  });
}
