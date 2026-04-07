import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import { useAgentDevtools } from './useAgentDevtools';

describe('useAgentDevtools', () => {
  it('captures raw events, protocol traces and runtime snapshot diffs', () => {
    const runtime = createAgentRuntime();
    const devtools = useAgentDevtools<{ event: string; text?: string }>({
      maxEntries: 10
    });

    devtools.attachRuntime(runtime);
    devtools.hooks.onPacket?.({
      event: 'ContentDelta',
      text: 'hello'
    });
    devtools.hooks.onMapped?.([
      {
        type: 'block.upsert',
        block: {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'draft',
          data: {},
          content: 'hello'
        }
      }
    ], {
      event: 'ContentDelta',
      text: 'hello'
    });
    runtime.apply({
      type: 'block.upsert',
      block: {
        id: 'block:1',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'draft',
        data: {},
        content: 'hello'
      }
    });

    expect(devtools.rawEvents.value).toHaveLength(1);
    expect(devtools.rawEvents.value[0]?.eventName).toBe('ContentDelta');
    expect(devtools.protocolTrace.value).toHaveLength(1);
    expect(devtools.protocolTrace.value[0]?.commandTypes).toEqual(['block.upsert']);
    expect(devtools.snapshotDiffs.value).toHaveLength(1);
    expect(devtools.snapshotDiffs.value[0]?.traceOrder).toBe(1);
    expect(devtools.snapshotDiffs.value[0]?.packetOrder).toBe(1);
    expect(devtools.snapshotDiffs.value[0]?.eventName).toBe('ContentDelta');
    expect(devtools.snapshotDiffs.value[0]?.commandTypes).toEqual(['block.upsert']);
    expect(devtools.snapshotDiffs.value[0]?.historyEntries).toHaveLength(1);
    expect(devtools.snapshotDiffs.value[0]?.summary.addedBlockCount).toBe(1);
  });

  it('records non-UI side effects and exports a normalized reproduction bundle', () => {
    const runtime = createAgentRuntime();
    const devtools = useAgentDevtools<{ event: string; sessionId?: string }>({
      maxEntries: 10
    });

    devtools.attachRuntime(runtime);
    devtools.hooks.onPacket?.({
      event: 'CreateSession',
      sessionId: 'session:1'
    });
    devtools.recordSideEffects({
      event: 'CreateSession',
      sessionId: 'session:1'
    }, [
      {
        key: 'createSession',
        event: {
          event: 'CreateSession',
          sessionId: 'session:1'
        },
        eventName: 'CreateSession',
        matchedByName: true,
        matchedByPredicate: false,
        at: 20
      }
    ]);

    const snapshot = devtools.exportSnapshot();
    const reproduction = devtools.exportReproduction();

    expect(devtools.sideEffects.value).toHaveLength(1);
    expect(devtools.sideEffects.value[0]?.actionKeys).toEqual(['createSession']);
    expect(snapshot.format).toBe('agentdown.devtools/v1');
    expect(snapshot.summary.sideEffectCount).toBe(1);
    expect(reproduction.format).toBe('agentdown.devtools-repro/v1');
    expect(reproduction.packets[0]?.eventName).toBe('CreateSession');
    expect(reproduction.sideEffects[0]?.actionKeys).toEqual(['createSession']);
    expect(reproduction.latestSnapshotDiff).toBe(null);
  });

  it('resets logs while keeping the current runtime baseline', () => {
    const runtime = createAgentRuntime();
    const devtools = useAgentDevtools<{ type: string }>({
      maxEntries: 10
    });

    devtools.attachRuntime(runtime);
    runtime.apply({
      type: 'node.upsert',
      node: {
        id: 'node:1',
        type: 'run',
        title: 'Weather',
        data: {}
      }
    });

    expect(devtools.snapshotDiffs.value).toHaveLength(1);

    devtools.reset();
    runtime.apply({
      type: 'node.patch',
      id: 'node:1',
      patch: {
        status: 'done'
      }
    });

    expect(devtools.rawEvents.value).toHaveLength(0);
    expect(devtools.protocolTrace.value).toHaveLength(0);
    expect(devtools.sideEffects.value).toHaveLength(0);
    expect(devtools.snapshotDiffs.value).toHaveLength(1);
    expect(devtools.snapshotDiffs.value[0]?.traceOrder).toBe(null);
    expect(devtools.snapshotDiffs.value[0]?.summary.updatedNodeCount).toBe(1);
  });
});
