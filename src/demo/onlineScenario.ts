import { cmd } from '../runtime/defineProtocol';
import type { RuntimeCommand, RuntimeProtocol } from '../runtime/types';
import type {
  BuiltinAgentdownRenderArchive,
  BuiltinAgentdownRenderRecord
} from '../persisted/builtin';
import { AGENTDOWN_RENDER_ARCHIVE_FORMAT } from '../persisted/types';

export const ONLINE_DEMO_IDS = {
  conversation: 'conversation:online-demo',
  turn: 'turn:online-demo:weather',
  userMessage: 'message:user:online-demo:weather',
  assistantMessage: 'message:assistant:online-demo:weather',
  introStream: 'stream:online-demo:intro',
  introBlock: 'block:online-demo:intro',
  resultStream: 'stream:online-demo:result',
  resultBlock: 'block:online-demo:result',
  tool: 'tool:online-demo:weather',
  approval: 'approval:online-demo:weather',
  approvalBlock: 'block:online-demo:approval',
  artifact: 'artifact:online-demo:weather-report',
  artifactBlock: 'block:online-demo:artifact'
} as const;

export const ONLINE_DEMO_PROMPT = '帮我查一下杭州周末天气，并生成一份出行建议。';

export const ONLINE_DEMO_INTRO_CHUNKS = [
  '我会先调用天气工具获取实时数据，',
  '再根据温度、降雨和风力生成出行建议。\n\n',
  '> 工具调用前需要你的确认。'
] as const;

export const ONLINE_DEMO_RESULT_CHUNKS = [
  '## 杭州周末天气\n\n',
  '| 日期 | 天气 | 温度 | 降雨概率 |\n| --- | --- | --- | --- |\n',
  '| 周六 | 多云转晴 | 23–30°C | 20% |\n| 周日 | 阵雨 | 22–27°C | 65% |\n\n',
  '### 出行建议\n\n- **周六**适合户外活动，午后注意防晒。\n',
  '- **周日**建议携带折叠伞，优先安排室内行程。\n- 两天早晚温差明显，带一件轻薄外套。'
] as const;

export type OnlineDemoEvent =
  | { type: 'user.message'; text: string; at: number }
  | { type: 'assistant.stream.started'; stream: 'intro' | 'result'; at: number }
  | { type: 'assistant.stream.delta'; stream: 'intro' | 'result'; text: string; at: number }
  | { type: 'assistant.stream.completed'; stream: 'intro' | 'result'; at: number }
  | { type: 'tool.requested'; at: number }
  | { type: 'approval.requested'; at: number }
  | { type: 'approval.approved'; at: number }
  | { type: 'tool.started'; at: number }
  | { type: 'tool.completed'; at: number }
  | { type: 'artifact.created'; at: number };

export interface OnlineDemoEventLogEntry {
  index: number;
  event: OnlineDemoEvent;
}

function messageScope() {
  return {
    conversationId: ONLINE_DEMO_IDS.conversation,
    turnId: ONLINE_DEMO_IDS.turn,
    messageId: ONLINE_DEMO_IDS.assistantMessage
  };
}

function streamIds(stream: 'intro' | 'result') {
  return stream === 'intro'
    ? {
        streamId: ONLINE_DEMO_IDS.introStream,
        blockId: ONLINE_DEMO_IDS.introBlock
      }
    : {
        streamId: ONLINE_DEMO_IDS.resultStream,
        blockId: ONLINE_DEMO_IDS.resultBlock
      };
}

