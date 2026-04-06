import { describe, expect, it, vi } from 'vitest';
import { defineAgnoEventActions } from './agno';
import { defineAutoGenEventActions } from './autogen';
import { defineCrewAIEventActions } from './crewai';
import { defineLangChainEventActions } from './langchain';

describe('framework event action helpers', () => {
  it('normalizes Agno event names before matching side effects', () => {
    const spy = vi.fn();
    const actions = defineAgnoEventActions({
      completed: {
        on: 'RunCompleted',
        run: spy
      }
    });

    actions.hooks.onPacket?.({
      event: 'run_completed'
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes LangChain event names before matching side effects', () => {
    const spy = vi.fn();
    const actions = defineLangChainEventActions({
      completed: {
        on: 'on_chain_end',
        run: spy
      }
    });

    actions.hooks.onPacket?.({
      event: 'on.chain.end'
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes AutoGen event names before matching side effects', () => {
    const spy = vi.fn();
    const actions = defineAutoGenEventActions({
      completed: {
        on: 'ToolCallExecutionEvent',
        run: spy
      }
    });

    actions.hooks.onPacket?.({
      type: 'tool_call_execution_event'
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes CrewAI event names before matching side effects', () => {
    const spy = vi.fn();
    const actions = defineCrewAIEventActions({
      completed: {
        on: 'CrewOutput',
        run: spy
      }
    });

    actions.hooks.onPacket?.({
      event: 'CrewOutput',
      type: 'CrewOutput'
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
