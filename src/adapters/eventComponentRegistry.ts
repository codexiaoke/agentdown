import type { Component } from 'vue';
import { cmd } from '../runtime/defineProtocol';
import type {
  ProtocolContext,
  RuntimeCommand,
  RuntimeData,
  RuntimeProtocol
} from '../runtime/types';
import { toArray } from '../runtime/utils';
import type {
  RunSurfaceRendererMap,
  RunSurfaceRendererRegistration
} from '../surface/types';

/**
 * 事件名匹配时支持的字符串匹配模式。
 */
export type EventNameMatchMode = 'exact' | 'includes';

/**
 * 单条事件规则可使用的匹配值。
 *
 * - 字符串：按 `mode` 做精确匹配或包含匹配
 * - 正则：直接执行 `test()`
 */
export type EventNameMatcher = string | RegExp;

/**
 * 事件组件规则在命中后返回的 block 描述。
 *
 * 默认行为：
 * - `mode` 默认是 `patch`
 * - `type` 默认是 `event`
 * - `slot` 默认是 `main`
 * - `state` 默认是 `stable`
 *
 * 之所以默认用 `patch`，是因为 runtime 在 block 已存在时不会把它重新挪到末尾，
 * 更适合 SSE 场景里“同一个组件持续更新”的常见需求。
 */
export interface EventComponentBlockInput {
  /** block id；不传时会自动生成一个。 */
  id?: string;
  /** block 所在 slot。 */
  slot?: string;
  /** block 类型；默认 `event`。 */
  type?: string;
  /** block 渲染状态；默认 `stable`。 */
  state?: 'draft' | 'stable';
  /** 关联的 runtime node id。 */
  nodeId?: string | null;
  /** 所属消息分组 id。 */
  groupId?: string | null;
  /** 可选的字符串内容。 */
  content?: string;
  /** 传给组件的结构化数据。 */
  data?: RuntimeData;
  /** 当前事件时间戳。 */
  at?: number;
  /** 当 mode=`insert` 时，插到哪个 block 前面。 */
  beforeId?: string;
  /** 当 mode=`insert` 时，插到哪个 block 后面。 */
  afterId?: string;
  /** block 写入方式；默认 `patch`。 */
  mode?: 'insert' | 'upsert' | 'patch';
  /** 允许在少数场景下覆盖当前定义对应的 renderer key。 */
  renderer?: string;
}

/**
 * 事件组件 helper 在执行 resolve/match 时可用的上下文信息。
 */
export interface EventComponentResolveContext<TRawEvent> {
  /** 当前处理的原始事件。 */
  event: TRawEvent;
  /** 协议执行上下文。 */
  context: ProtocolContext;
  /** 当前事件经 helper 解析后的事件名。 */
  eventName?: string;
  /** 当前定义默认对应的 renderer key。 */
  renderer: string;
}

/**
 * 单条“事件 -> 组件”定义结构。
 */
export interface EventComponentDefinition<TRawEvent> {
  /** 这条规则会命中的事件名。 */
  on?: EventNameMatcher | EventNameMatcher[];
  /** 字符串匹配时采用的模式；默认 `exact`。 */
  mode?: EventNameMatchMode;
  /** 如果还需要更复杂的判定，可以追加一个自定义 match。 */
  match?: (input: EventComponentResolveContext<TRawEvent>) => boolean;
  /** 命中后注册到 `surface.renderers` 的 Vue 组件。 */
  component?: Component;
  /** 如果需要完整 renderer registration，可直接传这个字段。 */
  registration?: Component | RunSurfaceRendererRegistration;
  /** 把原始事件解析成一个或多个 block 输入。 */
  resolve: (
    input: EventComponentResolveContext<TRawEvent>
  ) => EventComponentBlockInput | EventComponentBlockInput[] | null | void;
}

/**
 * 一组“renderer key -> 事件组件规则”的映射表。
 */
export type EventComponentDefinitionMap<TRawEvent> = Record<string, EventComponentDefinition<TRawEvent>>;

/**
 * 创建事件组件注册器时的共享配置。
 */
export interface EventComponentRegistrySharedOptions {
  /** 如何规范化事件名；默认只做 trim。 */
  normalizeEventName?: (name: string) => string;
}

/**
 * 通用事件组件注册器的完整配置。
 */
export interface EventComponentRegistryOptions<TRawEvent>
  extends EventComponentRegistrySharedOptions {
  /** 一组 renderer 规则。 */
  definitions: EventComponentDefinitionMap<TRawEvent>;
  /** 如何从原始事件里读取当前事件名。 */
  resolveEventName: (event: TRawEvent) => string | undefined;
}

/**
 * 事件组件注册器最终产出的能力集合。
 */
