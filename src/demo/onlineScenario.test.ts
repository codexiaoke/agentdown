import { describe, expect, it } from 'vitest';
import { createBridge } from '../runtime/createBridge';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import { createMarkdownAssembler, createPlainTextAssembler } from '../runtime/assemblers';
import {
  ONLINE_DEMO_IDS,
  ONLINE_DEMO_INTRO_CHUNKS,
  ONLINE_DEMO_RESULT_CHUNKS,
  createOnlineDemoArchive,
  createOnlineDemoProtocol,
  reduceOnlineDemoRecords,
  type OnlineDemoEvent
} from './onlineScenario';
import type { BuiltinAgentdownRenderRecord } from '../persisted/builtin';
import { isAgentdownRenderArchive } from '../persisted/types';

const baseAt = 1_784_240_000_000;

function buildCompletedEvents(): OnlineDemoEvent[] {
  const events: OnlineDemoEvent[] = [
    { type: 'user.message', text: '测试天气', at: baseAt },
    { type: 'assistant.stream.started', stream: 'intro', at: baseAt + 1 }
  ];

  ONLINE_DEMO_INTRO_CHUNKS.forEach((text, index) => {
    events.push({ type: 'assistant.stream.delta', stream: 'intro', text, at: baseAt + 2 + index });
  });
  events.push(
    { type: 'assistant.stream.completed', stream: 'intro', at: baseAt + 10 },
    { type: 'tool.requested', at: baseAt + 11 },
    { type: 'approval.requested', at: baseAt + 12 },
    { type: 'approval.approved', at: baseAt + 13 },
    { type: 'tool.started', at: baseAt + 14 },
    { type: 'tool.completed', at: baseAt + 15 },
    { type: 'assistant.stream.started', stream: 'result', at: baseAt + 16 }
  );
  ONLINE_DEMO_RESULT_CHUNKS.forEach((text, index) => {
    events.push({ type: 'assistant.stream.delta', stream: 'result', text, at: baseAt + 17 + index });
  });
  events.push(
    { type: 'assistant.stream.completed', stream: 'result', at: baseAt + 30 },
    { type: 'artifact.created', at: baseAt + 31 }
  );

  return events;
}

describe('online demo scenario', () => {
  it('drives the real bridge and markdown assembler to a settled runtime', () => {
    const runtime = createAgentRuntime();
    const bridge = createBridge<OnlineDemoEvent>({
      runtime,
      protocol: createOnlineDemoProtocol(),
      assemblers: {
        markdown: createMarkdownAssembler(),
        text: createPlainTextAssembler()
      },
      scheduler: 'sync'
    });

    for (const event of buildCompletedEvents()) {
      bridge.push(event);
    }

    const snapshot = runtime.snapshot();
    const approval = snapshot.blocks.find((block) => block.id === ONLINE_DEMO_IDS.approvalBlock);
    const artifact = snapshot.blocks.find((block) => block.id === ONLINE_DEMO_IDS.artifactBlock);

    expect(approval?.data.status).toBe('approved');
    expect(artifact?.data.label).toBe('hangzhou-weekend.md');
    expect(snapshot.blocks.some((block) => block.state === 'draft')).toBe(false);
    expect(snapshot.blocks.some((block) => block.type === 'html' && block.content?.includes('<table>'))).toBe(true);
  });

  it('reduces events into a valid completed render archive without duplicate state records', () => {
    let records: BuiltinAgentdownRenderRecord[] = [];

    for (const event of buildCompletedEvents()) {
      records = reduceOnlineDemoRecords(records, event);
    }

    const archive = createOnlineDemoArchive(records, 'completed', baseAt + 31);

    expect(isAgentdownRenderArchive(archive)).toBe(true);
    expect(records.filter((record) => record.event === 'tool')).toHaveLength(1);
    expect(records.filter((record) => record.event === 'approval')).toHaveLength(1);
    expect(records.filter((record) => record.event === 'message')).toHaveLength(3);
    expect(archive.completed_at).toBe(baseAt + 31);
  });
});
