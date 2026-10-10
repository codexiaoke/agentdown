import { expect, it, vi } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { type AgentAdapter } from '@agentdown/core';
import { useAgentSession, type AgentSessionBinding } from '../src/index.js';

it('renders a passive owned server snapshot in Node without DOM or transport effects', async () => {
  const execute = vi.fn<AgentAdapter['execute']>(async () => ({ confirmation: 'transport' }));
  const events = vi.fn<AgentAdapter['events']>(async function* () {});
  const adapter: AgentAdapter = { id: 'ssr-fixture', version: '1', capabilities: {}, execute, events };
  let binding!: AgentSessionBinding;
  const app = createSSRApp(defineComponent({
    setup() {
      binding = useAgentSession({ conversationId: 'server-request', adapter });
      return () => h('span', `${binding.snapshot.value.conversationId}:${binding.snapshot.value.messages.length}`);
    },
  }));
  expect(typeof window).toBe('undefined');
  expect(await renderToString(app)).toBe('<span>server-request:0</span>');
  expect(execute).not.toHaveBeenCalled();
  expect(events).not.toHaveBeenCalled();
  binding.session.dispose();
});
