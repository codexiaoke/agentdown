import { describe, expect, it, vi } from 'vitest';
import { createA2UiBasicCatalog } from './catalog';
import { createA2UiClientCapabilities, createA2UiProcessor } from './processor';
import { createA2UiSurfaceController } from './surfaceController';
import { A2UI_BASIC_COMPONENT_NAMES } from './catalog';
import {
  A2UI_BASIC_CATALOG_ID,
  createA2UiActionStateKey,
  type A2UiActionExecutionSnapshot,
  type A2UiActionExecutionStateListener,
  type A2UiActionStateSource
} from './types';

class MutableActionStateSource implements A2UiActionStateSource {
  snapshot: A2UiActionExecutionSnapshot;
  readonly listeners = new Set<A2UiActionExecutionStateListener>();

  constructor(surfaceId: string) {
    this.snapshot = { surfaceId, interactionDisabled: false, states: {} };
  }

  getSnapshot(): A2UiActionExecutionSnapshot {
    return this.snapshot;
  }

  subscribe(_surfaceId: string, listener: A2UiActionExecutionStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(snapshot: A2UiActionExecutionSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function createMessages() {
  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId: 'planner',
        catalogId: A2UI_BASIC_CATALOG_ID,
        sendDataModel: true
      }
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['title', 'city', 'submit']
          },
          {
            id: 'title',
            component: 'Text',
            text: { path: '/title' },
            variant: 'h2'
          },
          {
            id: 'city',
            component: 'TextField',
            label: '城市',
            value: { path: '/city' }
          },
          {
            id: 'submit',
            component: 'Button',
            child: 'submit-label',
            action: {
              event: {
                name: 'trip_submitted',
                context: { city: { path: '/city' } }
              }
            }
          },
          {
            id: 'submit-label',
            component: 'Text',
            text: '生成计划'
          }
        ]
      }
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'planner',
        path: '/',
        value: { title: '周末旅行', city: '杭州' }
      }
    }
  ];
}

