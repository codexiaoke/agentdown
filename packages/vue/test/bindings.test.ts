// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createApp, createSSRApp, defineComponent, effectScope, h, isReadonly, nextTick, shallowRef } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createAgentSession, type AgentAdapter, type AgentSession } from '@agentdown/core';
import { AgentProvider, useAgentSelector, useAgentSession, type AgentSessionBinding } from '../src/index.js';

function passiveAdapter() {
  const execute = vi.fn<AgentAdapter['execute']>(async () => ({ confirmation: 'transport' }));
  const events = vi.fn<AgentAdapter['events']>(async function* () {});
  const adapter: AgentAdapter = {
    id: 'binding-fixture', version: '1', capabilities: { maxConcurrentExecutions: 4 }, execute, events,
  };
  return { adapter, execute, events };
}

describe('Vue session ownership', () => {
  it('starts passively, publishes a readonly view, and disposes an owned scope once', async () => {
    const { adapter, execute, events } = passiveAdapter();
    const scope = effectScope();
    const binding = scope.run(() => useAgentSession({ conversationId: 'owned', adapter }))!;
    expect(isReadonly(binding.snapshot)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    await binding.actions.send({ text: 'hello' }).delivery;
    expect(binding.snapshot.value.messages[0]?.text).toBe('hello');
    scope.stop();
    const disposedSnapshot = binding.session.getSnapshot();
    scope.stop();
    expect(binding.session.getSnapshot()).toBe(disposedSnapshot);
    expect(binding.session.getSnapshot().disposed).toBe(true);
  });

  it('leaves a shared borrowed session alive when either consumer stops', async () => {
    const { adapter } = passiveAdapter();
    const source = createAgentSession({ conversationId: 'borrowed', adapter });
    const dispose = vi.fn(() => source.dispose());
    const unsubscribe = vi.fn();
    const session: AgentSession = {
      ...source,
      dispose,
      subscribe(listener) {
        const stop = source.subscribe(listener);
        return () => { unsubscribe(); stop(); };
      },
    };
    const first = effectScope();
    const second = effectScope();
    first.run(() => useAgentSession(session));
    const binding = second.run(() => useAgentSession(session))!;
    first.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await binding.actions.send({ text: 'second consumer' }).delivery;
    expect(binding.snapshot.value.messages).toHaveLength(1);
    expect(dispose).not.toHaveBeenCalled();
    second.stop();
    expect(dispose).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it('rebinds provider consumers when the borrowed session identity changes', async () => {
    const { adapter, execute } = passiveAdapter();
    const first = createAgentSession({ conversationId: 'first', adapter });
    const second = createAgentSession({ conversationId: 'second', adapter });
    const current = shallowRef(first);
    let binding!: AgentSessionBinding;
    const Probe = defineComponent({
      setup() {
        binding = useAgentSession();
        return () => h('span', binding.snapshot.value.conversationId);
      },
    });
    const app = createApp(defineComponent({
      setup: () => () => h(AgentProvider, { session: current.value }, { default: () => h(Probe) }),
    }));
    const host = document.createElement('div');
    app.mount(host);
    expect(binding.session).toBe(first);
    current.value = second;
    await nextTick();
    expect(binding.session).toBe(second);
    expect(host.textContent).toBe('second');
    expect(first.getSnapshot().disposed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    app.unmount();
    expect(second.getSnapshot().disposed).toBe(false);
    first.dispose();
    second.dispose();
  });

  it('preserves an equal selector result across unrelated state revisions', async () => {
    const { adapter } = passiveAdapter();
    const session = createAgentSession({ conversationId: 'selector', adapter });
    const scope = effectScope();
    const selection = scope.run(() => useAgentSelector(
      snapshot => ({ conversationId: snapshot.conversationId }),
      session,
      (left, right) => left.conversationId === right.conversationId,
    ))!;
    const initial = selection.value;
    await session.dispatch({ type: 'send', input: { text: 'changes records' } }).delivery;
    expect(selection.value).toBe(initial);
    scope.stop();
    session.dispose();
  });

  it('hydrates an archive-backed snapshot without mismatches, requests, or reconnects', async () => {
    const { adapter, execute, events } = passiveAdapter();
    const seed = createAgentSession({ conversationId: 'hydration', adapter });
    await seed.dispatch({ type: 'send', input: { text: 'persisted task' } }).delivery;
    const archive = seed.exportSnapshot();
    seed.dispose();
    execute.mockClear();
    events.mockClear();
    let binding!: AgentSessionBinding;
    const Probe = defineComponent({
      setup() {
        binding = useAgentSession({ conversationId: archive.conversationId, adapter, initialSnapshot: archive });
        return () => h('section', { 'data-revision': binding.snapshot.value.revision },
          binding.snapshot.value.messages.map(message => h('p', { key: message.id }, message.text)),
        );
      },
    });
    const host = document.createElement('div');
    host.innerHTML = await renderToString(createSSRApp(Probe));
    const serverSnapshot = binding.snapshot.value;
    binding.session.dispose();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = createSSRApp(Probe);
    client.mount(host);
    await nextTick();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(binding.snapshot.value).toEqual(serverSnapshot);
    expect(binding.session.getSnapshot()).toBe(binding.session.getSnapshot());
    expect(host.textContent).toBe('persisted task');
    expect(execute).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    client.unmount();
    warn.mockRestore();
    error.mockRestore();
  });

});
