import { describe, expect, it } from 'vitest';
import {
  createAgentDevtoolsReproductionStream,
  isAgentDevtoolsReproduction,
  parseAgentDevtoolsReproduction
} from './reproduction';

describe('devtools reproduction helpers', () => {
  it('parses a reproduction JSON string into a normalized payload', () => {
    const input = JSON.stringify({
      schemaVersion: 1,
      format: 'agentdown.devtools-repro/v1',
      generatedAt: '2026-04-07T00:00:00.000Z',
      summary: {
        rawEventCount: 2,
        protocolTraceCount: 2,
        sideEffectCount: 1,
        snapshotDiffCount: 2
      },
      packets: [
        {
          order: 1,
          eventName: 'CreateSession',
          packet: {
            event: 'CreateSession',
            sessionId: 'session:1'
          }
        },
        {
          order: 2,
          eventName: 'ContentDelta',
          packet: {
            event: 'ContentDelta',
            text: 'hi'
          }
        }
      ],
      trace: [],
      sideEffects: [],
      latestSnapshotDiff: null
    });

    const parsed = parseAgentDevtoolsReproduction<{
      event: string;
      text?: string;
      sessionId?: string;
    }>(input);

    expect(isAgentDevtoolsReproduction(parsed)).toBe(true);
    expect(parsed.packets).toHaveLength(2);
    expect(parsed.packets[0]?.eventName).toBe('CreateSession');
    expect(parsed.packets[1]?.packet).toEqual({
      event: 'ContentDelta',
      text: 'hi'
    });
  });

  it('rejects invalid reproduction payloads', () => {
    expect(() => parseAgentDevtoolsReproduction({
      format: 'agentdown.transcript/v0'
    } as any)).toThrowError('Invalid Agent Devtools reproduction payload.');
  });

  it('creates an async packet stream from a reproduction export', async () => {
    const reproduction = parseAgentDevtoolsReproduction<{
      event: string;
      text?: string;
    }>({
      schemaVersion: 1,
      format: 'agentdown.devtools-repro/v1',
      generatedAt: '2026-04-07T00:00:00.000Z',
      summary: {
        rawEventCount: 2,
        protocolTraceCount: 2,
        sideEffectCount: 0,
        snapshotDiffCount: 2
      },
      packets: [
        {
          order: 1,
          eventName: 'ContentDelta',
          packet: {
            event: 'ContentDelta',
            text: 'A'
          }
        },
        {
          order: 2,
          eventName: 'ContentDelta',
          packet: {
            event: 'ContentDelta',
            text: 'B'
          }
        }
      ],
      trace: [],
      sideEffects: [],
      latestSnapshotDiff: null
    });

    const packets: Array<{ event: string; text?: string }> = [];

    for await (const packet of createAgentDevtoolsReproductionStream(reproduction, {
      resolveDelay: ({ eventName, order }) => {
        expect(eventName).toBe('ContentDelta');
        expect(order).toBeGreaterThan(0);
        return 0;
      }
    })) {
      packets.push(packet);
    }

    expect(packets).toEqual([
      {
        event: 'ContentDelta',
        text: 'A'
      },
      {
        event: 'ContentDelta',
        text: 'B'
      }
    ]);
  });
});
