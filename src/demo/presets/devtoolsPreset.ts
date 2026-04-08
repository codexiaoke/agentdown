import {
  cmd,
  createMarkdownAssembler,
  defineAgentdownPreset,
  defineEventProtocol,
  type AgentDevtoolsReproductionExport
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

/**
 * Devtools demo 里复用的一组稳定语义 id。
 *
 * 这样页面和协议层可以共享同一套聊天上下文，
 * 同时避免把示例代码写得过长。
 */
export const DEVTOOLS_DEMO_IDS = {
  conversationId: 'session:demo:devtools',
  turnId: 'turn:demo:devtools:1',
  userGroupId: 'group:user:demo:devtools:1',
  assistantGroupId: 'group:assistant:demo:devtools:1',
  userMessageId: 'message:user:demo:devtools:1',
  assistantMessageId: 'message:assistant:demo:devtools:1',
  runId: 'run:demo:devtools:1',
  introStreamId: 'stream:demo:devtools:intro',
  summaryStreamId: 'stream:demo:devtools:summary',
  weatherToolId: 'tool:demo:devtools:weather',
  artifactBlockId: 'block:demo:devtools:artifact',
  approvalBlockId: 'block:demo:devtools:approval',
  approvalId: 'approval:demo:devtools:publish'
} as const;

/**
 * Devtools demo 共用的 assembler 配置。
 *
 * 单独导出后，preset 和 demo 页面都能直接复用，
 * 不需要在两个地方重复声明同一套 markdown assembler。
 */
export const devtoolsDemoAssemblers = {
  markdown: createMarkdownAssembler()
};

/**
 * Devtools demo 使用的本地原始事件协议。
 *
 * 它故意同时覆盖两类事件：
 * - 会映射成 UI block / node 的运行事件
 * - 只做副作用、不直接渲染 UI 的业务事件
 */
export type DevtoolsDemoPacket =
  | {
      event: 'CreateSession';
      sessionId: string;
    }
  | {
      event: 'SetTitle';
      title: string;
    }
  | {
      event: 'Toast';
      message: string;
    }
  | {
      event: 'UserMessage';
      text: string;
    }
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
      event: 'ToolStarted';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      event: 'ToolCompleted';
      id: string;
      name: string;
      result: Record<string, unknown>;
    }
  | {
      event: 'ArtifactCreated';
      blockId: string;
      title: string;
      artifactId: string;
      artifactKind: string;
      label?: string;
      href?: string;
      message?: string;
    }
  | {
      event: 'ApprovalRequested';
      blockId: string;
      title: string;
      approvalId: string;
      message: string;
    }
  | {
      event: 'ApprovalResolved';
      blockId: string;
      title: string;
      approvalId: string;
      status: 'approved' | 'rejected' | 'changes_requested';
      message: string;
    }
  | {
      event: 'RunCompleted';
      runId: string;
    };

/**
 * 生成 Devtools demo 默认使用的本地 packet 序列。
 *
 * 页面与 replay debugger 都直接复用这一个数据源，
 * 避免示例代码在多个地方重复维护。
 */
export function createDevtoolsDemoPackets(): DevtoolsDemoPacket[] {
  /**
   * 把一段文本拆成 token 级事件，模拟本地流式输出。
   */
  function createTokenDeltas(streamId: string, text: string): DevtoolsDemoPacket[] {
    return Array.from(text).map((token) => ({
      event: 'ContentDelta',
      streamId,
      text: token
    }));
  }

  return [
    {
      event: 'CreateSession',
      sessionId: DEVTOOLS_DEMO_IDS.conversationId
    },
    {
      event: 'SetTitle',
      title: 'Devtools 本地联调会话'
    },
    {
      event: 'UserMessage',
      text: '帮我查一下北京天气，并把工具过程也展示出来'
    },
    {
      event: 'RunStarted',
      runId: DEVTOOLS_DEMO_IDS.runId,
      title: 'Devtools 助手'
    },
    {
      event: 'ContentOpen',
      streamId: DEVTOOLS_DEMO_IDS.introStreamId
    },
    ...createTokenDeltas(
      DEVTOOLS_DEMO_IDS.introStreamId,
      '我先查询天气，再把结果整理成报告和审批卡片。\n'
    ),
    {
      event: 'ContentClose',
      streamId: DEVTOOLS_DEMO_IDS.introStreamId
    },
    {
      event: 'ToolStarted',
      id: DEVTOOLS_DEMO_IDS.weatherToolId,
      name: 'lookup_weather',
      input: {
        city: '北京'
      }
    },
    {
      event: 'ToolCompleted',
      id: DEVTOOLS_DEMO_IDS.weatherToolId,
      name: 'lookup_weather',
      result: {
        city: '北京',
        condition: '阴天',
        tempC: 18.5,
        humidity: 12
      }
    },
    {
      event: 'ContentOpen',
      streamId: DEVTOOLS_DEMO_IDS.summaryStreamId
    },
    ...createTokenDeltas(
      DEVTOOLS_DEMO_IDS.summaryStreamId,
      [
        '根据查询结果，北京今天的天气如下：\n\n',
        '**实时概览**\n',
        '- 天气：阴天\n',
        '- 温度：18.5°C\n',
        '- 湿度：12%\n',
        '- 风速：7.2 km/h\n\n',
        '我已经把这次查询整理成一个 artifact，并补了一张 approval 卡片。'
      ].join('')
    ),
    {
      event: 'ContentClose',
      streamId: DEVTOOLS_DEMO_IDS.summaryStreamId
    },
    {
      event: 'ArtifactCreated',
      blockId: DEVTOOLS_DEMO_IDS.artifactBlockId,
      title: '北京天气报告',
      artifactId: 'artifact:demo:weather-report',
      artifactKind: 'report',
      label: 'beijing-weather.md',
      href: 'https://example.com/weather-report',
      message: '整理好的结构化产物'
    },
    {
      event: 'ApprovalRequested',
      blockId: DEVTOOLS_DEMO_IDS.approvalBlockId,
      title: '是否同步到日报',
      approvalId: DEVTOOLS_DEMO_IDS.approvalId,
      message: '如果确认无误，可以把今天的天气摘要同步到团队日报。'
    },
    {
      event: 'Toast',
      message: 'artifact 与 approval 已创建'
    },
    {
      event: 'ApprovalResolved',
      blockId: DEVTOOLS_DEMO_IDS.approvalBlockId,
      title: '是否同步到日报',
      approvalId: DEVTOOLS_DEMO_IDS.approvalId,
      status: 'approved',
      message: '已自动批准，后续可以继续走发送流程。'
    },
    {
      event: 'RunCompleted',
      runId: DEVTOOLS_DEMO_IDS.runId
    }
  ];
}

