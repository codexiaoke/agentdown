import { inject, provide, type ComputedRef, type InjectionKey } from 'vue';
import type {
  AgentRuntime,
  RuntimeIntent,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';
import type {
  RunSurfaceApprovalActionsOptions,
  RunSurfaceRole
} from './types';

/**
 * RunSurface 内单个 block 子树共享的运行态上下文。
 *
 * 这让 approval / artifact 这类内置 markdown 组件在被 RunSurface 包裹时，
 * 仍然能拿到 block、role、runtime 和 surface 级配置。
 */
export interface RunSurfaceBlockContext {
  /** 当前正在渲染的 surface block。 */
  block: ComputedRef<SurfaceBlock>;
  /** 当前 block 所属消息角色。 */
  role: ComputedRef<RunSurfaceRole>;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的响应式快照。 */
  snapshot: ComputedRef<RuntimeSnapshot>;
  /** 当前 RunSurface 为 approval 卡片配置的动作区域。 */
  approvalActions: ComputedRef<RunSurfaceApprovalActionsOptions | false | undefined>;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * RunSurface block 上下文的注入 key。
 */
const RUN_SURFACE_BLOCK_CONTEXT_KEY: InjectionKey<RunSurfaceBlockContext> = Symbol('agentdown-run-surface-block-context');

/**
 * 在当前组件子树里注入 RunSurface block 上下文。
 */
export function provideRunSurfaceBlockContext(context: RunSurfaceBlockContext) {
  provide(RUN_SURFACE_BLOCK_CONTEXT_KEY, context);
}

/**
 * 读取最近一层 RunSurface block 上下文。
 *
 * 如果当前组件并不在 RunSurface 里渲染，则返回 `null`。
 */
export function useRunSurfaceBlockContext(): RunSurfaceBlockContext | null {
  return inject(RUN_SURFACE_BLOCK_CONTEXT_KEY, null);
}
