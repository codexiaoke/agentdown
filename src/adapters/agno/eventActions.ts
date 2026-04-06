import { eventToAction, type EventActionDefinitionMap, type EventActionRegistryResult } from '../../runtime/eventActions';
import { normalizeAgnoEventName } from './packet';
import type { AgnoEvent } from './types';

/**
 * 为 Agno 创建一组“事件 -> 副作用”的快捷配置。
 *
 * 这里默认复用 Agno adapter 自己的事件名规范化规则，
 * 所以用户既可以写 `RunCompleted`，也可以写 `run_completed`。
 */
export function defineAgnoEventActions(
  definitions: EventActionDefinitionMap<AgnoEvent>
): EventActionRegistryResult<AgnoEvent> {
  return eventToAction<AgnoEvent>(definitions, {
    resolveEventName(event) {
      return typeof event.event === 'string'
        ? normalizeAgnoEventName(event.event)
        : undefined;
    },
    normalizeEventName: normalizeAgnoEventName
  });
}
