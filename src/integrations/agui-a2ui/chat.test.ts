import { effectScope } from 'vue';
import { describe, expect, it } from 'vitest';
import { A2UI_BASIC_CATALOG_ID, A2UI_SURFACE_RENDERER } from '../../a2ui';
import type { RunSurfaceRendererContext, RunSurfaceRendererRegistration } from '../../surface/types';
import { serializeAgUiA2UiForwardedProps, useAgUiA2UiChatSession } from './chat';

describe('useAgUiA2UiChatSession', () => {
  it('installs the opt-in interactive A2UI renderer', () => {
    const scope = effectScope();
    const session = scope.run(() => useAgUiA2UiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:test'
    }));
    expect(session).toBeDefined();

    const registration = session!.surface.value.renderers?.[
      A2UI_SURFACE_RENDERER
    ] as RunSurfaceRendererRegistration;
    const block = {
      id: 'block:a2ui:thread:test:planner',
      data: { surfaceId: 'planner', messages: [] }
    };
    const rendererProps = typeof registration.props === 'function'
      ? registration.props({ block } as unknown as RunSurfaceRendererContext)
      : registration.props;

    expect(rendererProps).toMatchObject({
      block,
      catalogs: [expect.objectContaining({ id: A2UI_BASIC_CATALOG_ID })]
    });
    expect(rendererProps?.onClientMessage).toEqual(expect.any(Function));
    expect(session!.a2uiClientError.value).toBeNull();

    scope.stop();
  });

  it('serializes standard A2UI client protocol fields without discarding app props', () => {
    const result = serializeAgUiA2UiForwardedProps({
      envelope: {
        message: {
          version: 'v0.9.1',
          action: {
            name: 'submit',
            surfaceId: 'planner',
            sourceComponentId: 'button',
            timestamp: '2026-08-09T00:00:00.000Z',
            context: { city: '杭州' }
          }
        },
        capabilities: {
          'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
        },
        dataModel: {
          version: 'v0.9.1',
          surfaces: { planner: { city: '杭州' } }
        }
      },
      forwardedProps: { tenantId: 'tenant-1' },
      source: '/api/stream/agui',
      transportContext: undefined
    });

    expect(result).toEqual({
      tenantId: 'tenant-1',
      a2ui: {
        clientMessage: expect.objectContaining({ version: 'v0.9.1' }),
        clientCapabilities: {
          'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
        },
        clientDataModel: {
          version: 'v0.9.1',
          surfaces: { planner: { city: '杭州' } }
        }
      }
    });
  });
});
