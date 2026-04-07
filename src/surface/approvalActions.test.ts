import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RUN_SURFACE_APPROVAL_ACTIONS,
  createRunSurfaceApprovalActionIntent,
  isRunSurfaceApprovalActionDisabled,
  isRunSurfaceApprovalActionVisible,
  resolveRunSurfaceApprovalActionItems
} from './approvalActions';
import type { RunSurfaceApprovalActionContext } from './types';

/**
 * 构造一份最小 approval 动作上下文，供 helper 测试复用。
 */
function createApprovalActionContext(): RunSurfaceApprovalActionContext {
  return {
    title: '是否发送客户邮件',
    message: '确认无误后再继续发送。',
    approvalId: 'approval:demo',
    status: 'pending',
    refId: 'ref:approval-demo',
    block: {
      id: 'block:approval-demo',
      slot: 'main',
      type: 'approval',
      renderer: 'approval',
      state: 'stable',
      nodeId: 'run:approval-demo',
      groupId: 'group:approval-demo',
      conversationId: 'session:approval-demo',
      turnId: 'turn:approval-demo',
      messageId: 'message:approval-demo',
      data: {}
    },
    role: 'assistant',
    runtime: {} as RunSurfaceApprovalActionContext['runtime'],
    snapshot: {
      nodes: [],
      blocks: [],
      intents: [],
      history: []
    },
    emitIntent: vi.fn() as RunSurfaceApprovalActionContext['emitIntent']
  };
}

describe('surface approvalActions helpers', () => {
  it('resolves the default approval action list', () => {
    expect(resolveRunSurfaceApprovalActionItems({
      enabled: true
    }).map((action) => action.key)).toEqual(DEFAULT_RUN_SURFACE_APPROVAL_ACTIONS);
  });

  it('respects approval action visible and disabled guards', () => {
    const context = createApprovalActionContext();

    expect(isRunSurfaceApprovalActionVisible({
      key: 'approve',
      visible: () => true
    }, context)).toBe(true);

    expect(isRunSurfaceApprovalActionDisabled({
      key: 'approve',
      disabled: () => true
    }, context)).toBe(true);
  });

  it('builds a normalized approval.action intent payload', () => {
    const context = createApprovalActionContext();

    expect(createRunSurfaceApprovalActionIntent('approve', context)).toEqual({
      type: 'approval.action',
      nodeId: 'run:approval-demo',
      blockId: 'block:approval-demo',
      payload: {
        action: 'approve',
        title: '是否发送客户邮件',
        status: 'pending',
        message: '确认无误后再继续发送。',
        approvalId: 'approval:demo',
        refId: 'ref:approval-demo',
        conversationId: 'session:approval-demo',
        turnId: 'turn:approval-demo',
        messageId: 'message:approval-demo',
        groupId: 'group:approval-demo',
        role: 'assistant'
      }
    });
  });
});
