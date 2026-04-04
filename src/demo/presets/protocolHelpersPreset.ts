import {
  createHelperProtocolFactory,
  defineAgentdownPreset,
} from '../../index';
import WeatherToolCard from '../components/WeatherToolCard.vue';

export type ProtocolHelperPacket =
  | {
      type: 'run.start';
      runId: string;
      title: string;
    }
  | {
      type: 'content.replace';
      blockId: string;
      groupId: string;
      markdown: string;
    }
  | {
      type: 'tool.start';
      toolId: string;
      title: string;
      groupId: string;
    }
  | {
      type: 'tool.finish';
      toolId: string;
      title: string;
      result: Record<string, unknown>;
    }
  | {
      type: 'artifact.upsert';
      blockId: string;
      groupId: string;
      title: string;
      artifactId: string;
      artifactKind: string;
      label?: string;
      href?: string;
      message?: string;
    }
  | {
      type: 'approval.update';
      blockId: string;
      groupId: string;
      title: string;
      approvalId: string;
      status: string;
      message?: string;
    }
  | {
      type: 'run.finish';
      runId: string;
    };

/**
 * 用一套全局 helper protocol factory 来描述“项目级事件规范”。
 * 页面里只需要复用它，不用每次从零写 defineEventProtocol。
 */
export const helperProtocolFactory = createHelperProtocolFactory<ProtocolHelperPacket, 'type'>({
  eventKey: 'type',
  defaults: {
    'content.replace': {
      kind: 'markdown'
    },
    'tool.start': {
      renderer: 'tool.weather',
      slot: 'main'
    },
    'artifact.upsert': {
      slot: 'main'
    },
    'approval.update': {
      slot: 'main'
    }
  },
  bindings: {
    'run.start': {
      on: 'run.start',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'run.start' }>;
        return ({
          id: current.runId,
          title: current.title
        });
      }
    },
    'content.replace': {
      on: 'content.replace',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'content.replace' }>;
        return ({
          id: current.blockId,
          groupId: current.groupId,
          content: current.markdown
        });
      }
    },
    'tool.start': {
      on: 'tool.start',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'tool.start' }>;
        return ({
          id: current.toolId,
          title: current.title,
          groupId: current.groupId
        });
      }
    },
    'tool.finish': {
      on: 'tool.finish',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'tool.finish' }>;
        return ({
          id: current.toolId,
          title: current.title,
          result: current.result
        });
      }
    },
    'artifact.upsert': {
      on: 'artifact.upsert',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'artifact.upsert' }>;
        return ({
          id: current.blockId,
          groupId: current.groupId,
          title: current.title,
          artifactId: current.artifactId,
          artifactKind: current.artifactKind,
          ...(current.label ? { label: current.label } : {}),
          ...(current.href ? { href: current.href } : {}),
          ...(current.message ? { message: current.message } : {})
        });
      }
    },
    'approval.update': {
      on: 'approval.update',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'approval.update' }>;
        return ({
          id: current.blockId,
          groupId: current.groupId,
          title: current.title,
          approvalId: current.approvalId,
          status: current.status,
          ...(current.message ? { message: current.message } : {})
        });
      }
    },
    'run.finish': {
      on: 'run.finish',
      resolve: (event) => {
        const current = event as Extract<ProtocolHelperPacket, { type: 'run.finish' }>;
        return ({
          id: current.runId
        });
      }
    }
  }
});

export const protocolHelpersPreset = defineAgentdownPreset<ProtocolHelperPacket>({
  protocol: helperProtocolFactory.createProtocol(),
  surface: {
    renderers: {
      'tool.weather': WeatherToolCard
    }
  }
});
