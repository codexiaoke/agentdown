import { describe, expect, it } from 'vitest';
import {
  createMarkdownAssembler,
  createPlainTextAssembler
} from './assemblers';
import type {
  AssemblerContext,
  RuntimeCommand,
  StreamCloseCommand,
  StreamDeltaCommand,
  StreamOpenCommand
} from './types';

/**
 * 为 assembler 测试创建一个固定上下文，避免时间戳和 id 随机变化。
 */
function createAssemblerTestContext(nowValue: number): AssemblerContext {
  return {
    now() {
      return nowValue;
    },
    makeId(prefix = 'id') {
      return `${prefix}:test`;
    }
  };
}

/**
 * 把 assembler 结果统一规范成数组，方便断言。
 */
function toCommandArray(commands: RuntimeCommand | RuntimeCommand[] | null | void): RuntimeCommand[] {
  if (!commands) {
    return [];
  }

  return Array.isArray(commands)
    ? commands
    : [commands];
}

/**
 * 创建测试里复用的 stream.open 命令。
 */
function createOpenCommand(blockId: string): StreamOpenCommand {
  return {
    type: 'stream.open',
    streamId: 'stream:test',
    slot: 'main',
    assembler: 'markdown',
    data: {
      blockId
    }
  };
}

/**
 * 创建测试里复用的 stream.delta 命令。
 */
function createDeltaCommand(text: string): StreamDeltaCommand {
  return {
    type: 'stream.delta',
    streamId: 'stream:test',
    text
  };
}

/**
 * 创建测试里复用的 stream.close 命令。
 */
function createCloseCommand(): StreamCloseCommand {
  return {
    type: 'stream.close',
    streamId: 'stream:test'
  };
}

describe('assemblers', () => {
  it('marks plain-text blocks as settled when the stream closes', () => {
    const assembler = createPlainTextAssembler();

    toCommandArray(assembler.open(createOpenCommand('block:text'), createAssemblerTestContext(100)));
    toCommandArray(assembler.delta(createDeltaCommand('北京今天晴。'), createAssemblerTestContext(120)));
    const closeCommands = toCommandArray(assembler.close(createCloseCommand(), createAssemblerTestContext(160)));

    expect(closeCommands).toEqual([
      {
        type: 'block.patch',
        id: 'block:text',
        patch: {
          renderer: 'text',
          state: 'settled',
          content: '北京今天晴。',
          updatedAt: 160
        }
      }
    ]);
  });

  it('marks committed markdown blocks as settled when the stream closes', () => {
    const assembler = createMarkdownAssembler();

    toCommandArray(assembler.open(createOpenCommand('block:markdown'), createAssemblerTestContext(100)));
    toCommandArray(
      assembler.delta(
        createDeltaCommand('部署说明\n---\n最后一行草稿'),
        createAssemblerTestContext(140)
      )
    );
    const closeCommands = toCommandArray(assembler.close(createCloseCommand(), createAssemblerTestContext(200)));

    expect(closeCommands).toEqual([
      {
        type: 'block.patch',
        id: 'block:markdown:0',
        patch: {
          state: 'settled',
          updatedAt: 200
        }
      },
      {
        type: 'block.insert',
        block: {
          id: 'block:markdown:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'settled',
          data: {
            id: 'p-0',
            kind: 'text',
            tag: 'p',
            text: '最后一行草稿'
          },
          content: '最后一行草稿',
          createdAt: 100,
          updatedAt: 200
        },
        beforeId: 'block:markdown'
      },
      {
        type: 'block.remove',
        id: 'block:markdown'
      }
    ]);
  });

  it('writes structured draft tail metadata for unfinished markdown structures', () => {
    const assembler = createMarkdownAssembler();

    toCommandArray(assembler.open(createOpenCommand('block:draft-meta'), createAssemblerTestContext(100)));
    const deltaCommands = toCommandArray(
      assembler.delta(
        createDeltaCommand('<div>\n  still streaming'),
        createAssemblerTestContext(140)
      )
    );

    expect(deltaCommands).toEqual([
      {
        type: 'block.patch',
        id: 'block:draft-meta',
        patch: {
          content: '<div>\n  still streaming',
          updatedAt: 140,
          data: {
            streamingDraftMode: 'preview',
            streamingDraftKind: 'html',
            streamingDraftStability: 'close-stable',
            streamingDraftMultiline: true
          }
        }
      }
    ]);
  });
});
