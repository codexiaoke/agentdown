import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import type { RunSurfaceApprovalActionContext } from '../surface/types';
import {
  createSpringAiChatIds,
  createSpringAiProtocol,
  type SpringAiEvent,
  useSpringAiChatSession
} from './springai';

/**
 * 创建一个用于测试 Spring AI adapter 的同步 bridge。
 */
function createSpringAiTestBridge() {
  return createBridge<SpringAiEvent>({
    scheduler: 'sync',
    protocol: createSpringAiProtocol({
      toolRenderer: ({ tool }) => (
        tool?.tool_name === 'lookup_weather'
          ? 'tool.weather'
          : 'tool'
      )
    }),
    assemblers: {
      markdown: createMarkdownAssembler()
    }
  });
}

/**
 * 把一组 Spring AI 事件包装成最小可用的 SSE Response。
 */
function createSpringAiSseResponse(events: SpringAiEvent[]): Response {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      controller.close();
    }
  }), {
    headers: {
      'Content-Type': 'text/event-stream'
    }
  });
}

describe('createSpringAiProtocol', () => {
  it('maps a Spring AI stream into assistant messages and a tool card', () => {
    const bridge = createSpringAiTestBridge();

    bridge.push([
      {
        event: 'run.started',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1'
        },
        data: {
          mode: 'chat'
        }
      },
      {
        event: 'response.started',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:0'
        },
        data: {
          role: 'assistant',
          step: 0
        }
      },
      {
        event: 'response.delta',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:0'
        },
        data: {
          content: '我来帮您查询北京天气。'
        }
      },
      {
        event: 'response.completed',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:0'
        },
        data: {
          status: 'tool_calls',
          content: '我来帮您查询北京天气。'
        }
      },
      {
        event: 'tool.started',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:0'
        },
        data: {
          tool_call_id: 'call-weather-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          }
        }
      },
      {
        event: 'tool.completed',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:0'
        },
        data: {
          tool_call_id: 'call-weather-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          },
          result: {
            city: '北京',
            condition: '晴',
            tempC: 26
          }
        }
      },
      {
        event: 'response.started',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:1'
        },
        data: {
          role: 'assistant',
          step: 1
        }
      },
      {
        event: 'response.delta',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:1'
        },
        data: {
          content: '根据查询结果，北京今日晴。'
        }
      },
      {
        event: 'response.completed',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1',
          message_id: 'message:assistant:turn:session-1:1:1'
        },
        data: {
          status: 'completed',
          content: '根据查询结果，北京今日晴。'
        }
      },
      {
        event: 'run.completed',
        metadata: {
          session_id: 'session-1',
          conversation_id: 'session-1',
          run_id: 'run-1',
          turn_id: 'turn:session-1:1',
          group_id: 'turn:session-1:1'
        },
        data: {
          status: 'completed'
        }
      }
    ]);
    bridge.flush('springai-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-1');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '晴',
      tempC: 26
    });
    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      content: '我来帮您查询北京天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      content: '根据查询结果，北京今日晴。'
    });
  });

  it('creates a visible assistant error block when the run fails', () => {
    const bridge = createSpringAiTestBridge();

    bridge.push([
      {
        event: 'run.started',
        metadata: {
          session_id: 'session-error-1',
          conversation_id: 'session-error-1',
          run_id: 'run-error-1',
          turn_id: 'turn:session-error-1:1',
          group_id: 'turn:session-error-1:1'
        },
        data: {
          mode: 'chat'
        }
      },
      {
        event: 'error',
        metadata: {
          session_id: 'session-error-1',
          conversation_id: 'session-error-1',
          run_id: 'run-error-1',
          turn_id: 'turn:session-error-1:1',
          group_id: 'turn:session-error-1:1'
        },
        data: {
          message: 'Weather API timeout.'
        }
      }
    ]);
    bridge.flush('springai-run-error');

    const snapshot = bridge.runtime.snapshot();
    const errorBlock = snapshot.blocks.find((block) => block.type === 'error');

    expect(errorBlock).toMatchObject({
      renderer: 'error',
      data: {
        kind: 'error',
        title: '运行失败',
        message: 'Weather API timeout.',
        refId: 'run-error-1'
      }
    });
  });

  it('maps a Spring AI approval pause into approval blocks and marks the run as paused', () => {
    const bridge = createSpringAiTestBridge();

    bridge.push([
      {
        event: 'run.started',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1'
        },
        data: {
          mode: 'hitl'
        }
      },
      {
        event: 'response.started',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1',
          message_id: 'message:assistant:turn:session-hitl-1:1:0'
        },
        data: {
          role: 'assistant',
          step: 0
        }
      },
      {
        event: 'response.delta',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1',
          message_id: 'message:assistant:turn:session-hitl-1:1:0'
        },
        data: {
          content: '我来帮您查询北京天气。'
        }
      },
      {
        event: 'approval.required',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1',
          message_id: 'message:assistant:turn:session-hitl-1:1:0'
        },
        data: {
          interrupt_id: 'run-hitl-1',
          assistant_text: '我来帮您查询北京天气。',
          action_requests: [
            {
              requirement_id: 'requirement-hitl-1',
              tool_call_id: 'call-hitl-1',
              name: 'lookup_weather',
              args: {
                city: '北京'
              },
              allowed_decisions: ['approve', 'edit', 'reject']
            }
          ],
          reason_required_decisions: ['edit', 'reject']
        }
      },
      {
        event: 'response.completed',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1',
          message_id: 'message:assistant:turn:session-hitl-1:1:0'
        },
        data: {
          status: 'paused',
          content: '我来帮您查询北京天气。'
        }
      },
      {
        event: 'run.completed',
        metadata: {
          session_id: 'session-hitl-1',
          conversation_id: 'session-hitl-1',
          run_id: 'run-hitl-1',
          turn_id: 'turn:session-hitl-1:1',
          group_id: 'turn:session-hitl-1:1'
        },
        data: {
          status: 'paused'
        }
      }
    ]);
    bridge.flush('springai-hitl');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-hitl-1');
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');
    const textBlocks = snapshot.blocks.filter((block) => block.type === 'text');

    expect(runNode?.status).toBe('paused');
    expect(approvalBlock?.data).toMatchObject({
      interruptId: 'run-hitl-1',
      interruptIndex: 0,
      interruptCount: 1,
      requirementId: 'requirement-hitl-1',
      toolCallId: 'call-hitl-1',
      toolName: 'lookup_weather',
      toolArgs: {
        city: '北京'
      },
      allowedDecisions: ['approve', 'edit', 'reject'],
      reasonRequiredDecisions: ['edit', 'reject']
    });
    expect(textBlocks).toHaveLength(1);
  });
});

