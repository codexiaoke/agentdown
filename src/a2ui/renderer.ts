import type { RunSurfaceRendererRegistration } from '../surface/types';
import A2UiSurface from './components/A2UiSurface.vue';
import { A2UI_SURFACE_RENDERER } from './types';

/**
 * RunSurface 可直接合并的 A2UI renderer。
 *
 * 使用 context 模式后，A2UiSurface 会从 block.data 读取可序列化消息，并把交互写入
 * runtime intent 历史，供宿主发送给 AG-UI 后端。
 */
export const a2uiRunSurfaceRenderer: RunSurfaceRendererRegistration = {
  component: A2UiSurface,
  mode: 'context'
};

export const a2uiRunSurfaceRenderers = {
  [A2UI_SURFACE_RENDERER]: a2uiRunSurfaceRenderer
};
