import { effectScope } from 'vue';
import { describe, expect, it } from 'vitest';
import { A2UI_SURFACE_RENDERER } from '../../a2ui';
import type { RunSurfaceRendererContext, RunSurfaceRendererRegistration } from '../../surface/types';
import { useAgUiChatSession } from './chat';

describe('useAgUiChatSession', () => {
  it('forwards RunSurface context together with the A2UI action listener', () => {
    const scope = effectScope();
    const session = scope.run(() => useAgUiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:test'
    }));
    expect(session).toBeDefined();

    const registration = (
      session!.surface.value.renderers?.[A2UI_SURFACE_RENDERER]
    ) as RunSurfaceRendererRegistration;
    const block = {
      id: 'block:a2ui:test',
      slot: 'main',
      type: 'a2ui',
      renderer: A2UI_SURFACE_RENDERER,
      state: 'stable',
      data: { surfaceId: 'test', messages: [] },
      createdAt: 1,
      updatedAt: 1
    };
    const context = { block } as unknown as RunSurfaceRendererContext;
    const rendererProps = typeof registration.props === 'function'
      ? registration.props(context)
      : registration.props;

    expect(rendererProps?.block).toBe(block);
    expect(rendererProps?.onAction).toEqual(expect.any(Function));

    scope.stop();
  });
});
