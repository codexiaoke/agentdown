import { describe, expect, it } from 'vitest';
import { defineProtocol, cmd } from './defineProtocol';
import { defineAdapter } from './defineAdapter';

/**
 * 测试里使用的最小原始 packet 结构。
 */
interface DemoPacket {
  id: string;
  text: string;
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

describe('defineAdapter', () => {
  it('connects by reusing the stored source on the session', async () => {
    const adapter = createDemoAdapter();
    const session = adapter.createSession({
      source: [
        {
          id: '1',
          text: 'hello adapter'
        }
      ]
    });

    await session.connect();

    expect(session.source).toEqual([
      {
        id: '1',
        text: 'hello adapter'
      }
    ]);
    expect(session.status.phase).toBe('idle');
    expect(session.runtime.block('block:1')?.content).toBe('hello adapter');
  });

  it('supports top-level transport shorthand on the adapter', async () => {
    const adapter = defineAdapter<DemoPacket, string>({
      name: 'transport-demo',
      protocol: createDemoAdapter().protocol,
      transport: {
        async *connect(source) {
          yield {
            id: 'transport',
            text: source
          };
        }
      }
    });
    const session = adapter.createSession({
      source: 'transport payload'
    });

    await session.connect();

    expect(session.runtime.block('block:transport')?.content).toBe('transport payload');
  });

  it('throws when connect() is called without any source', async () => {
    const adapter = createDemoAdapter();
    const session = adapter.createSession();

    await expect(session.connect()).rejects.toThrow('Adapter source is required before calling connect().');
  });
});