describe('useSpringAiChatSession', () => {
  it('creates stable chat ids from the shared helper', () => {
    const ids = createSpringAiChatIds({
      conversationId: 'session:demo:springai',
      at: 1775577600000
    });

    expect(ids).toEqual({
      conversationId: 'session:demo:springai',
      turnId: 'turn:session:demo:springai:1775577600000',
      userMessageId: 'message:user:session:demo:springai:1775577600000',
      assistantMessageId: 'message:assistant:session:demo:springai:1775577600000'
    });
  });

  it('allows a custom Spring AI HITL handler to submit an official edit decision', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const sideEffects: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createSpringAiSseResponse([
          {
            event: 'session.created',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1'
            },
            data: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1'
            }
          },
          {
            event: 'run.started',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1'
            },
            data: {
              mode: 'hitl'
            }
          },
          {
            event: 'response.started',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1',
              message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
            },
            data: {
              role: 'assistant',
              step: 0
            }
          },
          {
            event: 'response.delta',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1',
              message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
            },
            data: {
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'approval.required',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1',
              message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
            },
            data: {
              interrupt_id: 'run-springai-edit-1',
              assistant_text: '我来帮您查询北京天气。',
              action_requests: [
                {
                  requirement_id: 'requirement-springai-edit-1',
                  tool_call_id: 'call-springai-edit-1',
                  name: 'lookup_weather',
                  args: {
                    city: '北京'
                  },
                  allowed_decisions: ['approve', 'edit', 'reject']
                }
              ],
              reason_required_decisions: ['edit', 'reject']
            }
          },
          {
            event: 'response.completed',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1',
              message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
            },
            data: {
              status: 'paused',
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'run.completed',
            metadata: {
              session_id: 'session-springai-edit-1',
              conversation_id: 'session-springai-edit-1',
              run_id: 'run-springai-edit-1',
              turn_id: 'turn:session-springai-edit-1:1',
              group_id: 'turn:session-springai-edit-1:1'
            },
            data: {
              status: 'paused'
            }
          }
        ]);
      }

      return createSpringAiSseResponse([
        {
          event: 'run.started',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1'
          },
          data: {
            mode: 'hitl'
          }
        },
        {
          event: 'approval.resolved',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
          },
          data: {}
        },
        {
          event: 'tool.started',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
          },
          data: {
            tool_call_id: 'call-springai-edit-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '上海'
            }
          }
        },
        {
          event: 'tool.completed',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:0'
          },
          data: {
            tool_call_id: 'call-springai-edit-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '上海'
            },
            result: {
              city: '上海',
              condition: '阴'
            }
          }
        },
        {
          event: 'response.started',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:1'
          },
          data: {
            role: 'assistant',
            step: 1
          }
        },
        {
          event: 'response.delta',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:1'
          },
          data: {
            content: '我已经改查上海天气。'
          }
        },
        {
          event: 'response.completed',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1',
            message_id: 'message:assistant:turn:session-springai-edit-1:1:1'
          },
          data: {
            status: 'completed',
            content: '我已经改查上海天气。'
          }
        },
        {
          event: 'run.completed',
          metadata: {
            session_id: 'session-springai-edit-1',
            conversation_id: 'session-springai-edit-1',
            run_id: 'run-springai-edit-2',
            turn_id: 'turn:session-springai-edit-1:1',
            group_id: 'turn:session-springai-edit-1:1'
          },
          data: {
            status: 'completed'
          }
        }
      ]);
    });
    const sessionState = scope.run(() => useSpringAiChatSession<string>({
      source: 'http://springai.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:springai-hitl-edit',
      mode: 'hitl',
      hitl: {
        handlers: {
          changes_requested: async (context) => {
            sideEffects.push(`before:${context.actionKey}:${String(context.target.toolArgs?.city ?? '')}`);

            await context.submitDecision({
              type: 'edit',
              message: '请改查上海，并说明这是人工改参。',
              edited_action: {
                name: context.target.toolName ?? 'lookup_weather',
                args: {
                  ...(context.target.toolArgs ?? {}),
                  city: '上海'
                }
              }
            });

            sideEffects.push('after:changes_requested');
          }
        }
      },
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Spring AI edit HITL session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const changeHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.changes_requested
      : undefined;

    if (!approvalBlock || !changeHandler) {
      throw new Error('Failed to resolve Spring AI edit approval wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '工具调用确认'),
      status: 'pending',
      message: '请改查上海。',
      reason: '请改查上海。',
      ...(typeof approvalBlock.data.approvalId === 'string'
        ? {
            approvalId: approvalBlock.data.approvalId
          }
        : {}),
      ...(typeof approvalBlock.data.refId === 'string'
        ? {
            refId: approvalBlock.data.refId
          }
        : {}),
      block: approvalBlock,
      role: 'assistant',
      runtime: sessionState.runtime,
      snapshot: pausedSnapshot,
      emitIntent: () => {
        throw new Error('emitIntent should not be called in this test.');
      }
    };

    await changeHandler(context);
    await nextTick();

    const resumedSnapshot = sessionState.runtime.snapshot();
    const resumedApprovalBlock = resumedSnapshot.blocks.find((block) => block.id === approvalBlock.id);

    expect(sideEffects).toEqual([
      'before:changes_requested:北京',
      'after:changes_requested'
    ]);
    expect(capturedBodies[1]).toEqual({
      session_id: 'session-springai-edit-1',
      mode: 'hitl',
      springai_resume: {
        decisions: [
          {
            type: 'edit',
            message: '请改查上海，并说明这是人工改参。',
            edited_action: {
              name: 'lookup_weather',
              args: {
                city: '上海'
              }
            }
          }
        ]
      }
    });
    expect(resumedApprovalBlock?.data.status).toBe('changes_requested');

    scope.stop();
  });

  it('marks the paused tool as rejected when a Spring AI approval is rejected', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createSpringAiSseResponse([
          {
            event: 'session.created',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1'
            },
            data: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1'
            }
          },
          {
            event: 'run.started',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1'
            },
            data: {
              mode: 'hitl'
            }
          },
          {
            event: 'response.started',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1',
              message_id: 'message:assistant:turn:session-springai-reject-1:1:0'
            },
            data: {
              role: 'assistant',
              step: 0
            }
          },
          {
            event: 'response.delta',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1',
              message_id: 'message:assistant:turn:session-springai-reject-1:1:0'
            },
            data: {
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'approval.required',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1',
              message_id: 'message:assistant:turn:session-springai-reject-1:1:0'
            },
            data: {
              interrupt_id: 'run-springai-reject-1',
              assistant_text: '我来帮您查询北京天气。',
              action_requests: [
                {
                  requirement_id: 'requirement-springai-reject-1',
                  tool_call_id: 'call-springai-reject-1',
                  name: 'lookup_weather',
                  args: {
                    city: '北京'
                  },
                  allowed_decisions: ['approve', 'edit', 'reject']
                }
              ],
              reason_required_decisions: ['edit', 'reject']
            }
          },
          {
            event: 'response.completed',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1',
              message_id: 'message:assistant:turn:session-springai-reject-1:1:0'
            },
            data: {
              status: 'paused',
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'run.completed',
            metadata: {
              session_id: 'session-springai-reject-1',
              conversation_id: 'session-springai-reject-1',
              run_id: 'run-springai-reject-1',
              turn_id: 'turn:session-springai-reject-1:1',
              group_id: 'turn:session-springai-reject-1:1'
            },
            data: {
              status: 'paused'
            }
          }
        ]);
      }

      return createSpringAiSseResponse([
        {
          event: 'run.started',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1'
          },
          data: {
            mode: 'hitl'
          }
        },
        {
          event: 'approval.resolved',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1',
            message_id: 'message:assistant:turn:session-springai-reject-1:1:0'
          },
          data: {}
        },
        {
          event: 'response.started',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1',
            message_id: 'message:assistant:turn:session-springai-reject-1:1:1'
          },
          data: {
            role: 'assistant',
            step: 1
          }
        },
        {
          event: 'response.delta',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1',
            message_id: 'message:assistant:turn:session-springai-reject-1:1:1'
          },
          data: {
            content: '这次天气查询已取消。'
          }
        },
        {
          event: 'response.completed',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1',
            message_id: 'message:assistant:turn:session-springai-reject-1:1:1'
          },
          data: {
            status: 'completed',
            content: '这次天气查询已取消。'
          }
        },
        {
          event: 'run.completed',
          metadata: {
            session_id: 'session-springai-reject-1',
            conversation_id: 'session-springai-reject-1',
            run_id: 'run-springai-reject-2',
            turn_id: 'turn:session-springai-reject-1:1',
            group_id: 'turn:session-springai-reject-1:1'
          },
          data: {
            status: 'completed'
          }
        }
      ]);
    });
    const sessionState = scope.run(() => useSpringAiChatSession<string>({
      source: 'http://springai.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:springai-hitl-reject',
      mode: 'hitl',
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Spring AI reject HITL session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const toolBlock = pausedSnapshot.blocks.find((block) => block.nodeId === 'call-springai-reject-1');
    const rejectHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.reject
      : undefined;

    if (!approvalBlock || !toolBlock || !rejectHandler) {
      throw new Error('Failed to resolve Spring AI reject approval wiring.');
    }

    expect(toolBlock.data.status).toBe('pending');

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '工具调用确认'),
      status: 'pending',
      message: '不需要查天气。',
      reason: '不需要查天气。',
      ...(typeof approvalBlock.data.approvalId === 'string'
        ? {
            approvalId: approvalBlock.data.approvalId
          }
        : {}),
      ...(typeof approvalBlock.data.refId === 'string'
        ? {
            refId: approvalBlock.data.refId
          }
        : {}),
      block: approvalBlock,
      role: 'assistant',
      runtime: sessionState.runtime,
      snapshot: pausedSnapshot,
      emitIntent: () => {
        throw new Error('emitIntent should not be called in this test.');
      }
    };

    await rejectHandler(context);
    await nextTick();

    const resumedSnapshot = sessionState.runtime.snapshot();
    const resumedApprovalBlock = resumedSnapshot.blocks.find((block) => block.id === approvalBlock.id);
    const resumedToolBlock = resumedSnapshot.blocks.find((block) => block.nodeId === 'call-springai-reject-1');
    const resumedToolNode = resumedSnapshot.nodes.find((node) => node.id === 'call-springai-reject-1');

    expect(capturedBodies[1]).toEqual({
      session_id: 'session-springai-reject-1',
      mode: 'hitl',
      springai_resume: {
        decisions: [
          {
            type: 'reject',
            message: '不需要查天气。'
          }
        ]
      }
    });
    expect(resumedApprovalBlock?.data.status).toBe('rejected');
    expect(resumedToolNode?.status).toBe('rejected');
    expect(resumedToolNode?.message).toBe('已拒绝执行');
    expect(resumedToolBlock?.data.status).toBe('rejected');
    expect(resumedToolBlock?.data.message).toBe('已拒绝执行');

    scope.stop();
  });
});
