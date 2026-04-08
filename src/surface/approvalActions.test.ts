import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RUN_SURFACE_APPROVAL_ACTIONS,
  doesRunSurfaceApprovalActionRequireReason,
  createRunSurfaceApprovalActionIntent,
  isRunSurfaceApprovalActionDisabled,
  isRunSurfaceApprovalActionVisible,
  resolveRunSurfaceApprovalActionItems,
  resolveRunSurfaceApprovalActionReasonMode,
  shouldRunSurfaceApprovalActionOpenReasonPrompt,
  validateRunSurfaceApprovalActionReason
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

  it('requires a reason for reject and changes_requested by default', () => {
    const context = createApprovalActionContext();

    expect(resolveRunSurfaceApprovalActionReasonMode({
      key: 'approve'
    }, context)).toBe('hidden');

    expect(resolveRunSurfaceApprovalActionReasonMode({
      key: 'reject'
    }, context)).toBe('required');

    expect(doesRunSurfaceApprovalActionRequireReason({
      key: 'approve'
    }, context)).toBe(false);

    expect(doesRunSurfaceApprovalActionRequireReason({
      key: 'reject'
    }, context)).toBe(true);

    expect(doesRunSurfaceApprovalActionRequireReason({
      key: 'changes_requested'
    }, context)).toBe(true);

    expect(shouldRunSurfaceApprovalActionOpenReasonPrompt({
      key: 'approve'
    }, context)).toBe(false);

    expect(shouldRunSurfaceApprovalActionOpenReasonPrompt({
      key: 'reject'
    }, context)).toBe(true);
  });

  it('supports optional reason mode and custom validation', () => {
    const context = createApprovalActionContext();

    expect(resolveRunSurfaceApprovalActionReasonMode({
      key: 'approve',
      reasonMode: 'optional'
    }, context)).toBe('optional');

    expect(validateRunSurfaceApprovalActionReason({
      key: 'approve',
      reasonMode: 'optional',
      reasonMinLength: 4
    }, context, '')).toBeNull();

    expect(validateRunSurfaceApprovalActionReason({
      key: 'approve',
      reasonMode: 'optional',
      reasonMinLength: 4
    }, context, '好')).toBe('原因至少需要 4 个字。');

    expect(validateRunSurfaceApprovalActionReason({
      key: 'approve',
      reasonMode: 'optional',
      validateReason: ({ reason }) => {
        return reason.includes('客户')
          ? null
          : '备注里请带上客户。';
      }
    }, context, '已确认')).toBe('备注里请带上客户。');
  });

  it('builds a normalized approval.action intent payload', () => {
    const context = {
      ...createApprovalActionContext(),
      reason: '请补充客户名称'
    };

    expect(createRunSurfaceApprovalActionIntent('approve', context)).toEqual({
      type: 'approval.action',
      nodeId: 'run:approval-demo',
      blockId: 'block:approval-demo',
      payload: {
        action: 'approve',
        title: '是否发送客户邮件',
        status: 'pending',
        reason: '请补充客户名称',
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
