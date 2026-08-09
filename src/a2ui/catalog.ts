import {
  BASIC_COMPONENTS,
  BASIC_FUNCTIONS,
  Catalog
} from '@a2ui/web_core/v0_9';
import type { Component, Raw } from 'vue';
import { markRaw } from 'vue';
import A2UiBasicElement from './components/A2UiBasicElement.vue';
import {
  A2UI_BASIC_CATALOG_ID,
  type A2UiVueCatalog,
  type ComponentApi
} from './types';

/** Basic Catalog 中全部由 Agentdown Vue Renderer 支持的组件。 */
export const A2UI_BASIC_COMPONENT_NAMES = Object.freeze(
  BASIC_COMPONENTS.map((component) => component.name)
);

export interface CreateA2UiBasicCatalogOptions {
  /** 按组件名覆盖 Vue 实现；协议 schema 仍由官方 Basic Catalog 校验。 */
  renderers?: Readonly<Record<string, Component>>;
}

/**
 * 创建安全的 A2UI v0.9 Basic Catalog。
 *
 * 官方 `openUrl` 函数会产生浏览器副作用，默认不注册；链接是否可打开由 Vue Renderer 的
 * URL policy 决定。其余函数均为纯计算、格式化或本地校验函数。
 */
export function createA2UiBasicCatalog(
  options: CreateA2UiBasicCatalogOptions = {}
): A2UiVueCatalog<ComponentApi> {
  const pureFunctions = BASIC_FUNCTIONS.filter((implementation) => implementation.name !== 'openUrl');
  const protocol = new Catalog<ComponentApi>(
    A2UI_BASIC_CATALOG_ID,
    BASIC_COMPONENTS,
    pureFunctions
  );
  const renderers: Record<string, Raw<Component>> = {};

  for (const name of A2UI_BASIC_COMPONENT_NAMES) {
    renderers[name] = markRaw(options.renderers?.[name] ?? A2UiBasicElement);
  }

  return {
    id: A2UI_BASIC_CATALOG_ID,
    protocol,
    renderers
  };
}

/** 供零配置 Renderer 复用的默认 Catalog。 */
export const defaultA2UiBasicCatalog = createA2UiBasicCatalog();
