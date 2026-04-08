import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RUN_SURFACE_HANDOFF_ACTIONS,
  createRunSurfaceHandoffActionIntent,
  doesRunSurfaceHandoffActionRequireInput,
  isRunSurfaceHandoffActionDisabled,
  isRunSurfaceHandoffActionVisible,
  resolveRunSurfaceHandoffActionInputMode,
  resolveRunSurfaceHandoffActionItems,
  validateRunSurfaceHandoffActionInput
} from './handoffActions';
import type { RunSurfaceHandoffActionContext } from './types';

/**
 * 构造一份最小 handoff 动作上下文，供 helper 测试复用。
 */
function createHandoffActionContext(): RunSurfaceHandoffActionContext {
  return {
    title: '等待人工继续',
    message: '请确认是否继续执行天气查询。',
    handoffId: 'handoff:demo',
    status: 'pending',
    targetType: 'human',
    assignee: 'human',
    refId: 'run:handoff-demo',
    block: {
      id: 'block:handoff-demo',
      slot: 'main',
      type: 'handoff',
      renderer: 'handoff',
      state: 'stable',
      nodeId: 'run:handoff-demo',
      groupId: 'group:handoff-demo',
      conversationId: 'session:handoff-demo',
      turnId: 'turn:handoff-demo',
      messageId: 'message:handoff-demo',
      data: {}
    },
    role: 'assistant',
    runtime: {} as RunSurfaceHandoffActionContext['runtime'],
    snapshot: {
      nodes: [],
      blocks: [],
      intents: [],
      history: []
    },
    emitIntent: vi.fn() as RunSurfaceHandoffActionContext['emitIntent']
  };
}

describe('surface handoffActions helpers', () => {
  it('resolves the default handoff action list', () => {
    expect(resolveRunSurfaceHandoffActionItems({
      enabled: true
    }).map((action) => action.key)).toEqual(DEFAULT_RUN_SURFACE_HANDOFF_ACTIONS);
  });

  it('respects handoff action visible and disabled guards', () => {
    const context = createHandoffActionContext();

    expect(isRunSurfaceHandoffActionVisible({
      key: 'submit',
      visible: () => true
    }, context)).toBe(true);

    expect(isRunSurfaceHandoffActionDisabled({
      key: 'submit',
      disabled: () => true
    }, context)).toBe(true);
  });

  it('requires input for submit by default', () => {
    const context = createHandoffActionContext();

    expect(resolveRunSurfaceHandoffActionInputMode({
      key: 'submit'
    }, context)).toBe('required');

    expect(doesRunSurfaceHandoffActionRequireInput({
      key: 'submit'
    }, context)).toBe(true);

    expect(resolveRunSurfaceHandoffActionInputMode({
      key: 'submit',
      inputMode: 'optional'
    }, context)).toBe('optional');
  });

  it('supports custom validation for handoff input', () => {
    const context = createHandoffActionContext();

    expect(validateRunSurfaceHandoffActionInput({
      key: 'submit'
    }, context, '')).toBe('请先填写回复内容。');

    expect(validateRunSurfaceHandoffActionInput({
      key: 'submit',
      inputMinLength: 4
    }, context, '好')).toBe('回复至少需要 4 个字。');

    expect(validateRunSurfaceHandoffActionInput({
      key: 'submit',
      validateInput: ({ input }) => {
        return input.includes('继续')
          ? null
          : '请明确说明继续。';
      }
    }, context, '收到')).toBe('请明确说明继续。');
  });

  it('builds a normalized handoff.action intent payload', () => {
    const context = {
      ...createHandoffActionContext(),
      input: '已确认，请继续。'
    };

    expect(createRunSurfaceHandoffActionIntent('submit', context)).toEqual({
      type: 'handoff.action',
      nodeId: 'run:handoff-demo',
      blockId: 'block:handoff-demo',
      payload: {
        action: 'submit',
        title: '等待人工继续',
        status: 'pending',
        input: '已确认，请继续。',
        message: '请确认是否继续执行天气查询。',
        handoffId: 'handoff:demo',
        targetType: 'human',
        assignee: 'human',
        refId: 'run:handoff-demo',
        conversationId: 'session:handoff-demo',
        turnId: 'turn:handoff-demo',
        messageId: 'message:handoff-demo',
        groupId: 'group:handoff-demo',
        role: 'assistant'
      }
    });
  });
});
