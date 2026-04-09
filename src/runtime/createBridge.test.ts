import { describe, expect, it, vi } from 'vitest';
import { createBridge } from './createBridge';
import type { BridgeStatus } from './types';

describe('createBridge', () => {
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
