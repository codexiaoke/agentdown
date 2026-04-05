import type { Component } from 'vue';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponentOverrides
} from '../core/types';
import type {
  AgentRuntime,
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';

export type RunSurfaceRole = 'assistant' | 'user' | 'system';

/**
 * RunSurface 的性能相关配置。
 */
export interface RunSurfacePerformanceOptions {
  /**
   * 组级窗口化一次最多默认渲染多少个 group。
   * 传 `false` 可关闭窗口化。
   */
  groupWindow?: number | false;
  /**
   * 每次向前展开更多消息时增加多少个 group。
   */
  groupWindowStep?: number;
  /**
   * 是否对重型 block 启用接近视口后再挂载。
   */
  lazyMount?: boolean;
  /**
   * 懒挂载观察的 rootMargin。
   */
  lazyMountMargin?: string;
  /**
   * 单个 text block 超过该长度后按 slab 分段渲染。
   */
  textSlabChars?: number;
}

export interface RunSurfaceRendererContext<
  TBlockData extends Record<string, unknown> = Record<string, unknown>,
  TNodeData extends Record<string, unknown> = Record<string, unknown>
> {
  block: SurfaceBlock<TBlockData>;
  node?: RuntimeNode<TNodeData>;
  runtime: AgentRuntime;
  snapshot: RuntimeSnapshot;
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

export type RunSurfaceRendererProps<
  TBlockData extends Record<string, unknown> = Record<string, unknown>,
  TNodeData extends Record<string, unknown> = Record<string, unknown>
> = RunSurfaceRendererContext<TBlockData, TNodeData>;

export type RunSurfaceRendererMode = 'props' | 'context';

export interface RunSurfaceRendererRegistration {
  component: Component;
  mode?: RunSurfaceRendererMode;
  props?: Record<string, unknown> | ((context: RunSurfaceRendererContext) => Record<string, unknown>);
}

export type RunSurfaceRendererMap = Record<string, Component | RunSurfaceRendererRegistration>;

export interface RunSurfaceDraftPlaceholderContext {
  block: SurfaceBlock;
  role: RunSurfaceRole;
  runtime: AgentRuntime;
  snapshot: RuntimeSnapshot;
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

export interface RunSurfaceDraftPlaceholderRegistration {
  component: Component;
  props?:
    | Record<string, unknown>
    | ((context: RunSurfaceDraftPlaceholderContext) => Record<string, unknown>);
}

export type RunSurfaceDraftPlaceholder = Component | RunSurfaceDraftPlaceholderRegistration | false;

export interface RunSurfaceMessageShellContext {
  block: SurfaceBlock;
  role: RunSurfaceRole;
  kind: 'markdown' | 'draft';
  markdownBlock?: MarkdownBlock;
  runtime: AgentRuntime;
  snapshot: RuntimeSnapshot;
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

export interface RunSurfaceMessageShellRegistration {
  component: Component;
  props?:
    | Record<string, unknown>
    | ((context: RunSurfaceMessageShellContext) => Record<string, unknown>);
}

export type RunSurfaceMessageShell = Component | RunSurfaceMessageShellRegistration | false;
export type RunSurfaceMessageShellMap = Partial<Record<RunSurfaceRole, RunSurfaceMessageShell>>;

export interface RunSurfaceOptions {
  slot?: string;
  lineHeight?: number;
  font?: string;
  emptyText?: string;
  performance?: RunSurfacePerformanceOptions;
  aguiComponents?: AguiComponentMap;
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  renderers?: RunSurfaceRendererMap;
  draftPlaceholder?: RunSurfaceDraftPlaceholder;
  messageShells?: RunSurfaceMessageShellMap;
}
