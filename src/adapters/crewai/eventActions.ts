import { eventToAction, type EventActionDefinitionMap, type EventActionRegistryResult } from '../../runtime/eventActions';
import { normalizeCrewAIEventName } from './packet';
import type { CrewAIEvent } from './types';

/**
 * 为 CrewAI 创建一组“事件 -> 副作用”的快捷配置。
 */
export function defineCrewAIEventActions(
  definitions: EventActionDefinitionMap<CrewAIEvent>
): EventActionRegistryResult<CrewAIEvent> {
  return eventToAction<CrewAIEvent>(definitions, {
    resolveEventName(event) {
      const normalized = normalizeCrewAIEventName(event);
      return normalized.length > 0
        ? normalized
        : undefined;
    },
    normalizeEventName(name) {
      return normalizeCrewAIEventName({
        event: name
      });
    }
  });
}
