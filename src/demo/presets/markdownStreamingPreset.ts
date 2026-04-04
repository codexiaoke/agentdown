import {
  cmd,
  createMarkdownAssembler,
  defineAgentdownPreset,
  defineEventProtocol
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';

/**
 * 流式 markdown demo 使用的原始事件协议。
 */
export type MarkdownStreamingPacket =
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
      event: 'ContentClose';
      streamId: string;
    }
  | {
      event: 'RunCompleted';
      runId: string;
    };

/**
 * 把 markdown token 流映射成带 assembler 的 Agentdown preset。
 */
export const markdownStreamingPreset = defineAgentdownPreset<MarkdownStreamingPacket>({
  protocol: defineEventProtocol<MarkdownStreamingPacket>({
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
    }
  }
});
