import { eventToBlock, type EventComponentDefinitionMap, type EventComponentRegistryResult, type EventComponentRegistrySharedOptions } from '../eventComponentRegistry';
import { normalizeLangChainEventName } from './packet';
import type { LangChainEvent } from './types';

/**
 * 为 LangChain 创建一组“事件 -> 自定义组件”的快捷配置。
 */
export function defineLangChainEventComponents(
  definitions: EventComponentDefinitionMap<LangChainEvent>,
  options: EventComponentRegistrySharedOptions = {}
): EventComponentRegistryResult<LangChainEvent> {
  return eventToBlock<LangChainEvent>(definitions, {
    ...options,
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeLangChainEventName(event.event)
        : undefined;
    },
    normalizeEventName: options.normalizeEventName ?? normalizeLangChainEventName
  });
}