function mapOnlineDemoEvent(event: OnlineDemoEvent): RuntimeCommand | RuntimeCommand[] {
  switch (event.type) {
    case 'user.message':
      return cmd.message.text({
        id: 'block:online-demo:user',
        role: 'user',
        text: event.text,
        conversationId: ONLINE_DEMO_IDS.conversation,
        turnId: ONLINE_DEMO_IDS.turn,
        messageId: ONLINE_DEMO_IDS.userMessage,
        at: event.at
      });
    case 'assistant.stream.started': {
      const ids = streamIds(event.stream);
      return cmd.content.open({
        streamId: ids.streamId,
        slot: 'main',
        assembler: 'markdown',
        data: {
          blockId: ids.blockId,
          blockData: {
            role: 'assistant'
          }
        },
        ...messageScope()
      });
    }
    case 'assistant.stream.delta':
      return cmd.content.append(streamIds(event.stream).streamId, event.text);
    case 'assistant.stream.completed':
      return cmd.content.close(streamIds(event.stream).streamId);
    case 'tool.requested':
      return cmd.tool.start({
        id: ONLINE_DEMO_IDS.tool,
        title: '查询杭州周末天气',
        status: 'waiting',
        data: {
          toolName: 'lookup_weekend_weather',
          args: {
            city: '杭州',
            days: 2
          }
        },
        ...messageScope(),
        at: event.at
      });
    case 'approval.requested':
      return cmd.message.insert({
        id: ONLINE_DEMO_IDS.approvalBlock,
        role: 'assistant',
        type: 'approval',
        renderer: 'approval',
        data: {
          kind: 'approval',
          title: '允许调用天气工具？',
          approvalId: ONLINE_DEMO_IDS.approval,
          status: 'pending',
          message: '将读取杭州未来两天的公开天气数据，不会提交个人信息。'
        },
        ...messageScope(),
        at: event.at
      });
    case 'approval.approved':
      return cmd.approval.update({
        id: ONLINE_DEMO_IDS.approvalBlock,
        role: 'assistant',
        title: '允许调用天气工具？',
        approvalId: ONLINE_DEMO_IDS.approval,
        status: 'approved',
        message: '已批准，继续执行天气查询。',
        ...messageScope(),
        at: event.at
      });
    case 'tool.started':
      return cmd.tool.update({
        id: ONLINE_DEMO_IDS.tool,
        title: '查询杭州周末天气',
        status: 'running',
        ...messageScope(),
        at: event.at
      });
    case 'tool.completed':
      return cmd.tool.finish({
        id: ONLINE_DEMO_IDS.tool,
        title: '查询杭州周末天气',
        status: 'done',
        result: {
          saturday: { condition: '多云转晴', low: 23, high: 30, rain: 20 },
          sunday: { condition: '阵雨', low: 22, high: 27, rain: 65 }
        },
        ...messageScope(),
        at: event.at
      });
    case 'artifact.created':
      return cmd.message.artifact({
        id: ONLINE_DEMO_IDS.artifactBlock,
        role: 'assistant',
        title: '杭州周末出行建议',
        artifactKind: 'report',
        artifactId: ONLINE_DEMO_IDS.artifact,
        label: 'hangzhou-weekend.md',
        message: '可导出的 Markdown 出行报告',
        ...messageScope(),
        at: event.at
      });
  }
}

export function createOnlineDemoProtocol(): RuntimeProtocol<OnlineDemoEvent> {
  return {
    map({ packet }) {
      return [
        cmd.event.record(packet),
        ...([] as RuntimeCommand[]).concat(mapOnlineDemoEvent(packet))
      ];
    }
  };
}

function replaceRecord(
  records: BuiltinAgentdownRenderRecord[],
  predicate: (record: BuiltinAgentdownRenderRecord) => boolean,
  replacement: BuiltinAgentdownRenderRecord
): BuiltinAgentdownRenderRecord[] {
  const index = records.findIndex(predicate);

  if (index < 0) {
    return [...records, replacement];
  }

  return records.map((record, currentIndex) => currentIndex === index ? replacement : record);
}

function appendStreamDelta(
  records: BuiltinAgentdownRenderRecord[],
  stream: 'intro' | 'result',
  text: string,
  at: number
): BuiltinAgentdownRenderRecord[] {
  const assistantMessages = records.filter((record) => (
    record.event === 'message'
    && record.role === 'assistant'
    && typeof record.content === 'object'
    && record.content !== null
    && record.content.kind === 'markdown'
  ));
  const existing = assistantMessages[stream === 'intro' ? 0 : 1];
  const previousText = existing?.event === 'message'
    && typeof existing.content === 'object'
    && existing.content !== null
    && 'text' in existing.content
    && typeof existing.content.text === 'string'
      ? existing.content.text
      : '';
  const replacement: BuiltinAgentdownRenderRecord = {
    event: 'message',
    role: 'assistant',
    content: {
      text: `${previousText}${text}`,
      kind: 'markdown'
    },
    created_at: existing?.created_at ?? at
  };

  return replaceRecord(records, (record) => record === existing, replacement);
}

