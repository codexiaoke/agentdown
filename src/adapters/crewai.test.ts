import { describe, expect, it } from 'vitest';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import { createCrewAIProtocol, type CrewAIEvent } from './crewai';

/**
 * 创建一个用于测试 CrewAI adapter 的同步 bridge。
 */
function createCrewAITestBridge() {
  return createBridge<CrewAIEvent>({
    scheduler: 'sync',
    protocol: createCrewAIProtocol({
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

describe('createCrewAIProtocol', () => {
  it('maps a real crewai stream into assistant segments and a tool card', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'text'
        },
        content: '我来帮您查询北京的天气。'
      },
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'tool_call'
        },
        content: '',
        tool_call: {
          tool_id: 'call-weather-1',
          tool_name: 'lookup_weather',
          arguments: ''
        }
      },
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'text'
        },
        content: '北京当前天气：阴天，温度13.7°C。'
      },
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        raw: '北京当前天气：阴天，温度13.7°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-weather-1',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"city":"北京"}'
                    }
                  }
                ]
              },
              {
                role: 'tool',
                name: 'lookup_weather',
                tool_call_id: 'call-weather-1',
                content: '{\n  "city": "北京",\n  "condition": "阴天",\n  "tempC": 13.7,\n  "humidity": 15\n}'
              },
              {
                role: 'assistant',
                content: '北京当前天气：阴天，温度13.7°C。'
              }
            ]
          }
        ]
      }
    ]);
    bridge.flush('crewai-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'agent-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-1');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '阴天',
      tempC: 13.7,
      humidity: 15
    });
    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      nodeId: 'agent-1',
      content: '我来帮您查询北京的天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      nodeId: 'call-weather-1',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      nodeId: 'agent-1',
      content: '北京当前天气：阴天，温度13.7°C。'
    });
  });

  it('creates a synthetic tool card and final answer when only CrewOutput is observed', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        raw: '上海当前天气：多云，温度21°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-weather-2',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"city":"上海"}'
                    }
                  }
                ]
              },
              {
                role: 'tool',
                name: 'lookup_weather',
                tool_call_id: 'call-weather-2',
                content: '{"city":"上海","condition":"多云","tempC":21}'
              },
              {
                role: 'assistant',
                content: '上海当前天气：多云，温度21°C。'
              }
            ]
          }
        ]
      }
    ]);
    bridge.flush('crewai-output-only');

    const snapshot = bridge.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'call-weather-2');
    const textBlock = snapshot.blocks.find((block) => block.type === 'text');
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-2');

    expect(toolNode?.status).toBe('done');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(textBlock).toMatchObject({
      type: 'text',
      content: '上海当前天气：多云，温度21°C。'
    });
  });
});
