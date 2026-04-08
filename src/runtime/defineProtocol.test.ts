import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './createAgentRuntime';
import { cmd, defineHelperProtocol } from './defineProtocol';
import type { ProtocolContext } from './types';

/**
 * 为 helper protocol 测试构造一份稳定上下文。
 */
function createProtocolTestContext(nowValue = 1000): ProtocolContext {
  return {
    now: () => nowValue,
    makeId: (prefix = 'id') => `${prefix}:demo`
  };
}

describe('defineProtocol helpers', () => {
  it('creates attachment, branch and handoff blocks through cmd helpers', () => {
    const runtime = createAgentRuntime();

    runtime.apply([
      cmd.run.start({
        id: 'run:main',
        title: '主运行',
        at: 10
      }),
      cmd.run.start({
        id: 'run:revision',
        parentId: 'run:main',
        title: '修订分支',
        at: 20
      }),
      cmd.message.attachment({
        id: 'block:user:file',
        role: 'user',
        title: '需求文档',
        attachmentKind: 'file',
        attachmentId: 'file:spec',
        label: 'spec.pdf',
        sizeText: '2.4 MB',
        conversationId: 'session:test',
        turnId: 'turn:test',
        messageId: 'message:user:test',
        at: 30
      }),
      cmd.branch.upsert({
        id: 'block:branch',
        role: 'assistant',
        title: '已创建修订分支',
        branchId: 'branch:rev-2',
        sourceRunId: 'run:main',
        targetRunId: 'run:revision',
        status: 'running',
        conversationId: 'session:test',
        turnId: 'turn:test',
        messageId: 'message:assistant:test',
        at: 40
      }),
      cmd.handoff.upsert({
        id: 'block:handoff',
        role: 'assistant',
        title: '已交接人工审核',
        handoffId: 'handoff:review',
        targetType: 'human',
        assignee: '审核同学',
        status: 'pending',
        conversationId: 'session:test',
        turnId: 'turn:test',
        messageId: 'message:assistant:test',
        at: 50
      })
    ]);

    const snapshot = runtime.snapshot();
    const attachmentBlock = snapshot.blocks.find((block) => block.id === 'block:user:file');
    const branchBlock = snapshot.blocks.find((block) => block.id === 'block:branch');
    const handoffBlock = snapshot.blocks.find((block) => block.id === 'block:handoff');
    const branchNode = snapshot.nodes.find((node) => node.id === 'run:revision');

    expect(attachmentBlock).toMatchObject({
      type: 'attachment',
      renderer: 'attachment',
      data: {
        kind: 'attachment',
        attachmentId: 'file:spec',
        attachmentKind: 'file',
        label: 'spec.pdf'
      }
    });
    expect(branchBlock).toMatchObject({
      type: 'branch',
      renderer: 'branch',
      data: {
        kind: 'branch',
        branchId: 'branch:rev-2',
        sourceRunId: 'run:main',
        targetRunId: 'run:revision'
      }
    });
    expect(handoffBlock).toMatchObject({
      type: 'handoff',
      renderer: 'handoff',
      data: {
        kind: 'handoff',
        handoffId: 'handoff:review',
        targetType: 'human',
        assignee: '审核同学'
      }
    });
    expect(branchNode).toMatchObject({
      parentId: 'run:main',
      title: '修订分支'
    });
  });

  it('maps attachment, branch and handoff helper semantics into runtime commands', () => {
    type Packet =
      | {
          event: 'AttachmentReady';
          id: string;
          title: string;
        }
      | {
          event: 'BranchCreated';
          id: string;
          sourceRunId: string;
          targetRunId: string;
        }
      | {
          event: 'HandoffRequested';
          id: string;
          assignee: string;
        };

    const protocol = defineHelperProtocol<Packet>({
      bindings: {
        'attachment.upsert': {
          on: 'AttachmentReady',
          resolve: (event) => ({
            id: event.id,
            title: (event as Extract<Packet, { event: 'AttachmentReady' }>).title,
            attachmentKind: 'file'
          })
        },
        'branch.upsert': {
          on: 'BranchCreated',
          resolve: (event) => ({
            id: event.id,
            title: '分支已创建',
            sourceRunId: (event as Extract<Packet, { event: 'BranchCreated' }>).sourceRunId,
            targetRunId: (event as Extract<Packet, { event: 'BranchCreated' }>).targetRunId
          })
        },
        'handoff.upsert': {
          on: 'HandoffRequested',
          resolve: (event) => ({
            id: event.id,
            title: '等待人工处理',
            targetType: 'human',
            assignee: (event as Extract<Packet, { event: 'HandoffRequested' }>).assignee
          })
        }
      }
    });

    const attachmentCommands = protocol.map({
      packet: {
        event: 'AttachmentReady',
        id: 'block:attachment',
        title: '需求文档'
      },
      context: createProtocolTestContext(101)
    });
    const branchCommands = protocol.map({
      packet: {
        event: 'BranchCreated',
        id: 'block:branch',
        sourceRunId: 'run:main',
        targetRunId: 'run:revision'
      },
      context: createProtocolTestContext(102)
    });
    const handoffCommands = protocol.map({
      packet: {
        event: 'HandoffRequested',
        id: 'block:handoff',
        assignee: '审核同学'
      },
      context: createProtocolTestContext(103)
    });

    expect(attachmentCommands).toMatchObject([
      {
        type: 'block.patch',
        id: 'block:attachment',
        patch: {
          type: 'attachment',
          renderer: 'attachment',
          data: {
            kind: 'attachment',
            attachmentKind: 'file',
            title: '需求文档'
          }
        }
      }
    ]);
    expect(branchCommands).toMatchObject([
      {
        type: 'block.patch',
        id: 'block:branch',
        patch: {
          type: 'branch',
          renderer: 'branch',
          data: {
            kind: 'branch',
            sourceRunId: 'run:main',
            targetRunId: 'run:revision'
          }
        }
      }
    ]);
    expect(handoffCommands).toMatchObject([
      {
        type: 'block.patch',
        id: 'block:handoff',
        patch: {
          type: 'handoff',
          renderer: 'handoff',
          data: {
            kind: 'handoff',
            assignee: '审核同学',
            targetType: 'human'
          }
        }
      }
    ]);
  });
});