export function reduceOnlineDemoRecords(
  records: readonly BuiltinAgentdownRenderRecord[],
  event: OnlineDemoEvent
): BuiltinAgentdownRenderRecord[] {
  const next = [...records];

  switch (event.type) {
    case 'user.message':
      return [...next, {
        event: 'message',
        role: 'user',
        content: event.text,
        created_at: event.at
      }];
    case 'assistant.stream.delta':
      return appendStreamDelta(next, event.stream, event.text, event.at);
    case 'tool.requested':
    case 'tool.started':
    case 'tool.completed': {
      const status = event.type === 'tool.requested'
        ? 'waiting'
        : event.type === 'tool.started'
          ? 'running'
          : 'done';
      const replacement: BuiltinAgentdownRenderRecord = {
        event: 'tool',
        role: 'assistant',
        content: {
          id: ONLINE_DEMO_IDS.tool,
          name: 'lookup_weekend_weather',
          title: '查询杭州周末天气',
          status,
          args: { city: '杭州', days: 2 },
          ...(event.type === 'tool.completed'
            ? {
                result: {
                  saturday: { condition: '多云转晴', low: 23, high: 30, rain: 20 },
                  sunday: { condition: '阵雨', low: 22, high: 27, rain: 65 }
                }
              }
            : {})
        },
        created_at: event.at
      };
      return replaceRecord(next, (record) => (
        record.event === 'tool'
        && typeof record.content === 'object'
        && record.content !== null
        && record.content.id === ONLINE_DEMO_IDS.tool
      ), replacement);
    }
    case 'approval.requested':
    case 'approval.approved': {
      const replacement: BuiltinAgentdownRenderRecord = {
        event: 'approval',
        role: 'assistant',
        content: {
          id: ONLINE_DEMO_IDS.approval,
          title: '允许调用天气工具？',
          status: event.type === 'approval.approved' ? 'approved' : 'pending',
          message: event.type === 'approval.approved'
            ? '已批准，继续执行天气查询。'
            : '将读取杭州未来两天的公开天气数据，不会提交个人信息。'
        },
        created_at: event.at
      };
      return replaceRecord(next, (record) => (
        record.event === 'approval'
        && typeof record.content === 'object'
        && record.content !== null
        && record.content.id === ONLINE_DEMO_IDS.approval
      ), replacement);
    }
    case 'artifact.created':
      return [...next, {
        event: 'artifact',
        role: 'assistant',
        content: {
          id: ONLINE_DEMO_IDS.artifact,
          title: '杭州周末出行建议',
          artifactKind: 'report',
          label: 'hangzhou-weekend.md',
          message: '可导出的 Markdown 出行报告'
        },
        created_at: event.at
      }];
    case 'assistant.stream.started':
    case 'assistant.stream.completed':
      return next;
  }
}

export function createOnlineDemoArchive(
  records: readonly BuiltinAgentdownRenderRecord[],
  status: 'running' | 'waiting' | 'completed',
  updatedAt: number
): BuiltinAgentdownRenderArchive<'browser-mock', typeof status> {
  return {
    format: AGENTDOWN_RENDER_ARCHIVE_FORMAT,
    framework: 'browser-mock',
    conversation_id: ONLINE_DEMO_IDS.conversation,
    session_id: 'session:online-demo',
    run_id: 'run:online-demo:weather',
    status,
    started_at: records[0]?.created_at ?? updatedAt,
    updated_at: updatedAt,
    ...(status === 'completed' ? { completed_at: updatedAt } : {}),
    records: [...records]
  };
}
