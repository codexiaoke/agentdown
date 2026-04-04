import {
  cmd,
  createMarkdownAssembler,
  defineAgentdownPreset,
  defineEventProtocol
} from '../../index';
import FileSummaryCard from '../components/FileSummaryCard.vue';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';

/**
 * 用户上传文件 demo 使用的原始事件协议。
 */
export type FileUploadDemoPacket =
  | {
      event: 'RunStarted';
      runId: string;
      title: string;
    }
  | {
      event: 'ContentOpen';
      streamId: string;
      slot: string;
      groupId: string;
    }
  | {
      event: 'ContentDelta';
      streamId: string;
      text: string;
    }
  | {
      event: 'ToolCall';
      id: string;
      name: string;
    }
  | {
      event: 'ToolCompleted';
      id: string;
      name: string;
      content: Record<string, unknown>;
    }
  | {
      event: 'ContentClose';
      streamId: string;
    }
  | {
      event: 'RunCompleted';
      runId: string;
    };

/**
 * 把文件上传场景的事件协议映射到 Agentdown preset。
 */
export const fileUploadPreset = defineAgentdownPreset<FileUploadDemoPacket>({
  protocol: defineEventProtocol<FileUploadDemoPacket>({
    RunStarted: (event) =>
      cmd.run.start({
        id: event.runId,
        title: event.title
      }),
    ContentOpen: (event) =>
      cmd.content.open({
        streamId: event.streamId,
        slot: event.slot,
        groupId: event.groupId
      }),
    ContentDelta: (event) => cmd.content.append(event.streamId, event.text),
    ContentClose: (event) => cmd.content.close(event.streamId),
    ToolCall: (event, context) =>
      cmd.tool.start({
        id: event.id,
        title: event.name,
        renderer: 'tool.file-summary',
        groupId: 'turn:file:assistant',
        at: context.now()
      }),
    ToolCompleted: (event, context) =>
      cmd.tool.finish({
        id: event.id,
        title: event.name,
        result: event.content,
        at: context.now()
      }),
    RunCompleted: (event, context) =>
      cmd.run.finish({
        id: event.runId,
        at: context.now()
      })
  }),
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: '正在阅读你上传的文件...'
      }
    },
    renderers: {
      'tool.file-summary': FileSummaryCard
    }
  }
});
