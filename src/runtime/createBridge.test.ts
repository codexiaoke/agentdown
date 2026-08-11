import { describe, expect, it, vi } from 'vitest';
import { createBridge } from './createBridge';
import type { BridgeStatus } from './types';

describe('createBridge', () => {
  it('configures the default runtime without requiring a custom instance', () => {
    const bridge = createBridge({
      protocol: {
        map() {
          return [];
        }
      },
      runtimeOptions: {
        limits: {
          maxBlocks: 0
        }
      }
    });

    expect(() => bridge.runtime.apply({
      type: 'block.upsert',
      block: {
        id: 'block:1',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        data: {}
      }
    })).toThrow(/blocks limit exceeded/);
  });

  it('rejects ambiguous runtime configuration', () => {
    const runtimeBridge = createBridge({
      protocol: {
        map() {
          return [];
        }
      }
    });

    expect(() => createBridge({
      protocol: runtimeBridge.protocol,
      runtime: runtimeBridge.runtime,
      runtimeOptions: {}
    })).toThrow(/both "runtime" and "runtimeOptions"/);
  });

  it('validates a stream batch before mutating any assembler session', () => {
    const open = vi.fn(() => []);
    const delta = vi.fn(() => []);
    const onError = vi.fn();
    const bridge = createBridge<string>({
      protocol: {
        map({ packet }) {
          if (packet === 'open') {
            return {
              type: 'stream.open',
              streamId: 'stream:valid',
              slot: 'main',
              assembler: 'text'
            };
          }

          return {
            type: 'stream.delta',
            streamId: 'stream:missing',
            text: packet
          };
        }
      },
      assemblers: {
        text: {
          open,
          delta,
          close: () => []
        }
      },
      hooks: {
        onError
      }
    });

    bridge.push(['open', 'invalid-delta']);

    expect(() => bridge.flush('test-invalid-batch')).toThrow(/No active stream session/);
    expect(open).not.toHaveBeenCalled();
    expect(delta).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(bridge.status()).toMatchObject({
      phase: 'errored',
      pendingCommandCount: 2,
      activeStreamCount: 0
    });

    expect(() => bridge.flush('must-not-retry')).toThrow(/No active stream session/);
    expect(open).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    bridge.close();
    expect(bridge.status()).toMatchObject({
      phase: 'closed',
      pendingCommandCount: 0,
      activeStreamCount: 0
    });
  });

  it('resets protocol state when bridge.reset() is called', () => {
    const reset = vi.fn();
    const bridge = createBridge({
      protocol: {
        map() {
          return [];
        },
        reset
      }
    });

    bridge.reset();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('resets protocol state when bridge.close() is called', () => {
    const reset = vi.fn();
    const bridge = createBridge({
      protocol: {
        map() {
          return [];
        },
        reset
      }
    });

    bridge.close();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('treats aborting an active consume as a normal stop instead of an error', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const bridge = createBridge<string, string>({
      protocol: {
        map() {
          return [];
        }
      },
      transport: {
        async *connect(_source, context) {
          await new Promise<void>((_resolve, reject) => {
            if (context.signal.aborted) {
              reject(abortError);
              return;
            }

            context.signal.addEventListener('abort', () => reject(abortError), { once: true });
          });
        }
      }
    });
    const controller = new AbortController();
    const consumePromise = bridge.consume('source', {
      signal: controller.signal
    });

    controller.abort();

    await expect(consumePromise).resolves.toBeUndefined();
    expect(bridge.status().phase).toBe('idle');
    expect(bridge.status().lastError).toBeUndefined();
  });

  it('slices high-frequency consume loops and keeps phase as consuming between slice flushes', async () => {
    const flushSizes: number[] = [];
    const phases: BridgeStatus['phase'][] = [];
    const packets = ['a', 'b', 'c', 'd', 'e'];
    const bridge = createBridge<string, string[]>({
      protocol: {
        map({ packet }) {
          return {
            type: 'event.record',
            event: {
              packet
            }
          };
        }
      },
      transport: {
        async *connect(source) {
          for (const packet of source) {
            yield packet;
          }
        }
      },
      consume: {
        maxPacketsPerSlice: 2,
        yieldAfterMs: 0,
        async yieldScheduler() {
          await Promise.resolve();
        }
      },
      hooks: {
        onFlush(commands) {
          flushSizes.push(commands.length);
          phases.push(bridge.status().phase);
        }
      }
    });

    await bridge.consume(packets);

    expect(flushSizes).toEqual([2, 2, 1]);
    expect(phases.slice(0, -1)).toEqual(['consuming', 'consuming']);
    expect(bridge.status().phase).toBe('idle');
  });
});
