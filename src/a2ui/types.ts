import type {
  A2uiClientAction,
  A2uiMessage,
  Catalog,
  ComponentApi,
  SurfaceModel
} from '@a2ui/web_core/v0_9';
import type { Component } from 'vue';

/** Agentdown 内置的 A2UI v0.9 Basic Catalog 标识。 */
export const A2UI_BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

/** RunSurface 中承载 A2UI Surface 的 renderer key。 */
export const A2UI_SURFACE_RENDERER = 'a2ui.surface';

/**
 * A2UI 消息进入浏览器前的资源和安全限制。
 *
 * Catalog 只允许已注册组件；URL 只允许显式协议；组件数量和递归深度都有硬上限。
 */
export interface A2UiSecurityPolicy {
  maxMessageBytes: number;
  maxMessages: number;
  maxComponents: number;
  maxDepth: number;
  maxStringLength: number;
  allowedUrlProtocols: ReadonlySet<string>;
}

/** 默认策略适合聊天消息中的中小型交互 Surface。 */
export const DEFAULT_A2UI_SECURITY_POLICY: A2UiSecurityPolicy = {
  maxMessageBytes: 128 * 1024,
  maxMessages: 256,
  maxComponents: 256,
  maxDepth: 24,
  maxStringLength: 16 * 1024,
  allowedUrlProtocols: new Set(['https:', 'http:'])
};

/** Vue 侧拥有的组件 Catalog：协议定义和实际 Vue 实现必须成对注册。 */
export interface A2UiVueCatalog<T extends ComponentApi = ComponentApi> {
  id: string;
  protocol: Catalog<T>;
  renderers: Readonly<Record<string, Component>>;
}

/** A2UI Renderer 可接收的单条子组件引用。 */
export interface A2UiChildReference {
  id: string;
  basePath: string;
}

/** 默认 Vue 组件实现收到的统一 props。 */
export interface A2UiElementProps {
  componentType: string;
  componentId: string;
  resolvedProps: Record<string, unknown>;
  surface: SurfaceModel<ComponentApi>;
  securityPolicy: A2UiSecurityPolicy;
}

/** RunSurface block 中可序列化、可归档恢复的 A2UI 数据。 */
export interface A2UiSurfaceBlockData extends Record<string, unknown> {
  surfaceId: string;
  messages: A2uiMessage[];
  rootId?: string;
}

/** Renderer 向宿主上报的标准 A2UI 客户端动作。 */
export type A2UiAction = A2uiClientAction;

/** A2UI Surface 处理错误的统一上下文。 */
export interface A2UiErrorContext {
  phase: 'validation' | 'processing' | 'rendering' | 'action';
  error: unknown;
  message?: unknown;
  surfaceId?: string;
  componentId?: string;
}

export type { A2uiClientAction, A2uiMessage, ComponentApi, SurfaceModel };
