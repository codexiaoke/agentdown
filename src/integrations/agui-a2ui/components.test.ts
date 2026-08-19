import type { Component } from 'vue';
import { describe, expect, it } from 'vitest';
import type { RunSurfaceRendererRegistration } from '../../surface/types';
import {
  defineAgentAnswerComponents,
  parseAgentAnswerComponentProps
} from './components';

describe('agent answer components', () => {
  it('creates model tools and browser-only renderers from one whitelist', () => {
    const WeatherCard = {} as Component;
    const registry = defineAgentAnswerComponents({
      weather_card: {
        component: WeatherCard,
        description: '展示已知城市的天气结果。',
        propsSchema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            temperature: { type: 'number' }
          },
          required: ['city', 'temperature'],
          additionalProperties: false
        }
      }
    });

    expect(registry.tools).toEqual([
      expect.objectContaining({
        name: 'weather_card',
        description: '展示已知城市的天气结果。',
        metadata: { kind: 'frontend-answer-component' }
      })
    ]);
    expect(registry.resolveRenderer('weather_card')).toBe('answer-component.weather_card');
    expect(registry.resolveRenderer('missing')).toBeUndefined();

    const renderer = registry.renderers['answer-component.weather_card'] as RunSurfaceRendererRegistration;
    expect(renderer.component).toBe(WeatherCard);
    const props = (renderer.props as Function)({
      block: { data: { arguments: '{"city":"深圳","temperature":26}' } },
      runtime: {},
      snapshot: {},
      emitIntent: () => undefined
    });
    expect(props).toMatchObject({
      city: '深圳',
      temperature: 26,
      answerComponentProps: { city: '深圳', temperature: 26 }
    });
  });

  it('fails closed for malformed, oversized, or unsafe props', () => {
    expect(parseAgentAnswerComponentProps('{bad json')).toEqual({});
    expect(parseAgentAnswerComponentProps('[]')).toEqual({});
    expect(parseAgentAnswerComponentProps('{"constructor":{"polluted":true}}')).toEqual({});
    expect(parseAgentAnswerComponentProps(JSON.stringify({ value: 'x'.repeat(70_000) }))).toEqual({});
  });

  it('rejects invalid public component definitions', () => {
    expect(() => defineAgentAnswerComponents({
      'bad name': {
        component: {} as Component,
        description: 'bad',
        propsSchema: { type: 'object' }
      }
    })).toThrow('Invalid answer component name');
    expect(() => defineAgentAnswerComponents({
      weather_card: {
        component: {} as Component,
        description: '',
        propsSchema: { type: 'object' }
      }
    })).toThrow('requires a description');
  });
});
