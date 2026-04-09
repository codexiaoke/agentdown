import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { defineAdapter } from '../runtime/defineAdapter';
import { cmd, defineProtocol } from '../runtime/defineProtocol';
import { useAdapterSession } from './useAdapterSession';

/**
 * 测试里使用的最小原始 packet 结构。
 */
interface DemoPacket {
  id: string;
  text: string;
}

/**
 * 等待当前轮的 watch / async consume 全部完成。
 */
async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 创建一个最小可用的测试 adapter。
 */
function createDemoAdapter() {
  return defineAdapter<DemoPacket>({
    name: 'demo',
    protocol: defineProtocol<DemoPacket>([
      {
        match() {
          return true;
        },
        map({ event, context }) {
          const at = context.now();

          return cmd.block.upsert({
            id: `block:${event.id}`,
            slot: 'main',
            type: 'text',
            renderer: 'text',
            state: 'stable',
            content: event.text,
            data: {
              packetId: event.id
            },
            createdAt: at,
            updatedAt: at
          });
        }
      }
    ])
  });
}

/**
 * 创建一个首轮失败、第二轮成功的测试 adapter，用于验证自动重连。
 */
function createRetryingDemoAdapter() {
  let attempt = 0;

  return defineAdapter<DemoPacket, string>({
    name: 'retry-demo',
    protocol: defineProtocol<DemoPacket>([
      {
        match() {
          return true;
        },
        map({ event, context }) {
          const at = context.now();

          return cmd.block.upsert({
            id: `block:${event.id}`,
            slot: 'main',
            type: 'text',
            renderer: 'text',
            state: 'stable',
            content: event.text,
            data: {
              packetId: event.id
            },
            createdAt: at,
            updatedAt: at
          });
        }
      }
    ]),
    transport: {
      async *connect(source: string) {
        attempt += 1;

        if (attempt === 1) {
          throw new Error(`connect failed for ${source}`);
        }

        yield {
          id: `retry:${attempt}`,
          text: `reconnected to ${source}`
        };
      }
    }
  });
}

describe('useAdapterSession', () => {
  it('connects a session and keeps runtime state in sync', async () => {
    const adapter = createDemoAdapter();
    const scope = effectScope();
    const sessionState = scope.run(() => useAdapterSession(adapter, {
      overrides: {
        source: [
          {
            id: 'manual',
            text: 'hello adapter session'
          }
        ]
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create adapter session state.');
    }

    await sessionState.connect();

    expect(sessionState.source.value).toEqual([
      {
        id: 'manual',
        text: 'hello adapter session'
      }
    ]);
    expect(sessionState.status.value.phase).toBe('idle');
    expect(sessionState.runtimeState.blocks.value[0]?.content).toBe('hello adapter session');

    scope.stop();
  });

  it('auto-connects when a reactive source is provided', async () => {
    const adapter = createDemoAdapter();
    const source = ref<DemoPacket[] | undefined>([
      {
        id: 'auto-1',
        text: 'auto connect works'
      }
    ]);
    const scope = effectScope();
    const sessionState = scope.run(() => useAdapterSession(adapter, {
      source,
      autoConnect: true
    }));

    if (!sessionState) {
      throw new Error('Failed to create adapter session state.');
    }

    await flushAsyncWork();

    expect(sessionState.runtime.block('block:auto-1')?.content).toBe('auto connect works');
    expect(sessionState.consuming.value).toBe(false);

    source.value = [
      {
        id: 'auto-2',
        text: 'reactive reconnect works'
      }
    ];

    await nextTick();
    await flushAsyncWork();

    expect(sessionState.source.value).toEqual([
      {
        id: 'auto-2',
        text: 'reactive reconnect works'
      }
    ]);
    expect(sessionState.runtime.block('block:auto-2')?.content).toBe('reactive reconnect works');

    scope.stop();
  });

  it('retries connect automatically when reconnect is enabled', async () => {
    const adapter = createRetryingDemoAdapter();
    const scope = effectScope();
    const sessionState = scope.run(() => useAdapterSession(adapter, {
      overrides: {
        source: 'retry-source'
      },
      reconnect: {
        retries: 1,
        delayMs: 0
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create retrying adapter session state.');
    }

    await sessionState.connect();

    expect(sessionState.runtime.block('block:retry:2')?.content).toBe('reconnected to retry-source');
    expect(sessionState.reconnectAttempt.value).toBe(0);
    expect(sessionState.reconnecting.value).toBe(false);
    expect(sessionState.error.value).toBeUndefined();

    scope.stop();
  });
});
