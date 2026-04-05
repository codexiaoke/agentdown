import { describe, expect, it } from 'vitest';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import { createLangChainProtocol, type LangChainEvent } from './langchain';

/**
 * 创建一个用于测试 LangChain adapter 的同步 bridge。
 */
function createLangChainTestBridge() {
  return createBridge<LangChainEvent>({
    scheduler: 'sync',
    protocol: createLangChainProtocol({
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

describe('createLangChainProtocol', () => {
  it('maps a real langchain tool flow into assistant segments and a tool card', () => {
    const bridge = createLangChainTestBridge();

    bridge.push([
      {
        event: 'on_chain_start',
        run_id: 'root-run-1',
        name: 'LangGraph',
        parent_ids: []
      },
      {
        event: 'on_chat_model_stream',
        run_id: 'model-run-1',
        name: 'ChatDeepSeek',
        parent_ids: ['root-run-1', 'model-step-1'],
        data: {
          chunk: {
            content: '我来帮您查询北京的天气。'
          }
        }
      },
      {
        event: 'on_tool_start',
        run_id: 'tool-run-1',
        name: 'lookup_weather',
        parent_ids: ['root-run-1', 'tools-step-1'],
        data: {
          input: {
            city: '北京'
          }
        }
      },
      {
        event: 'on_tool_end',
        run_id: 'tool-run-1',
        name: 'lookup_weather',
        parent_ids: ['root-run-1', 'tools-step-1'],
        data: {
          input: {
            city: '北京'
          },
          output: {
            content: '{"city":"北京","condition":"局部多云","tempC":15.1,"humidity":12}',
            tool_call_id: 'call-weather-1'
          }
        }
      },
      {
        event: 'on_chat_model_stream',
        run_id: 'model-run-2',
        name: 'ChatDeepSeek',
        parent_ids: ['root-run-1', 'model-step-2'],
        data: {
          chunk: {
            content: '根据查询结果，北京当前为局部多云。'
          }
        }
      },
      {
        event: 'on_chain_end',
        run_id: 'root-run-1',
        name: 'LangGraph',
        parent_ids: []
      }
    ]);
    bridge.flush('langchain-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'root-run-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-run-1');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '局部多云',
      tempC: 15.1,
      humidity: 12
    });
    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      nodeId: 'root-run-1',
      content: '我来帮您查询北京的天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      nodeId: 'tool-run-1',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      nodeId: 'root-run-1',
      content: '根据查询结果，北京当前为局部多云。'
    });
  });

  it('creates a synthetic tool start when only on_tool_end is observed', () => {
    const bridge = createLangChainTestBridge();

    bridge.push([
      {
        event: 'on_chain_start',
        run_id: 'root-run-2',
        name: 'LangGraph',
        parent_ids: []
      },
      {
        event: 'on_tool_end',
        run_id: 'tool-run-2',
        name: 'lookup_weather',
        parent_ids: ['root-run-2', 'tools-step-1'],
        data: {
          output: {
            content: '{"city":"上海","condition":"多云"}'
          }
        }
      },
      {
        event: 'on_chain_end',
        run_id: 'root-run-2',
        name: 'LangGraph',
        parent_ids: []
      }
    ]);
    bridge.flush('langchain-tool-fallback');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-run-2');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-run-2');

    expect(toolNode?.type).toBe('tool');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.result).toEqual({
      city: '上海',
      condition: '多云'
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
  });
});
