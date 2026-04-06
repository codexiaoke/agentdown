import { describe, expect, it, vi } from 'vitest';
import { createBridge } from './createBridge';

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
});
