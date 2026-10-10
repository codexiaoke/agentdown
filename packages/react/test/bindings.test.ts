// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StrictMode, act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

const mountedRoots: Root[] = [];
function mountRoot() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  return { host, root };
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => { for (const root of mountedRoots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
});

describe('React session ownership', () => {
  it('keeps an owned session usable after StrictMode cleanup and releases it on final unmount', async () => {
    const { adapter, execute, events } = passiveAdapter();
    let binding!: AgentSessionBinding;
    function Probe() {
      binding = useAgentSession({ conversationId: 'strict', adapter });
      return createElement('span', null, binding.snapshot.messages.length);
    }
    const { root, host } = mountRoot();
    await act(async () => { root.render(createElement(StrictMode, null, createElement(Probe))); });
    expect(binding.session.getSnapshot().disposed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    await act(async () => {
      const delivery = await binding.actions.send({ text: 'run after StrictMode remount' }).delivery;
      expect(delivery.status).toBe('delivered');
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe('1');
    await act(async () => { root.unmount(); });
    mountedRoots.splice(mountedRoots.indexOf(root), 1);
    expect(binding.session.getSnapshot().disposed).toBe(true);
  });

  it('only unsubscribes borrowed consumers, keeping the shared session alive', async () => {
    const { adapter, execute } = passiveAdapter();
    const source = createAgentSession({ conversationId: 'shared', adapter });
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
    let remaining!: AgentSessionBinding;
    function Consumer({ primary }: { primary: boolean }) {
      const binding = useAgentSession();
      if (!primary) remaining = binding;
      return createElement('span', null, binding.snapshot.messages.length);
    }
    function Shared({ first }: { first: boolean }) {
      return createElement(AgentProvider, { session },
        first ? createElement(Consumer, { key: 'first', primary: true }) : null,
        createElement(Consumer, { key: 'second', primary: false }),
      );
    }
    const { root, host } = mountRoot();
    await act(async () => { root.render(createElement(Shared, { first: true })); });
    await act(async () => { root.render(createElement(Shared, { first: false })); });
    expect(dispose).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => { await remaining.actions.send({ text: 'still subscribed' }).delivery; });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe('1');
    await act(async () => { root.unmount(); });
    mountedRoots.splice(mountedRoots.indexOf(root), 1);
    expect(dispose).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it('keeps ordinary rerenders stable and isolates a changed owned conversation', async () => {
    const { adapter, execute } = passiveAdapter();
    let binding!: AgentSessionBinding;
    function Probe({ conversationId }: { conversationId: string }) {
      binding = useAgentSession({ conversationId, adapter });
      return null;
    }
    const { root } = mountRoot();
    await act(async () => { root.render(createElement(Probe, { conversationId: 'first' })); });
    const firstSession = binding.session;
    const firstActions = binding.actions;
    await act(async () => { root.render(createElement(Probe, { conversationId: 'first' })); });
    expect(binding.session).toBe(firstSession);
    expect(binding.actions).toBe(firstActions);
    await act(async () => { root.render(createElement(Probe, { conversationId: 'second' })); });
    expect(binding.session).not.toBe(firstSession);
    expect(binding.snapshot.conversationId).toBe('second');
    expect(firstSession.getSnapshot().disposed).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not rerender a selector when unrelated records change', async () => {
    const { adapter } = passiveAdapter();
    const session = createAgentSession({ conversationId: 'selection', adapter });
    let renders = 0;
    const selectConversation = (snapshot: ReturnType<AgentSession['getSnapshot']>) => snapshot.conversationId;
    function Probe() {
      const conversationId = useAgentSelector(selectConversation, session);
      renders += 1;
      return createElement('span', null, conversationId);
    }
    const { root } = mountRoot();
    await act(async () => { root.render(createElement(Probe)); });
    await act(async () => { await session.dispatch({ type: 'send', input: { text: 'unrelated update' } }).delivery; });
    expect(renders).toBe(1);
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
    function Probe() {
      binding = useAgentSession({ conversationId: archive.conversationId, adapter, initialSnapshot: archive });
      return createElement('section', { 'data-revision': binding.snapshot.revision },
        ...binding.snapshot.messages.map(message => createElement('p', { key: message.id }, message.text)),
      );
    }
    const host = document.createElement('div');
    host.innerHTML = renderToString(createElement(Probe));
    const serverSnapshot = binding.snapshot;
    binding.session.dispose();
    document.body.append(host);
    const recoverableErrors: unknown[] = [];
    await act(async () => {
      mountedRoots.push(hydrateRoot(host, createElement(Probe), {
        onRecoverableError: error => { recoverableErrors.push(error); },
      }));
    });
    expect(recoverableErrors).toEqual([]);
    expect(binding.snapshot).toEqual(serverSnapshot);
    expect(binding.session.getSnapshot()).toBe(binding.session.getSnapshot());
    expect(host.textContent).toBe('persisted task');
    expect(execute).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
  });

});
