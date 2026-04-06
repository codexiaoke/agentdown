import { eventToAction, type EventActionDefinitionMap, type EventActionRegistryResult } from '../../runtime/eventActions';
import { normalizeLangChainEventName } from './packet';
import type { LangChainEvent } from './types';

/**
 * 为 LangChain 创建一组“事件 -> 副作用”的快捷配置。
 */
export function defineLangChainEventActions(
  definitions: EventActionDefinitionMap<LangChainEvent>
): EventActionRegistryResult<LangChainEvent> {
  return eventToAction<LangChainEvent>(definitions, {
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeLangChainEventName(event.event)
        : undefined;
    },
    normalizeEventName: normalizeLangChainEventName
  });
}
