import { computed, inject, type ComputedRef, type InjectionKey } from 'vue';
import type { AguiBinding, AguiRuntime, AguiRuntimeEvent } from '../core/types';

export interface AguiNodeContext<TState = unknown, TEvent = AguiRuntimeEvent> {
  id: Readonly<ComputedRef<string | null>>;
  runtime: AguiRuntime | null;
  binding: Readonly<ComputedRef<AguiBinding<TState, TEvent> | null>>;
  state: Readonly<ComputedRef<TState | null>>;
  children: Readonly<ComputedRef<TState[]>>;
  events: Readonly<ComputedRef<TEvent[]>>;
}

export const AGUI_NODE_CONTEXT_KEY: InjectionKey<AguiNodeContext<unknown, AguiRuntimeEvent> | null> =
  Symbol('AGUI_NODE_CONTEXT_KEY');

const warnedMissingContextHooks = new Set<string>();

/** 在开发环境里提示 hook 被用在了错误的上下文中。 */
function warnMissingContext(hookName: string) {
  if (!import.meta.env.DEV || warnedMissingContextHooks.has(hookName)) {
    return;
  }

  warnedMissingContextHooks.add(hookName);

  console.warn(
    `[Agentdown] ${hookName}() was called outside an AGUI component context. ` +
      'Make sure this component is rendered through :::vue-component and has a runtime-backed wrapper.'
  );
}

/** 从最近的 AGUI wrapper 中解析出当前节点上下文。 */
function resolveAguiNodeContext<TState = unknown, TEvent = AguiRuntimeEvent>(hookName: string) {
  const context = inject(AGUI_NODE_CONTEXT_KEY, null) as AguiNodeContext<TState, TEvent> | null;

  if (!context) {
    warnMissingContext(hookName);
  }

  // 没跑在 AGUI wrapper 里时，也返回一组稳定的只读 computed，方便组件安全复用。
  const id = computed(() => context?.id.value ?? null);
  const binding = computed(() => context?.binding.value ?? null);
  const state = computed(() => context?.state.value ?? null);
  const children = computed(() => context?.children.value ?? []);
  const events = computed(() => context?.events.value ?? []);
  const hasNode = computed(() => binding.value !== null);

  return {
    id,
    runtime: context?.runtime ?? null,
    binding,
    state,
    children,
    events,
    hasNode
  };
}

/** 一次性返回当前 AGUI 节点的完整上下文。 */
export function useAguiNode<TState = unknown, TEvent = AguiRuntimeEvent>() {
  return resolveAguiNodeContext<TState, TEvent>('useAguiNode');
}

/** 返回当前 AGUI 节点 id。 */
export function useAguiNodeId() {
  return resolveAguiNodeContext('useAguiNodeId').id;
}

/** 返回当前 AGUI 节点所在的 runtime。 */
export function useAguiRuntime() {
  return resolveAguiNodeContext('useAguiRuntime').runtime;
}

/** 返回当前 AGUI 节点的 binding。 */
export function useAguiBinding<TState = unknown, TEvent = AguiRuntimeEvent>() {
  return resolveAguiNodeContext<TState, TEvent>('useAguiBinding').binding;
}

/** 返回当前 AGUI 节点的状态 computed。 */
export function useAguiState<TState = unknown, TEvent = AguiRuntimeEvent>() {
  return resolveAguiNodeContext<TState, TEvent>('useAguiState').state;
}

/** 返回当前 AGUI 节点的子节点列表。 */
export function useAguiChildren<TState = unknown, TEvent = AguiRuntimeEvent>() {
  return resolveAguiNodeContext<TState, TEvent>('useAguiChildren').children;
}

/** 返回当前 AGUI 节点的事件流。 */
export function useAguiEvents<TEvent = AguiRuntimeEvent>() {
  return resolveAguiNodeContext<unknown, TEvent>('useAguiEvents').events;
}

/** 判断当前组件是否成功拿到了 AGUI 上下文。 */
export function useAguiHasNode() {
  return resolveAguiNodeContext('useAguiHasNode').hasNode;
}
