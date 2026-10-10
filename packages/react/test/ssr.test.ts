import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { type AgentAdapter } from '@agentdown/core';
import { useAgentSession, type AgentSessionBinding } from '../src/index.js';

it('renders a passive owned server snapshot in Node without DOM or transport effects', () => {
  const execute = vi.fn<AgentAdapter['execute']>(async () => ({ confirmation: 'transport' }));
  const events = vi.fn<AgentAdapter['events']>(async function* () {});
  const adapter: AgentAdapter = { id: 'ssr-fixture', version: '1', capabilities: {}, execute, events };
  let binding!: AgentSessionBinding;
  function ServerProbe() {
    binding = useAgentSession({ conversationId: 'server-request', adapter });
    return createElement('span', null, `${binding.snapshot.conversationId}:${binding.snapshot.messages.length}`);
  }
  expect(typeof window).toBe('undefined');
  expect(renderToString(createElement(ServerProbe))).toBe('<span>server-request:0</span>');
  expect(execute).not.toHaveBeenCalled();
  expect(events).not.toHaveBeenCalled();
  binding.session.dispose();
});
