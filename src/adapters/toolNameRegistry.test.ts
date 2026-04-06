import { describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import { defineAgnoToolComponents } from './agno';
import { toolByName } from './toolNameRegistry';

describe('defineAgnoToolComponents', () => {
  it('builds both toolRenderer and renderers from one tool-name config', () => {
    const WeatherToolCard = {} as Component;
    const agnoTools = defineAgnoToolComponents({
      'tool.weather': {
        match: ['weather', '天气'],
        mode: 'includes',
        component: WeatherToolCard
      }
    });

    expect(
      agnoTools.toolRenderer({
        runId: 'run-1',
        toolId: 'tool-1',
        tool: {
          tool_name: 'lookup_weather'
        },
        packet: {
          event: 'ToolCallStarted'
        },
        context: {} as never
      })
    ).toBe('tool.weather');
    expect(agnoTools.renderers['tool.weather']).toBe(WeatherToolCard);
  });

  it('falls back to the default renderer when no tool name matches', () => {
    const agnoTools = defineAgnoToolComponents(
      {
        'tool.weather': {
          match: ['weather', '天气'],
          mode: 'includes'
        }
      },
      {
        fallback: 'tool.default'
      }
    );

    expect(
      agnoTools.toolRenderer({
        runId: 'run-2',
        toolId: 'tool-2',
        tool: {
          tool_name: 'lookup_news'
        },
        packet: {
          event: 'ToolCallStarted'
        },
        context: {} as never
      })
    ).toBe('tool.default');
  });

  it('supports the lighter toolByName() DSL directly', () => {
    const WeatherToolCard = {} as Component;
    const registry = toolByName<{ toolName?: string }>(
      {
        'tool.weather': {
          match: ['weather', '天气'],
          mode: 'includes',
          component: WeatherToolCard
        }
      },
      {
        resolveName(context) {
          return context.toolName;
        }
      }
    );

    expect(registry.toolRenderer({
      toolName: 'lookup_weather'
    })).toBe('tool.weather');
    expect(registry.renderers['tool.weather']).toBe(WeatherToolCard);
  });
});
