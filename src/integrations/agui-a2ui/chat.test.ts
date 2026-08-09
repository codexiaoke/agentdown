import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { A2UI_BASIC_CATALOG_ID, A2UI_SURFACE_RENDERER } from '../../a2ui';
import type { FrameworkChatTransportContext } from '../../adapters/shared/chatFactory';
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
    expect(rendererProps?.sendClientMessage).toEqual(expect.any(Function));
    expect(rendererProps?.onActionStateChange).toEqual(expect.any(Function));
    expect(rendererProps?.interactionDisabled).toBe(false);
    expect(session!.a2uiClientError.value).toBeNull();
    expect(session!.a2uiActionStates.value).toEqual({});

    scope.stop();
  });

  it('serializes standard A2UI client protocol fields without discarding app props', () => {
    const result = serializeAgUiA2UiForwardedProps({
      client: {
        requestId: 'a2ui:request:submit',
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
        requestId: 'a2ui:request:submit',
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

  it('disables A2UI actions until backend recovery initialization finishes', async () => {
    let release: (() => void) | undefined;
    const recoveryGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scope = effectScope();
    const session = scope.run(() => useAgUiA2UiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:recovering',
      recovery: {
        async loadArchive() {
          await recoveryGate;
          return null;
        }
      }
    }))!;
    const registration = session.surface.value.renderers?.[
      A2UI_SURFACE_RENDERER
    ] as RunSurfaceRendererRegistration;
    const context = {
      block: {
        id: 'block:a2ui:thread:recovering:planner',
        data: { surfaceId: 'planner', messages: [] }
      }
    } as unknown as RunSurfaceRendererContext;
    const readRendererProps = () => typeof registration.props === 'function'
      ? registration.props(context)
      : registration.props;

    expect(readRendererProps()?.interactionDisabled).toBe(true);
    release?.();
    await session.recoveryReady;
    expect(readRendererProps()?.interactionDisabled).toBe(false);

    scope.stop();
  });

  it('serializes a capability-only initial handshake without a client message', () => {
    expect(serializeAgUiA2UiForwardedProps({
      client: {
        capabilities: {
          'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
        }
      },
      forwardedProps: undefined,
      source: '/api/stream/agui',
      transportContext: undefined
    })).toEqual({
      a2ui: {
        clientCapabilities: {
          'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
        }
      }
    });
  });

  it('sends capabilities on text requests and adds action or error only when present', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const transportContexts: Array<FrameworkChatTransportContext | undefined> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(request);
      const threadId = String(request.threadId);
      const runId = String(request.runId);
      return new Response([
        `data: ${JSON.stringify({ type: 'RUN_STARTED', threadId, runId })}`,
        '',
        `data: ${JSON.stringify({ type: 'RUN_FINISHED', threadId, runId })}`,
        '',
        ''
      ].join('\n'), {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });
    const scope = effectScope();
    const session = scope.run(() => useAgUiA2UiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:test',
      transport: {
        fetch: fetchMock as typeof fetch,
        forwardedProps(_source: string, context: FrameworkChatTransportContext | undefined) {
          transportContexts.push(context);
          return { tenantId: 'tenant-1' };
        }
      }
    }));

    await session!.send('生成计划');
    const originalUserBlock = session!.runtime.snapshot().blocks.find(
      (block) => block.content === '生成计划'
    );
    expect(originalUserBlock).toBeDefined();
    await session!.sendA2UiClient({
      requestId: 'a2ui:request:submit',
      message: {
        version: 'v0.9.1',
        action: {
          name: 'submit',
          surfaceId: 'planner',
          sourceComponentId: 'submit',
          timestamp: '2026-08-09T00:00:00.000Z',
          context: { city: '杭州' }
        }
      },
      capabilities: {
        'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
      }
    });
    await session!.sendA2UiClient({
      requestId: 'a2ui:request:error',
      message: {
        version: 'v0.9.1',
        error: {
          code: 'VALIDATION_FAILED',
          surfaceId: 'planner',
          path: '/city',
          message: '城市不能为空'
        }
      },
      capabilities: {
        'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
      }
    });

    expect(requests).toHaveLength(3);
    const initialRequest = requests[0]!;
    const actionRequest = requests[1]!;
    const errorRequest = requests[2]!;
    expect(initialRequest).toMatchObject({
      messages: [{ role: 'user', content: '生成计划' }],
      forwardedProps: {
        tenantId: 'tenant-1',
        a2ui: {
          clientCapabilities: {
            'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
          }
        }
      }
    });
    expect((initialRequest.forwardedProps as Record<string, unknown>).a2ui).not.toHaveProperty(
      'clientMessage'
    );
    expect(actionRequest).toMatchObject({
      messages: [],
      forwardedProps: {
        tenantId: 'tenant-1',
        a2ui: {
          requestId: 'a2ui:request:submit',
          clientMessage: { action: { name: 'submit' } }
        }
      }
    });
    expect(errorRequest).toMatchObject({
      messages: [],
      forwardedProps: {
        tenantId: 'tenant-1',
        a2ui: {
          requestId: 'a2ui:request:error',
          clientMessage: { error: { code: 'VALIDATION_FAILED' } }
        }
      }
    });
    expect(transportContexts[0]?.submission).toMatchObject({ requestText: '生成计划' });
    expect(transportContexts[1]?.submission).toBeNull();
    expect(transportContexts[2]?.submission).toBeNull();
    expect(transportContexts[1]?.clientRequestId).toBe('a2ui:request:submit');
    expect(transportContexts[2]?.clientRequestId).toBe('a2ui:request:error');
    expect(session!.lastInput.value).toBe('生成计划');
    expect(session!.runtime.snapshot().blocks).toContainEqual(originalUserBlock);

    scope.stop();
  });

  it('coalesces an in-flight client request and reuses its idempotency key on retry', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let shouldWait = true;
    const requestIds: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const headers = new Headers(init?.headers);
      requestIds.push(headers.get('Idempotency-Key') ?? '');
      if (shouldWait) {
        await gate;
      }
      return new Response([
        `data: ${JSON.stringify({
          type: 'RUN_STARTED',
          threadId: String(request.threadId),
          runId: String(request.runId)
        })}`,
        '',
        `data: ${JSON.stringify({
          type: 'RUN_FINISHED',
          threadId: String(request.threadId),
          runId: String(request.runId)
        })}`,
        '',
        ''
      ].join('\n'), {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });
    const scope = effectScope();
    const session = scope.run(() => useAgUiA2UiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:dedupe',
      transport: { fetch: fetchMock as typeof fetch }
    }))!;
    const envelope = {
      requestId: 'a2ui:request:stable',
      message: {
        version: 'v0.9.1' as const,
        action: {
          name: 'submit',
          surfaceId: 'planner',
          sourceComponentId: 'submit',
          timestamp: '2026-08-10T00:00:00.000Z',
          context: { city: '杭州' }
        }
      },
      capabilities: {
        'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
      }
    };

    const first = session.sendA2UiClient(envelope);
    const duplicate = session.sendA2UiClient(envelope);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release?.();
    await first;

    shouldWait = false;
    await session.sendA2UiClient(envelope);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestIds).toEqual([
      'a2ui:request:stable',
      'a2ui:request:stable'
    ]);

    scope.stop();
  });
});
