import { parseMarkdown } from '../core/parseMarkdown';
import type { MarkdownBlock } from '../core/types';
import {
  findStreamingMarkdownBoundary,
  resolveStreamingMarkdownDraftMode
} from './streamingMarkdown';
import type {
  AssemblerContext,
  RuntimeCommand,
  StreamAssembler,
  StreamOpenCommand,
  SurfaceBlock,
  TextAssemblerOptions
} from './types';

interface TextStreamSession {
  blockId: string;
  content: string;
  slot: string;
  nodeId: string | null | undefined;
  groupId: string | null | undefined;
  createdAt: number;
  data: Record<string, unknown>;
  type: string;
  draftRenderer: string;
  stableRenderer: string;
}

interface MarkdownStreamSession extends TextStreamSession {
  committedLength: number;
  stableBlockCount: number;
}

function readString(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(data: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = data?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function createTextSession(
  command: StreamOpenCommand,
  context: AssemblerContext,
  defaults: Required<TextAssemblerOptions>
): TextStreamSession {
  return {
    blockId: readString(command.data, 'blockId') ?? context.makeId('block'),
    content: readString(command.data, 'initialContent') ?? '',
    slot: command.slot,
    nodeId: command.nodeId,
    groupId: command.groupId,
    createdAt: context.now(),
    data: readRecord(command.data, 'blockData') ?? {},
    type: readString(command.data, 'blockType') ?? defaults.type,
    draftRenderer: readString(command.data, 'draftRenderer') ?? defaults.draftRenderer,
    stableRenderer: readString(command.data, 'stableRenderer') ?? defaults.stableRenderer
  };
}

function createDraftInsertCommand(command: StreamOpenCommand, session: TextStreamSession): RuntimeCommand[] {
  const block: SurfaceBlock = {
    id: session.blockId,
    slot: command.slot,
    type: session.type,
    renderer: session.draftRenderer,
    state: 'draft',
    data: session.data,
    createdAt: session.createdAt,
    updatedAt: session.createdAt
  };

  if (command.nodeId !== undefined) {
    block.nodeId = command.nodeId;
  }

  if (command.groupId !== undefined) {
    block.groupId = command.groupId;
  }

  if (session.content.length > 0) {
    block.content = session.content;
  }

  return [
    {
      type: 'block.insert',
      block
    }
  ];
}

function createDraftPatchCommand(session: TextStreamSession, updatedAt: number): RuntimeCommand[] {
  return [
    {
      type: 'block.patch',
      id: session.blockId,
      patch: {
        content: session.content,
        updatedAt
      }
    }
  ];
}

function createAbortPatchCommand(session: TextStreamSession, updatedAt: number, reason?: string): RuntimeCommand[] {
  return [
    {
      type: 'block.patch',
      id: session.blockId,
      patch: {
        content: session.content,
        updatedAt,
        data: {
          ...session.data,
          incomplete: true,
          aborted: true,
          ...(reason ? { abortReason: reason } : {})
        }
      }
    }
  ];
}

function createTextAssembler(options: Required<TextAssemblerOptions>): StreamAssembler {
  const sessions = new Map<string, TextStreamSession>();

  return {
    open(command, context) {
      const session = createTextSession(command, context, options);

      sessions.set(command.streamId, session);
      return createDraftInsertCommand(command, session);
    },
    delta(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      session.content = `${session.content}${command.text}`;
      return createDraftPatchCommand(session, context.now());
    },
    close(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      sessions.delete(command.streamId);
      return [
        {
          type: 'block.patch',
          id: session.blockId,
          patch: {
            renderer: session.stableRenderer,
            state: 'stable',
            content: session.content,
            updatedAt: context.now()
          }
        }
      ];
    },
    abort(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      sessions.delete(command.streamId);
      return createAbortPatchCommand(session, context.now(), command.reason);
    },
    reset() {
      sessions.clear();
    }
  };
}

function markdownBlockToSurfaceBlock(
  block: MarkdownBlock,
  session: MarkdownStreamSession,
  index: number,
  at: number
): SurfaceBlock {
  const next: SurfaceBlock = {
    id: `${session.blockId}:${index}`,
    slot: session.slot,
    type: block.kind,
    renderer: block.kind,
    state: 'stable',
    data: {
      ...session.data,
      ...block
    },
    createdAt: session.createdAt,
    updatedAt: at
  };

  if (session.nodeId !== undefined) {
    next.nodeId = session.nodeId;
  }

  if (session.groupId !== undefined) {
    next.groupId = session.groupId;
  }

  switch (block.kind) {
    case 'text':
      next.content = block.text;
      break;
    case 'html':
      next.content = block.html;
      break;
    case 'code':
      next.content = block.code;
      break;
    case 'mermaid':
      next.content = block.code;
      break;
    case 'math':
      next.content = block.expression;
      break;
    case 'artifact':
    case 'approval':
    case 'agui':
    case 'timeline':
    case 'thought':
      break;
  }

  return next;
}

function patchDraftRemainder(session: MarkdownStreamSession, updatedAt: number): RuntimeCommand[] {
  const remainder = session.content.slice(session.committedLength);

  return [
    {
      type: 'block.patch',
      id: session.blockId,
      patch: {
        content: remainder,
        updatedAt,
        data: {
          streamingDraftMode: resolveStreamingMarkdownDraftMode(remainder)
        }
      }
    }
  ];
}

function appendStableMarkdownBlocks(
  session: MarkdownStreamSession,
  chunk: string,
  at: number
): RuntimeCommand[] {
  const blocks = parseMarkdown(chunk);

  if (blocks.length === 0) {
    return [];
  }

  const commands: RuntimeCommand[] = [];

  for (const [offset, block] of blocks.entries()) {
    commands.push({
      type: 'block.insert',
      block: markdownBlockToSurfaceBlock(block, session, session.stableBlockCount + offset, at),
      beforeId: session.blockId
    });
  }

  session.stableBlockCount += blocks.length;
  return commands;
}

function syncStreamingMarkdownSession(session: MarkdownStreamSession, at: number): RuntimeCommand[] {
  const nextBoundary = findStreamingMarkdownBoundary(session.content);
  const commands: RuntimeCommand[] = [];

  if (nextBoundary > session.committedLength) {
    const appendedChunk = session.content.slice(session.committedLength, nextBoundary);
    commands.push(...appendStableMarkdownBlocks(session, appendedChunk, at));
    session.committedLength = nextBoundary;
  }

  commands.push(...patchDraftRemainder(session, at));
  return commands;
}

export function createPlainTextAssembler(options: TextAssemblerOptions = {}): StreamAssembler {
  return createTextAssembler({
    type: options.type ?? 'text',
    draftRenderer: options.draftRenderer ?? 'text.draft',
    stableRenderer: options.stableRenderer ?? 'text'
  });
}

export function createMarkdownAssembler(options: TextAssemblerOptions = {}): StreamAssembler {
  const sessions = new Map<string, MarkdownStreamSession>();
  const defaults: Required<TextAssemblerOptions> = {
    type: options.type ?? 'markdown',
    draftRenderer: options.draftRenderer ?? 'markdown.draft',
    stableRenderer: options.stableRenderer ?? 'markdown'
  };

  return {
    open(command, context) {
      const baseSession = createTextSession(command, context, defaults);
      const session: MarkdownStreamSession = {
        ...baseSession,
        committedLength: 0,
        stableBlockCount: 0
      };

      sessions.set(command.streamId, session);
      return [
        ...createDraftInsertCommand(command, session),
        ...syncStreamingMarkdownSession(session, context.now())
      ];
    },
    delta(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      session.content = `${session.content}${command.text}`;
      return syncStreamingMarkdownSession(session, context.now());
    },
    close(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      sessions.delete(command.streamId);
      const commands: RuntimeCommand[] = [];
      const remainder = session.content.slice(session.committedLength);

      if (remainder.length > 0) {
        commands.push(...appendStableMarkdownBlocks(session, remainder, context.now()));
      }

      commands.push({
        type: 'block.remove',
        id: session.blockId
      });

      return commands;
    },
    abort(command, context) {
      const session = sessions.get(command.streamId);

      if (!session) {
        return [];
      }

      sessions.delete(command.streamId);
      const remainder = session.content.slice(session.committedLength);

      if (remainder.length === 0) {
        return [
          {
            type: 'block.remove',
            id: session.blockId
          }
        ];
      }

      session.content = remainder;
      session.committedLength = 0;
      return [
        ...createAbortPatchCommand(session, context.now(), command.reason),
        {
          type: 'block.patch',
          id: session.blockId,
          patch: {
            data: {
              streamingDraftMode: resolveStreamingMarkdownDraftMode(remainder)
            }
          }
        }
      ];
    },
    reset() {
      sessions.clear();
    }
  };
}
