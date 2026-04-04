import {
  cmd,
  createMarkdownAssembler,
  defineAgentdownPreset,
  defineEventProtocol
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

export type WeatherSsePayload =
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
      name: string;
      id: string;
    }
  | {
      event: 'ToolCompleted';
      name: string;
      id: string;
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

export const weatherRunPreset = defineAgentdownPreset<WeatherSsePayload>({
  protocol: defineEventProtocol<WeatherSsePayload>({
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
        renderer: 'tool.weather',
        groupId: 'turn:weather',
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
    },
    renderers: {
      'tool.weather': WeatherToolCard
    }
  }
});
