import { describe, expect, it } from 'vitest';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import { createAutoGenProtocol, type AutoGenEvent } from './autogen';

/**
 * 创建一个用于测试 AutoGen adapter 的同步 bridge。
 */
function createAutoGenTestBridge() {
  return createBridge<AutoGenEvent>({
    scheduler: 'sync',
    protocol: createAutoGenProtocol({
      toolRenderer: ({ tool }) => (
        tool?.name === 'lookup_weather'
          ? 'tool.weather'
          : 'tool'
      )
    }),
    assemblers: {
      markdown: createMarkdownAssembler()
    }
  });
}

describe('createAutoGenProtocol', () => {
  it('maps a real autogen stream into assistant text and a tool card', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'TextMessage',
        id: 'user-1',
        source: 'user',
        content: '帮我查一下北京天气，并说明工具调用过程。'
      },
      {
        type: 'ModelClientStreamingChunkEvent',
        id: 'chunk-1',
        source: 'assistant',
        full_message_id: 'assistant-msg-1',
        content: '我来帮您查询北京的天气。'
      },
      {
        type: 'ThoughtEvent',
        id: 'assistant-msg-1',
        source: 'assistant',
        content: '我来帮您查询北京的天气。'
      },
      {
        type: 'ToolCallRequestEvent',
        id: 'tool-request-1',
        source: 'assistant',
        content: [
          {
            id: 'call-weather-1',
            name: 'lookup_weather',
            arguments: '{"city":"北京"}'
          }
        ]
      },
      {
        type: 'ToolCallExecutionEvent',
        id: 'tool-execution-1',
        source: 'assistant',
        content: [
          {
            call_id: 'call-weather-1',
            name: 'lookup_weather',
            content: "{'city': '北京', 'condition': '局部多云', 'tempC': 14.3, 'humidity': 14}",
            is_error: false
          }
        ]
      },
      {
        type: 'TaskResult',
        id: 'task-result-1',
        messages: []
      }
    ]);
    bridge.flush('autogen-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.type === 'run');
    const toolNode = snapshot.nodes.find((node) => node.type === 'tool');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '局部多云',
      tempC: 14.3,
      humidity: 14
    });
    expect(orderedRenderableBlocks).toHaveLength(2);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      content: '我来帮您查询北京的天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      renderer: 'tool.weather'
    });
  });

  it('finishes pending tools from ToolCallSummaryMessage when execution events are missing', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'ToolCallRequestEvent',
        id: 'tool-request-2',
        source: 'assistant',
        content: [
          {
            id: 'call-weather-2',
            name: 'lookup_weather',
            arguments: '{"city":"上海"}'
          }
        ]
      },
      {
        type: 'ToolCallSummaryMessage',
        id: 'tool-summary-2',
        source: 'assistant',
        tool_calls: [
          {
            id: 'call-weather-2',
            name: 'lookup_weather',
            arguments: '{"city":"上海"}'
          }
        ],
        results: [
          {
            call_id: 'call-weather-2',
            name: 'lookup_weather',
            content: '{"city":"上海","condition":"多云"}',
            is_error: false
          }
        ]
      },
      {
        type: 'TaskResult',
        id: 'task-result-2',
        messages: []
      }
    ]);
    bridge.flush('autogen-summary-fallback');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.type === 'tool');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === toolNode?.id);

    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.result).toEqual({
      city: '上海',
      condition: '多云'
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
  });
});
