import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { a2uiRunSurfaceRenderers } from '../../a2ui';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createAgUiProtocol } from './protocol';
import type { AgUiAdapterOptions, AgUiEvent, AgUiProtocolOptions } from './types';

/** 创建 AG-UI 标准 starter adapter，并默认注册 A2UI Vue Renderer。 */
export function createAgUiAdapter<
  TSource = AsyncIterable<AgUiEvent> | Iterable<AgUiEvent>
>(options: AgUiAdapterOptions<TSource> = {}): AgentdownAdapter<AgUiEvent, TSource> {
  return createFrameworkAdapter<
    AgUiEvent,
    TSource,
    AgUiProtocolOptions,
    AgUiProtocolOptions['defaultRunTitle'],
    undefined,
    undefined,
    AgUiAdapterOptions<TSource>
  >({
    name: 'ag-ui',
    options: {
      ...options,
      surface: {
        ...(options.surface ?? {}),
        renderers: {
          ...a2uiRunSurfaceRenderers,
          ...(options.surface?.renderers ?? {})
        }
      }
    },
    createProtocol: createAgUiProtocol
  });
}
