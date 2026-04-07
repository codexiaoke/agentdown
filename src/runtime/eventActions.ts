import type { BridgeHooks } from './types';

/**
 * 事件名匹配时支持的字符串匹配模式。
 */
export type EventActionMatchMode = 'exact' | 'includes';

/**
 * 单条事件副作用规则可使用的匹配值。
 *
 * - 字符串：按 `mode` 做精确匹配或包含匹配
 * - 正则：直接执行 `test()`
 */
export type EventActionMatcher = string | RegExp;

/**
 * 事件副作用在执行时可用的上下文信息。
 */
export interface EventActionContext<TRawEvent> {
  /** 当前处理的原始事件。 */
  event: TRawEvent;
  /** 当前事件经 helper 解析后的事件名。 */
  eventName?: string;
}

/**
 * 一条副作用规则真正被执行后的结构化记录。
 */
export interface EventActionExecutionRecord<TRawEvent> {
  /** 当前命中的规则 key。 */
  key: string;
  /** 当前副作用对应的原始事件。 */
  event: TRawEvent;
  /** 当前事件解析后的事件名。 */
  eventName?: string;
  /** 当前规则是否命中了事件名匹配。 */
  matchedByName: boolean;
  /** 当前规则是否命中了自定义谓词。 */
  matchedByPredicate: boolean;
  /** 当前副作用被执行的时间戳。 */
  at: number;
}

/**
 * 单条“事件 -> 副作用”定义结构。
 */
export interface EventActionDefinition<TRawEvent> {
  /** 这条规则会命中的事件名。 */
  on?: EventActionMatcher | EventActionMatcher[];
  /** 字符串匹配时采用的模式；默认 `exact`。 */
  mode?: EventActionMatchMode;
  /** 如果还需要更复杂的判定，可以追加一个自定义 match。 */
  match?: (input: EventActionContext<TRawEvent>) => boolean;
  /** 命中后执行的副作用。 */
  run: (input: EventActionContext<TRawEvent>) => void;
}

/**
 * 一组“规则名 -> 事件副作用”的映射表。
 */
export type EventActionDefinitionMap<TRawEvent> = Record<string, EventActionDefinition<TRawEvent>>;

/**
 * `eventToAction()` 的轻量配置。
 */
export interface EventToActionOptions<TRawEvent> {
  /** 如何从原始事件里读取当前事件名。 */
  resolveEventName: (event: TRawEvent) => string | undefined;
  /** 如何规范化事件名；默认只做 trim。 */
  normalizeEventName?: (name: string) => string;
}

/**
 * 事件副作用 helper 最终产出的能力集合。
 */
export interface EventActionRegistryResult<TRawEvent> {
  /** 手动触发一次原始事件处理。 */
  handleEvent: (packet: TRawEvent) => EventActionExecutionRecord<TRawEvent>[];
  /** 只分析当前事件会命中哪些副作用，但不真正执行。 */
  inspectEvent: (packet: TRawEvent) => EventActionExecutionRecord<TRawEvent>[];
  /** 可直接挂到 bridge 上的 hooks。 */
  hooks: BridgeHooks<TRawEvent>;
}

/**
 * 默认的事件名规范化规则。
 */
function defaultNormalizeEventName(name: string): string {
  return name.trim();
}

/**
 * 把字符串或数组统一转成数组，便于后续遍历。
 */
function normalizeMatchers(value: EventActionMatcher | EventActionMatcher[]): EventActionMatcher[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 判断一个事件名是否命中了当前 matcher。
 */
function matchesEventName(
  rawEventName: string,
  normalizedEventName: string,
  matcher: EventActionMatcher,
  mode: EventActionMatchMode,
  normalizeEventName: (name: string) => string
): boolean {
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;

    if (matcher.test(rawEventName)) {
      return true;
    }

    matcher.lastIndex = 0;
    return rawEventName === normalizedEventName
      ? false
      : matcher.test(normalizedEventName);
  }

  const normalizedMatcher = normalizeEventName(matcher);

  return mode === 'includes'
    ? normalizedEventName.includes(normalizedMatcher)
    : normalizedEventName === normalizedMatcher;
}

/**
 * 创建一个更自然的“事件 -> 业务副作用” helper。
 *
 * 常见用途：
 * - 收到 `CreateSession` 后缓存后端生成的 sessionId
 * - 收到 `AuthExpired` 后刷新 token 或跳转登录
 * - 收到某个纯业务事件后更新外部 store，而不是渲染 UI
 */
export function eventToAction<TRawEvent>(
  definitions: EventActionDefinitionMap<TRawEvent>,
  options: EventToActionOptions<TRawEvent>
): EventActionRegistryResult<TRawEvent> {
  const normalizeEventName = options.normalizeEventName ?? defaultNormalizeEventName;
  const normalizedDefinitions = Object.entries(definitions);

  /**
   * 分析一条事件会命中哪些副作用规则。
   */
  function inspectEvent(packet: TRawEvent): EventActionExecutionRecord<TRawEvent>[] {
    const rawEventName = options.resolveEventName(packet);
    const normalizedEventName = rawEventName ? normalizeEventName(rawEventName) : undefined;
    const executions: EventActionExecutionRecord<TRawEvent>[] = [];

    for (const [key, definition] of normalizedDefinitions) {
      const context: EventActionContext<TRawEvent> = {
        event: packet,
        ...(normalizedEventName !== undefined ? { eventName: normalizedEventName } : {})
      };
      const matchers = definition.on
        ? normalizeMatchers(definition.on)
        : [];
      const mode = definition.mode ?? 'exact';
      const matchedByName = rawEventName && normalizedEventName
        ? matchers.some((matcher) => matchesEventName(
            rawEventName,
            normalizedEventName,
            matcher,
            mode,
            normalizeEventName
          ))
        : false;
      const matchedByPredicate = definition.match?.(context) ?? false;

      if (!matchedByName && !matchedByPredicate) {
        continue;
      }

      executions.push({
        key,
        event: packet,
        ...(normalizedEventName !== undefined ? { eventName: normalizedEventName } : {}),
        matchedByName,
        matchedByPredicate,
        at: Date.now()
      });
    }

    return executions;
  }

  /**
   * 把单个原始事件分发到命中的副作用规则。
   */
  function handleEvent(packet: TRawEvent): EventActionExecutionRecord<TRawEvent>[] {
    const executions = inspectEvent(packet);

    for (const execution of executions) {
      const definition = definitions[execution.key];

      if (!definition) {
        continue;
      }

      definition.run({
        event: packet,
        ...(execution.eventName !== undefined ? { eventName: execution.eventName } : {})
      });
    }

    return executions;
  }

  const packetHook = (packet: TRawEvent) => {
    handleEvent(packet);
  };

  return {
    handleEvent,
    inspectEvent,
    hooks: {
      onPacket: Object.assign(packetHook, {
        __agentdownEventActionFromHandle: true as const
      })
    }
  };
}
