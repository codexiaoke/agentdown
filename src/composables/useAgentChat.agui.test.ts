import { EventType } from '@ag-ui/core';
import { effectScope, type Component } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { A2UI_BASIC_CATALOG_ID } from '../a2ui';
import { useAgentChat } from './useAgentChat';

describe('useAgentChat unified stream', () => {
  it('uses one AG-UI chat stream for text, frontend components, and A2UI', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const WeatherCard = {} as Component;
    const fetchMock = vi.fn(async (_source: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(request);
      const threadId = String(request.threadId);
      const runId = String(request.runId);
      const events = [
        { type: EventType.RUN_STARTED, threadId, runId },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-1',
          role: 'assistant'
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-1',
          delta: '深圳当前天气如下。'
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1' },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'weather-1',
          toolCallName: 'weather_card',
          parentMessageId: 'assistant-1'
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'weather-1',
          delta: '{"city":"深圳","temperature":26,"condition":"多云"}'
        },
        { type: EventType.TOOL_CALL_END, toolCallId: 'weather-1' },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: 'weather-1',
          messageId: 'weather-result-1',
          content: '{"rendered":true}'
        },
        { type: EventType.RUN_FINISHED, threadId, runId }
      ];
      return new Response([
        ...events.flatMap((event) => [`data: ${JSON.stringify(event)}`, '']),
        ''
      ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const scope = effectScope();
    const session = scope.run(() => useAgentChat<string>({
      source: '/api/stream/chat',
      conversationId: 'thread:unified-chat',
      components: {
        weather_card: {
          component: WeatherCard,
          description: '展示天气结果；已获得城市、温度和天气状况时使用。',
          propsSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              temperature: { type: 'number' },
              condition: { type: 'string' }
            },
            required: ['city', 'temperature', 'condition'],
            additionalProperties: false
          }
        }
      },
      transport: { fetch: fetchMock as typeof fetch }
    }))!;

    await session.send('深圳天气怎么样？');

    expect(requests[0]).toMatchObject({
      messages: [{ role: 'user', content: '深圳天气怎么样？' }],
      tools: [expect.objectContaining({ name: 'weather_card' })],
      forwardedProps: {
        a2ui: {
          clientCapabilities: {
            'v0.9.1': { supportedCatalogIds: [A2UI_BASIC_CATALOG_ID] }
          }
        }
      }
    });
    expect(session.runtime.block('block:weather-1')).toMatchObject({
      renderer: 'answer-component.weather_card',
      data: {
        arguments: '{"city":"深圳","temperature":26,"condition":"多云"}'
      }
    });
    expect(session.surface.value.renderers?.['answer-component.weather_card']).toMatchObject({
      component: WeatherCard
    });

    scope.stop();
  });
});