/**
 * 生成一份可直接导入 replay debugger 的内置 reproduction。
 */
export function createDevtoolsDemoReproduction(): AgentDevtoolsReproductionExport<DevtoolsDemoPacket> {
  const packets = createDevtoolsDemoPackets();

  return {
    schemaVersion: 1,
    format: 'agentdown.devtools-repro/v1',
    generatedAt: new Date().toISOString(),
    summary: {
      rawEventCount: packets.length,
      protocolTraceCount: packets.length,
      sideEffectCount: 3,
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

/**
 * Devtools demo 的 preset。
 *
 * 这里会把真正的 UI 事件映射成 runtime command，
 * 而 `CreateSession / SetTitle / Toast` 这类事件故意返回空命令，
 * 方便在 demo 里观察 side effect tab 的用途。
 */
export const devtoolsPreset = defineAgentdownPreset<DevtoolsDemoPacket>({
  protocol: defineEventProtocol<DevtoolsDemoPacket>({
    CreateSession: () => [],
    SetTitle: () => [],
    Toast: () => [],
    UserMessage: (event, context) =>
      cmd.message.text({
        id: `block:${DEVTOOLS_DEMO_IDS.userMessageId}:text`,
        role: 'user',
        text: event.text,
        groupId: DEVTOOLS_DEMO_IDS.userGroupId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.userMessageId,
        at: context.now()
      }),
    RunStarted: (event, context) =>
      cmd.run.start({
        id: event.runId,
        title: event.title,
        at: context.now()
      }),
    ContentOpen: (event) =>
      cmd.content.open({
        streamId: event.streamId,
        slot: 'main',
        groupId: DEVTOOLS_DEMO_IDS.assistantGroupId,
        nodeId: DEVTOOLS_DEMO_IDS.runId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId
      }),
    ContentDelta: (event) => cmd.content.append(event.streamId, event.text),
    ContentClose: (event) => cmd.content.close(event.streamId),
    ToolStarted: (event, context) =>
      cmd.tool.start({
        id: event.id,
        parentId: DEVTOOLS_DEMO_IDS.runId,
        title: event.name,
        renderer: 'tool.weather',
        groupId: DEVTOOLS_DEMO_IDS.assistantGroupId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId,
        data: {
          input: event.input
        },
        at: context.now()
      }),
    ToolCompleted: (event, context) =>
      cmd.tool.finish({
        id: event.id,
        title: event.name,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId,
        result: event.result,
        at: context.now()
      }),
    ArtifactCreated: (event, context) =>
      cmd.artifact.upsert({
        id: event.blockId,
        role: 'assistant',
        title: event.title,
        artifactId: event.artifactId,
        artifactKind: event.artifactKind,
        groupId: DEVTOOLS_DEMO_IDS.assistantGroupId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId,
        ...(event.label ? { label: event.label } : {}),
        ...(event.href ? { href: event.href } : {}),
        ...(event.message ? { message: event.message } : {}),
        at: context.now()
      }),
    ApprovalRequested: (event, context) =>
      cmd.approval.update({
        id: event.blockId,
        role: 'assistant',
        title: event.title,
        approvalId: event.approvalId,
        status: 'pending',
        message: event.message,
        groupId: DEVTOOLS_DEMO_IDS.assistantGroupId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId,
        at: context.now()
      }),
    ApprovalResolved: (event, context) =>
      cmd.approval.update({
        id: event.blockId,
        role: 'assistant',
        title: event.title,
        approvalId: event.approvalId,
        status: event.status,
        message: event.message,
        groupId: DEVTOOLS_DEMO_IDS.assistantGroupId,
        conversationId: DEVTOOLS_DEMO_IDS.conversationId,
        turnId: DEVTOOLS_DEMO_IDS.turnId,
        messageId: DEVTOOLS_DEMO_IDS.assistantMessageId,
        at: context.now()
      }),
    RunCompleted: (event, context) =>
      cmd.run.finish({
        id: event.runId,
        at: context.now()
      })
  }),
  assemblers: devtoolsDemoAssemblers,
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'Devtools demo 正在输出'
      }
    },
    renderers: {
      'tool.weather': WeatherToolCard
    }
  }
});
