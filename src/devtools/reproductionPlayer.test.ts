import { describe, expect, it } from 'vitest';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { cmd, defineEventProtocol } from '../runtime/defineProtocol';
import { createAgentDevtoolsReproductionPlayer } from './reproductionPlayer';

type DemoPacket =
  | {
      event: 'RunStarted';
      runId: string;
      title: string;
    }
  | {
      event: 'ContentOpen';
      streamId: string;
    }
  | {
      event: 'ContentDelta';
      streamId: string;
      text: string;
    }
  | {
      event: 'ContentClose';
      streamId: string;
    }
  | {
      event: 'RunCompleted';
      runId: string;
    };

const protocol = defineEventProtocol<DemoPacket>({
  RunStarted: (event) =>
    cmd.run.start({
      id: event.runId,
      title: event.title
    }),
  ContentOpen: (event) =>
    cmd.content.open({
      streamId: event.streamId,
      slot: 'main',
      groupId: 'group:test'
    }),
  ContentDelta: (event) => cmd.content.append(event.streamId, event.text),
  ContentClose: (event) => cmd.content.close(event.streamId),
  RunCompleted: (event) =>
    cmd.run.finish({
      id: event.runId
    })
});

/**
 * 创建一份最小可回放 reproduction。
 */
function createDemoReproduction() {
  const packets: DemoPacket[] = [
    {
      event: 'RunStarted',
      runId: 'run:test',
      title: 'Test Run'
    },
    {
      event: 'ContentOpen',
      streamId: 'stream:test'
    },
    {
      event: 'ContentDelta',
      streamId: 'stream:test',
      text: 'hello'
    },
    {
      event: 'ContentClose',
      streamId: 'stream:test'
    },
    {
      event: 'RunCompleted',
      runId: 'run:test'
    }
  ];

  return {
    schemaVersion: 1 as const,
    format: 'agentdown.devtools-repro/v1' as const,
    generatedAt: '2026-04-07T00:00:00.000Z',
    summary: {
      rawEventCount: packets.length,
      protocolTraceCount: packets.length,
      sideEffectCount: 0,
      snapshotDiffCount: packets.length
    },
    packets: packets.map((packet, index) => ({
      order: index + 1,
      eventName: packet.event,
      packet
    })),
    trace: [],
    sideEffects: [],
    latestSnapshotDiff: null
  };
}

describe('createAgentDevtoolsReproductionPlayer', () => {
  it('steps through packets and updates runtime snapshot', () => {
    const player = createAgentDevtoolsReproductionPlayer(createDemoReproduction(), {
      protocol,
      assemblers: {
        markdown: createMarkdownAssembler()
      }
    });

    expect(player.position()).toBe(0);
    expect(player.total()).toBe(5);

    player.step(4);

    expect(player.position()).toBe(4);
    expect(player.status()).toBe('idle');
    expect(player.snapshot().blocks).toHaveLength(1);
    expect(player.snapshot().blocks[0]?.content).toContain('hello');
  });

  it('supports seek and auto play until completion', async () => {
    const player = createAgentDevtoolsReproductionPlayer(createDemoReproduction(), {
      protocol,
      assemblers: {
        markdown: createMarkdownAssembler()
      }
    });
    const steppedOrders: number[] = [];

    player.seek(2);
    expect(player.position()).toBe(2);

    await player.play({
      intervalMs: 0,
      onStep(result) {
        steppedOrders.push(result.entry.order);
      }
    });

    expect(player.position()).toBe(5);
    expect(player.status()).toBe('completed');
    expect(steppedOrders).toEqual([3, 4, 5]);
    expect(player.snapshot().nodes.find((node) => node.id === 'run:test')?.status).toBe('done');
  });
});
