import { eventToAction, type EventActionDefinitionMap, type EventActionRegistryResult } from '../../runtime/eventActions';
import { normalizeSpringAiEventName } from './packet';
import type { SpringAiEvent } from './types';

/**
 * 为 Spring AI 创建一组“事件 -> 副作用”的快捷配置。
 */
export function defineSpringAiEventActions(
  definitions: EventActionDefinitionMap<SpringAiEvent>
): EventActionRegistryResult<SpringAiEvent> {
  return eventToAction<SpringAiEvent>(definitions, {
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeSpringAiEventName(event.event)
        : undefined;
    },
    normalizeEventName: normalizeSpringAiEventName
  });
}
