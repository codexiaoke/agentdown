import { A2UI_SURFACE_RENDERER, A2UiSurface, defaultA2UiBasicCatalog } from '../../a2ui';
import { createAgUiAdapter } from '../../adapters/agui';
import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import type { RunSurfaceRendererContext } from '../../surface/types';
import { createAgUiA2UiCombinedProtocol } from './protocol';
import type { AgUiA2UiAdapterOptions } from './types';
import type { AgUiEvent } from '../../adapters/agui';

/** 创建显式启用 A2UI 扩展的 AG-UI adapter。 */
export function createAgUiA2UiAdapter<
  TSource = AsyncIterable<AgUiEvent> | Iterable<AgUiEvent>
>(options: AgUiA2UiAdapterOptions<TSource> = {}): AgentdownAdapter<AgUiEvent, TSource> {
  const {
    a2uiProtocol,
    a2uiProtocolOptions,
    a2uiRenderer,
    ...agUiOptions
  } = options;
  const protocolOptions = {
    ...(options.protocolOptions ?? {}),
    ...(options.title !== undefined && options.protocolOptions?.defaultRunTitle === undefined
      ? { defaultRunTitle: options.title }
      : {})
  };
  const protocol = options.protocol ?? createAgUiA2UiCombinedProtocol({
    agUi: protocolOptions,
    ...(a2uiProtocol ? { a2uiProtocol } : {}),
    ...(a2uiProtocolOptions ? { a2ui: a2uiProtocolOptions } : {})
  });
  const catalogs = a2uiRenderer?.catalogs ?? [defaultA2UiBasicCatalog];

  return createAgUiAdapter<TSource>({
    ...agUiOptions,
    protocol,
    surface: {
      ...(options.surface ?? {}),
      renderers: {
        [A2UI_SURFACE_RENDERER]: {
          component: A2UiSurface,
          mode: 'context',
          props: (context: RunSurfaceRendererContext) => ({
            ...context,
            catalogs,
            ...(a2uiRenderer?.version ? { version: a2uiRenderer.version } : {}),
            ...(a2uiRenderer?.includeInlineCatalogs !== undefined
              ? { includeInlineCatalogs: a2uiRenderer.includeInlineCatalogs }
              : {}),
            ...(a2uiRenderer?.securityPolicy
              ? { securityPolicy: a2uiRenderer.securityPolicy }
              : {}),
            ...(a2uiRenderer?.actionHandlers
              ? { actionHandlers: a2uiRenderer.actionHandlers }
              : {}),
            ...(a2uiRenderer?.actionStateSource
              ? { actionStateSource: a2uiRenderer.actionStateSource }
              : {}),
            ...(a2uiRenderer?.retryExecution
              ? { retryExecution: a2uiRenderer.retryExecution }
              : {}),
            ...(a2uiRenderer?.onActionStateChange
              ? { onActionStateChange: a2uiRenderer.onActionStateChange }
              : {})
          })
        },
        ...(options.surface?.renderers ?? {})
      }
    }
  });
}