export interface EventComponentRegistryResult<TRawEvent> {
  /** 直接给 `surface.renderers` 使用的 renderer 映射。 */
  renderers: RunSurfaceRendererMap;
  /** 供自定义 protocol 手动调用的命令映射函数。 */
  mapEvent: (input: {
    packet: TRawEvent;
    context: ProtocolContext;
  }) => RuntimeCommand[];
  /** 开箱即用的协议对象，可直接和其他 protocol 组合。 */
  protocol: RuntimeProtocol<TRawEvent>;
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
function normalizeMatchers(value: EventNameMatcher | EventNameMatcher[]): EventNameMatcher[] {
  return toArray(value);
}

/**
 * 判断一个事件名是否命中了当前 matcher。
 */
function matchesEventName(
  rawEventName: string,
  normalizedEventName: string,
  matcher: EventNameMatcher,
  mode: EventNameMatchMode,
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
 * 从定义表中提取 surface renderers。
 */
function collectEventRenderers<TRawEvent>(
  definitions: EventComponentDefinitionMap<TRawEvent>
): RunSurfaceRendererMap {
  const renderers: RunSurfaceRendererMap = {};

  for (const [renderer, definition] of Object.entries(definitions)) {
    if (definition.registration) {
      renderers[renderer] = definition.registration;
      continue;
    }

    if (definition.component) {
      renderers[renderer] = definition.component;
    }
  }

  return renderers;
}

/**
 * 把一条 block 输入转换成 runtime 命令。
 */
function createEventBlockCommands<TRawEvent>(
  renderer: string,
  input: EventComponentBlockInput,
  packet: TRawEvent,
  context: ProtocolContext
): RuntimeCommand[] {
  const blockId = input.id ?? context.makeId('event-block');
  const updatedAt = input.at ?? context.now();
  const resolvedRenderer = input.renderer ?? renderer;
  const resolvedData: RuntimeData = {
    rawEvent: packet as RuntimeData,
    ...(input.data ?? {})
  };

  switch (input.mode ?? 'patch') {
    case 'insert':
      return [
        cmd.block.insert(
          {
            id: blockId,
            slot: input.slot ?? 'main',
            type: input.type ?? 'event',
            renderer: resolvedRenderer,
            state: input.state ?? 'stable',
            ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
            ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
            ...(input.content !== undefined ? { content: input.content } : {}),
            data: resolvedData,
            createdAt: updatedAt,
            updatedAt
          },
          {
            ...(input.beforeId ? { beforeId: input.beforeId } : {}),
            ...(input.afterId ? { afterId: input.afterId } : {})
          }
        )
      ];
    case 'upsert':
      return [
        cmd.block.upsert({
          id: blockId,
          slot: input.slot ?? 'main',
          type: input.type ?? 'event',
          renderer: resolvedRenderer,
          state: input.state ?? 'stable',
          ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          data: resolvedData,
          createdAt: updatedAt,
          updatedAt
        })
      ];
    case 'patch':
    default:
      return [
        cmd.block.patch(blockId, {
          slot: input.slot ?? 'main',
          type: input.type ?? 'event',
          renderer: resolvedRenderer,
          state: input.state ?? 'stable',
          ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          data: resolvedData,
          updatedAt
        })
      ];
  }
}

/**
 * 创建一个通用“事件 -> 自定义组件”的注册器。
 *
 * 常见用途：
 * - SSE 某个事件到来后直接渲染一张业务卡片
 * - 同一个事件反复到来时持续 patch 同一个组件
 * - 把事件匹配逻辑和 surface.renderers 注册收敛到同一份配置里
 */
export function createEventComponentRegistry<TRawEvent>(
  options: EventComponentRegistryOptions<TRawEvent>
): EventComponentRegistryResult<TRawEvent> {
  const normalizeEventName = options.normalizeEventName ?? defaultNormalizeEventName;
  const definitions = Object.entries(options.definitions).map(([renderer, definition]) => ({
    renderer,
    definition
  }));
  const renderers = collectEventRenderers(options.definitions);

  /**
   * 把单个原始事件映射成一组 block 命令。
   */
  function mapEvent(input: {
    packet: TRawEvent;
    context: ProtocolContext;
  }): RuntimeCommand[] {
    const rawEventName = options.resolveEventName(input.packet);
    const normalizedEventName = rawEventName ? normalizeEventName(rawEventName) : undefined;
    const commands: RuntimeCommand[] = [];

    for (const entry of definitions) {
      const resolveContext: EventComponentResolveContext<TRawEvent> = {
        event: input.packet,
        context: input.context,
        renderer: entry.renderer,
        ...(normalizedEventName !== undefined ? { eventName: normalizedEventName } : {})
      };
      const matchers = entry.definition.on
        ? normalizeMatchers(entry.definition.on)
        : [];
      const mode = entry.definition.mode ?? 'exact';
      const matchedByName = rawEventName && normalizedEventName
        ? matchers.some((matcher) => matchesEventName(
            rawEventName,
            normalizedEventName,
            matcher,
            mode,
            normalizeEventName
          ))
        : false;
      const matchedByPredicate = entry.definition.match?.(resolveContext) ?? false;

      if (!matchedByName && !matchedByPredicate) {
        continue;
      }

      const resolvedInputs = entry.definition.resolve(resolveContext);

      for (const resolvedInput of toArray(resolvedInputs ?? [])) {
        if (!resolvedInput) {
          continue;
        }

        commands.push(
          ...createEventBlockCommands(
            entry.renderer,
            resolvedInput,
            input.packet,
            input.context
          )
        );
      }
    }

    return commands;
  }

  return {
    renderers,
    mapEvent,
    protocol: {
      map({ packet, context }) {
        return mapEvent({
          packet,
          context
        });
      }
    }
  };
}
