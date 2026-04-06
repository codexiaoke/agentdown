import { eventToAction, type EventActionDefinitionMap, type EventActionRegistryResult } from '../../runtime/eventActions';
import { normalizeAutoGenEventName } from './packet';
import type { AutoGenEvent } from './types';

/**
 * 为 AutoGen 创建一组“事件 -> 副作用”的快捷配置。
 */
export function defineAutoGenEventActions(
  definitions: EventActionDefinitionMap<AutoGenEvent>
): EventActionRegistryResult<AutoGenEvent> {
  return eventToAction<AutoGenEvent>(definitions, {
    resolveEventName(event) {
      return typeof event.type === 'string'
        ? normalizeAutoGenEventName(event.type)
        : undefined;
    },
    normalizeEventName: normalizeAutoGenEventName
  });
}
