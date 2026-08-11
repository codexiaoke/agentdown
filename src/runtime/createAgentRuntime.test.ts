import { describe, expect, it, vi } from 'vitest';
import {
  AgentRuntimeLimitError,
  createAgentRuntime
} from './createAgentRuntime';
import type { RuntimeCommand } from './types';

function createBlockCommand(id: string): RuntimeCommand {
  return {
    type: 'block.upsert',
    block: {
      id,
      slot: 'main',
      type: 'text',
      renderer: 'text',
      state: 'stable',
      content: id,
      data: {}
    }
  };
}

describe('createAgentRuntime production safeguards', () => {
  it('rejects an invalid batch before applying any earlier command', () => {
    const runtime = createAgentRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);

    expect(() => runtime.apply([
      createBlockCommand('block:before-error'),
      {
        type: 'stream.delta',
        streamId: 'stream:missing',
        text: 'should fail'
      }
    ])).toThrow(/Route stream commands through createBridge/);

    expect(runtime.blocks()).toEqual([]);
    expect(runtime.history()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('checks projected collection limits atomically', () => {
    const runtime = createAgentRuntime({
      limits: {
        maxBlocks: 1
      }
    });

    expect(() => runtime.apply([
      createBlockCommand('block:1'),
      createBlockCommand('block:2')
    ])).toThrow(AgentRuntimeLimitError);

    expect(runtime.stats()).toMatchObject({
      blockCount: 0,
      historyEntryCount: 0
    });
  });

  it('keeps only the latest intent and history records', () => {
    const runtime = createAgentRuntime({
      limits: {
        maxIntents: 2,
        maxHistoryEntries: 3
      }
    });

    runtime.apply(createBlockCommand('block:1'));
    runtime.emitIntent({ type: 'intent:1', payload: {} });
    runtime.emitIntent({ type: 'intent:2', payload: {} });
    runtime.emitIntent({ type: 'intent:3', payload: {} });

    expect(runtime.intents().map((intent) => intent.type)).toEqual([
      'intent:2',
      'intent:3'
    ]);
    expect(runtime.history()).toHaveLength(3);
    expect(runtime.stats()).toMatchObject({
      intentCount: 2,
      historyEntryCount: 3,
      droppedIntentCount: 1,
      droppedHistoryEntryCount: 1
    });
  });

  it('creates render snapshots without cloning intent and history payloads', () => {
    const runtime = createAgentRuntime();
    runtime.apply(createBlockCommand('block:1'));
    runtime.emitIntent({ type: 'intent:1', payload: { value: 1 } });

    const snapshot = runtime.snapshot({
      includeIntents: false,
      includeHistory: false
    });

    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.intents).toEqual([]);
    expect(snapshot.history).toEqual([]);
  });

  it('isolates listener failures and reports them without blocking other listeners', () => {
    const onListenerError = vi.fn();
    const healthyListener = vi.fn();
    const runtime = createAgentRuntime({ onListenerError });

    runtime.subscribe(() => {
      throw new Error('consumer failed');
    });
    runtime.subscribe(healthyListener);

    expect(() => runtime.apply(createBlockCommand('block:1'))).not.toThrow();
    expect(healthyListener).toHaveBeenCalledTimes(1);
    expect(onListenerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'consumer failed' }),
      { revision: 1 }
    );
  });

  it('rejects malformed commands from untyped custom protocols', () => {
    const runtime = createAgentRuntime();

    expect(() => runtime.apply({
      type: 'block.upsert',
      block: {
        id: '',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        data: {}
      }
    })).toThrow(/block.id/);

    expect(runtime.stats().revision).toBe(0);
  });
});