describe('createA2UiProcessor', () => {
  it('creates capabilities before a surface exists', () => {
    expect(createA2UiClientCapabilities({
      catalogs: [createA2UiBasicCatalog()]
    })).toEqual({
      'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
    });
  });

  it('processes official v0.9 surface, components and data model messages', () => {
    const controller = createA2UiProcessor({ catalogs: [createA2UiBasicCatalog()] });
    const messages = createMessages();

    controller.process(messages[0]);
    expect(controller.getSurface('planner')).toBeDefined();
    expect(controller.getSurface('planner')?.componentsModel.get('title')).toBeUndefined();

    controller.process(messages[1]);
    expect(controller.getSurface('planner')?.componentsModel.get('title')?.type).toBe('Text');
    expect(controller.getSurface('planner')?.dataModel.get('/city')).toBeUndefined();

    controller.process(messages[2]);

    const surface = controller.getSurface('planner');
    expect(surface?.dataModel.get('/city')).toBe('杭州');
    expect(controller.getClientDataModel()).toEqual({
      version: 'v0.9.1',
      surfaces: {
        planner: { title: '周末旅行', city: '杭州' }
      }
    });
    expect(controller.getClientCapabilities()).toEqual({
      'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
    });

    controller.dispose();
  });

  it('emits a standard A2UI client action', async () => {
    const onAction = vi.fn();
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      onAction
    });
    controller.process(createMessages());

    await controller.getSurface('planner')?.dispatchAction({
      event: {
        name: 'trip_submitted',
        context: { city: '杭州' }
      }
    }, 'submit');

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'trip_submitted',
      surfaceId: 'planner',
      sourceComponentId: 'submit',
      context: { city: '杭州' }
    }));

    controller.dispose();
  });

  it('rejects unknown catalogs and components', () => {
    const controller = createA2UiProcessor({ catalogs: [createA2UiBasicCatalog()] });

    expect(() => controller.process({
      version: 'v0.9',
      createSurface: { surfaceId: 'bad', catalogId: 'https://evil.invalid/catalog.json' }
    })).toThrow('catalog is not allowed');

    controller.process(createMessages()[0]);
    expect(() => controller.process({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [{ id: 'root', component: 'ArbitraryScript', source: 'alert(1)' }]
      }
    })).toThrow('component is not registered');

    controller.dispose();
  });

  it('enforces resource limits and blocks prototype pollution keys', () => {
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      policy: { maxComponents: 1 }
    });
    controller.process(createMessages()[0]);

    expect(() => controller.process({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [
          { id: 'one', component: 'Text', text: 'one' },
          { id: 'two', component: 'Text', text: 'two' }
        ]
      }
    })).toThrow('exceeds 1 components');

    const polluted = JSON.parse('{"version":"v0.9","updateDataModel":{"surfaceId":"planner","path":"/","value":{"__proto__":{"admin":true}}}}');
    expect(() => controller.process(polluted)).toThrow('forbidden key');

    controller.dispose();
  });

  it('does not register the side-effecting openUrl function by default', () => {
    const catalog = createA2UiBasicCatalog();

    expect(catalog.protocol.functions.has('formatString')).toBe(true);
    expect(catalog.protocol.functions.has('openUrl')).toBe(false);
  });

  it('registers a frontend-owned Vue renderer for every Basic Catalog component', () => {
    const catalog = createA2UiBasicCatalog();

    expect(Object.keys(catalog.renderers).sort()).toEqual(
      [...A2UI_BASIC_COMPONENT_NAMES].sort()
    );
  });

  it('measures message limits as UTF-8 bytes', () => {
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      policy: { maxMessageBytes: 170 }
    });

    expect(() => controller.process({
      version: 'v0.9',
      createSurface: {
        surfaceId: `planner-${'杭'.repeat(20)}`,
        catalogId: A2UI_BASIC_CATALOG_ID
      }
    })).toThrow('exceeds 170 bytes');

    controller.dispose();
  });

  it('keeps browser-local data when server history only appends', () => {
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()]
    });
    const messages = createMessages();

    expect(controller.sync(messages)).toMatchObject({ mode: 'rebuild', processed: 3 });
    const originalSurface = controller.getSurface();
    originalSurface?.dataModel.set('/city', '苏州');

    const update = {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 'planner',
        path: '/title',
        value: '新的周末计划'
      }
    };
    expect(controller.sync([...messages, update])).toMatchObject({ mode: 'append', processed: 1 });
    expect(controller.getSurface()).toBe(originalSurface);
    expect(controller.getSurface()?.dataModel.get('/city')).toBe('苏州');
    expect(controller.getSurface()?.dataModel.get('/title')).toBe('新的周末计划');

    controller.dispose();
  });

  it('emits a complete client envelope for actions', async () => {
    const onClientMessage = vi.fn();
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      onClientMessage,
      createClientRequestId: () => 'a2ui:request:test'
    });
    controller.sync(createMessages());

    await controller.getSurface()?.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    expect(onClientMessage).toHaveBeenCalledWith({
      requestId: 'a2ui:request:test',
      message: {
        version: 'v0.9.1',
        action: expect.objectContaining({
          name: 'trip_submitted',
          surfaceId: 'planner',
          sourceComponentId: 'submit'
        })
      },
      capabilities: {
        'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
      },
      dataModel: {
        version: 'v0.9.1',
        surfaces: {
          planner: { title: '周末旅行', city: '杭州' }
        }
      }
    });

    controller.dispose();
  });

  it('routes registered actions to frontend handlers without forcing a transport request', async () => {
    const onClientMessage = vi.fn();
    const localHandler = vi.fn();
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      onClientMessage,
      actionHandlers: {
        trip_submitted: localHandler
      },
      createClientRequestId: () => 'a2ui:request:local'
    });
    controller.sync(createMessages());

    await controller.getSurface()?.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    expect(localHandler).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({
        name: 'trip_submitted',
        context: { city: '杭州' }
      }),
      envelope: expect.objectContaining({ requestId: 'a2ui:request:local' }),
      surface: controller.getSurface(),
      forward: expect.any(Function)
    }));
    expect(onClientMessage).not.toHaveBeenCalled();
    expect(controller.getActionState('submit')).toMatchObject({
      phase: 'delivery',
      status: 'delivered'
    });

    controller.dispose();
  });

  it('lets a frontend action handler explicitly forward the same envelope once', async () => {
    const onClientMessage = vi.fn();
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      onClientMessage,
      actionHandlers: {
        async trip_submitted({ forward }) {
          await Promise.all([forward(), forward()]);
        }
      },
      createClientRequestId: () => 'a2ui:request:hybrid'
    });
    controller.sync(createMessages());

    await controller.getSurface()?.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    expect(onClientMessage).toHaveBeenCalledTimes(1);
    expect(onClientMessage).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'a2ui:request:hybrid'
    }));

    controller.dispose();
  });

  it('keeps one action sending and suppresses rapid duplicate dispatches', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const states: string[] = [];
    const onClientMessage = vi.fn(() => pending);
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      onClientMessage,
      createClientRequestId: () => 'a2ui:request:deduplicated',
      onActionStateChange(snapshot) {
        const state = Object.values(snapshot.states)[0];
        if (state) states.push(state.status);
      }
    });
    controller.sync(createMessages());

    const first = controller.getSurface()!.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');
    const duplicate = controller.getSurface()!.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    await duplicate;
    expect(onClientMessage).toHaveBeenCalledTimes(1);
    expect(controller.getActionState('submit')).toMatchObject({
      requestId: 'a2ui:request:deduplicated',
      phase: 'delivery',
      status: 'sending',
      attempt: 1
    });

    release?.();
    await first;
    expect(controller.getActionState('submit')).toMatchObject({
      phase: 'delivery',
      status: 'delivered'
    });
    expect(states).toEqual(['sending', 'delivered']);

    controller.dispose();
  });

  it('retries a failed action with the original envelope and request id', async () => {
    const envelopes: unknown[] = [];
    let attempt = 0;
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      createClientRequestId: () => 'a2ui:request:retry',
      async onClientMessage(envelope) {
        envelopes.push(envelope);
        attempt += 1;
        if (attempt === 1) {
          throw new Error('网络暂时不可用');
        }
      }
    });
    controller.sync(createMessages());

    await controller.getSurface()!.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    expect(controller.getActionState('submit')).toMatchObject({
      requestId: 'a2ui:request:retry',
      phase: 'delivery',
      status: 'failed',
      attempt: 1,
      error: '网络暂时不可用'
    });
    expect(await controller.retryAction('submit')).toBe(true);
    expect(controller.getActionState('submit')).toMatchObject({
      requestId: 'a2ui:request:retry',
      phase: 'delivery',
      status: 'delivered',
      attempt: 2
    });
    expect(envelopes).toHaveLength(2);
    expect(envelopes[1]).toEqual(envelopes[0]);

    controller.dispose();
  });

  it('projects host execution state without treating delivery as business success', async () => {
    const stateSource = new MutableActionStateSource('planner');
    const retryExecution = vi.fn();
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      actionStateSource: stateSource,
      retryExecution,
      createClientRequestId: () => 'a2ui:request:host-state',
      onClientMessage: vi.fn()
    });
    controller.sync(createMessages());

    await controller.getSurface()!.dispatchAction({
      event: { name: 'trip_submitted', context: { city: '杭州' } }
    }, 'submit');

    expect(controller.getActionState('submit')).toMatchObject({
      phase: 'delivery',
      status: 'delivered'
    });

    const key = createA2UiActionStateKey('planner', 'submit');
    stateSource.update({
      surfaceId: 'planner',
      interactionDisabled: true,
      states: {
        [key]: {
          phase: 'execution',
          key,
          requestId: 'a2ui:request:host-state',
          surfaceId: 'planner',
          sourceComponentId: 'submit',
          status: 'pending',
          attempt: 1,
          startedAt: 100
        }
      }
    });

    expect(controller.getActionState('submit')).toMatchObject({
      phase: 'execution',
      status: 'pending'
    });
    expect(controller.getActionStateSnapshot().interactionDisabled).toBe(true);

    stateSource.update({
      surfaceId: 'planner',
      interactionDisabled: false,
      states: {
        [key]: {
          phase: 'execution',
          key,
          requestId: 'a2ui:request:host-state',
          surfaceId: 'planner',
          sourceComponentId: 'submit',
          status: 'failed',
          attempt: 1,
          startedAt: 100,
          settledAt: 200,
          error: '库存不足',
          retryable: true
        }
      }
    });

    expect(await controller.retryAction('submit')).toBe(true);
    expect(retryExecution).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'execution',
      status: 'failed',
      requestId: 'a2ui:request:host-state'
    }));

    controller.dispose();
    expect(stateSource.listeners).toHaveLength(0);
  });

  it('emits standard client error messages from the surface', async () => {
    const onClientMessage = vi.fn();
    const controller = createA2UiSurfaceController({
      surfaceId: 'planner',
      catalogs: [createA2UiBasicCatalog()],
      onClientMessage
    });
    controller.sync(createMessages());

    await controller.getSurface()?.dispatchError({
      code: 'VALIDATION_FAILED',
      path: '/city',
      message: '城市不能为空'
    });

    expect(onClientMessage).toHaveBeenCalledWith(expect.objectContaining({
      message: {
        version: 'v0.9.1',
        error: {
          code: 'VALIDATION_FAILED',
          surfaceId: 'planner',
          path: '/city',
          message: '城市不能为空'
        }
      }
    }));

    controller.dispose();
  });
});
