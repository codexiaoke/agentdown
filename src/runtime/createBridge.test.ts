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
});
