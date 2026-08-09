import { effectScope } from 'vue';
import { describe, expect, it } from 'vitest';
import { useAgUiChatSession } from './chat';

describe('useAgUiChatSession', () => {
  it('exposes AG-UI state without installing application renderers', () => {
    const scope = effectScope();
    const session = scope.run(() => useAgUiChatSession<string>({
      source: '/api/stream/agui',
      conversationId: 'thread:test'
    }));
    expect(session).toBeDefined();

    expect(session!.agUiState.value).toMatchObject({ state: {} });
    expect(session!.surface.value.renderers?.['a2ui.surface']).toBeUndefined();
    expect('sendA2UiAction' in session!).toBe(false);

    scope.stop();
  });
});
