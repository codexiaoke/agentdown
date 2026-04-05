import { describe, expect, it } from 'vitest';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import { createAgnoProtocol, type AgnoEvent } from './agno';

/**
 * 创建一个用于测试 Agno adapter 的同步 bridge。
 */
function createAgnoTestBridge() {
  return createBridge<AgnoEvent>({
    scheduler: 'sync',
    protocol: createAgnoProtocol({
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

describe('createAgnoProtocol', () => {
  it('maps a full Agno run into runtime nodes and stable markdown blocks', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-1',
        agent_name: '天气助手'
      },
      {
        event: 'RunContent',
        run_id: 'run-1',
        content: '我来为你查询天气'
      },
      {
        event: 'ToolCallStarted',
        run_id: 'run-1',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          }
        }
      },
      {
        event: 'ToolCallCompleted',
        run_id: 'run-1',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          result: {
            city: '北京',
            condition: '晴',
            tempC: 26
          }
        }
      },
      {
        event: 'RunContentCompleted',
        run_id: 'run-1'
      },
      {
        event: 'RunCompleted',
        run_id: 'run-1'
      }
    ]);
    bridge.flush('agno-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-1');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-1');
    const assistantTextBlock = snapshot.blocks.find((block) => block.type === 'text');

    expect(runNode?.title).toBe('天气助手');
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
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(assistantTextBlock?.content).toBe('我来为你查询天气');
  });

  it('creates a synthetic tool start when Agno only sends tool_call_completed', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'run_started',
        run_id: 'run-2'
      },
      {
        event: 'tool_call_completed',
        run_id: 'run-2',
        tool: {
          tool_name: 'lookup_weather',
          result: {
            city: '上海',
            condition: '多云'
          }
        }
      },
      {
        event: 'run_completed',
        run_id: 'run-2'
      }
    ]);
    bridge.flush('agno-tool-fallback');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.parentId === 'run-2');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === toolNode?.id);

    expect(toolNode?.type).toBe('tool');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.result).toEqual({
      city: '上海',
      condition: '多云'
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
  });

  it('normalizes python repr tool results into structured objects', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'run_started',
        run_id: 'run-3'
      },
      {
        event: 'tool_call_completed',
        run_id: 'run-3',
        tool: {
          tool_name: 'lookup_weather',
          result: "{'city': '北京', 'condition': '局部多云', 'tempC': 15.9, 'humidity': 11, 'timezone': 'Asia/Shanghai'}"
        }
      },
      {
        event: 'run_completed',
        run_id: 'run-3'
      }
    ]);
    bridge.flush('agno-python-result');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.parentId === 'run-3');

    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '局部多云',
      tempC: 15.9,
      humidity: 11,
      timezone: 'Asia/Shanghai'
    });
  });

  it('splits assistant markdown into separate segments around a tool call', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-4',
        agent_name: '天气助手'
      },
      {
        event: 'RunContent',
        run_id: 'run-4',
        content: '我来帮您查询北京今天的天气情况。'
      },
      {
        event: 'ToolCallStarted',
        run_id: 'run-4',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          }
        }
      },
      {
        event: 'ToolCallCompleted',
        run_id: 'run-4',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          result: {
            city: '北京',
            condition: '局部多云',
            tempC: 15.6
          }
        }
      },
      {
        event: 'RunContent',
        run_id: 'run-4',
        content: '根据查询结果，北京今天（2026年4月5日）的天气情况如下：'
      },
      {
        event: 'RunContentCompleted',
        run_id: 'run-4'
      },
      {
        event: 'RunCompleted',
        run_id: 'run-4'
      }
    ]);
    bridge.flush('agno-segmented-content');

    const snapshot = bridge.runtime.snapshot();
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      nodeId: 'run-4',
      content: '我来帮您查询北京今天的天气情况。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      nodeId: 'tool-1',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      nodeId: 'run-4',
      content: '根据查询结果，北京今天（2026年4月5日）的天气情况如下：'
    });
  });
});
