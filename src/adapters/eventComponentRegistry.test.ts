import { describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import { composeProtocols } from '../runtime/composeProtocols';
import { createEventComponentRegistry } from './eventComponentRegistry';
import { defineAgnoEventComponents } from './agno';
import { createAgnoProtocol, type AgnoEvent } from './agno';

describe('createEventComponentRegistry', () => {
  it('maps a matched event into a custom renderer block and surface renderers', () => {
    const WeatherEventCard = {} as Component;
    const registry = createEventComponentRegistry<{ event: string; city: string }>({
      definitions: {
        'event.weather': {
          on: 'weather.ready',
          component: WeatherEventCard,
          resolve: ({ event }) => ({
            id: 'event:block:weather',
            groupId: 'turn:weather',
            data: {
              city: event.city
            }
          })
        }
      },
      resolveEventName(event) {
        return event.event;
      }
    });
    const bridge = createBridge<{ event: string; city: string }>({
      scheduler: 'sync',
      protocol: registry.protocol,
      assemblers: {}
    });

    bridge.push([
      {
        event: 'weather.ready',
        city: '北京'
      }
    ]);
    bridge.flush('event-component-registry');

    const snapshot = bridge.runtime.snapshot();
    const block = snapshot.blocks.find((item) => item.id === 'event:block:weather');

    expect(registry.renderers['event.weather']).toBe(WeatherEventCard);
    expect(block).toMatchObject({
      id: 'event:block:weather',
      renderer: 'event.weather',
      type: 'event',
      groupId: 'turn:weather'
    });
    expect(block?.data.city).toBe('北京');
  });

  it('composes cleanly with the agno protocol so both normal content and event card can render together', () => {
    const WeatherEventCard = {} as Component;
    const eventRegistry = defineAgnoEventComponents({
      'event.weather': {
        on: 'weather_card',
        component: WeatherEventCard,
        resolve: ({ event }) => ({
          id: 'event:block:agno-weather',
          groupId: 'turn:agno-run-1',
          data: {
            payload: (event as AgnoEvent).result
          }
        })
      }
    });
    const bridge = createBridge<AgnoEvent>({
      scheduler: 'sync',
      protocol: composeProtocols(
        createAgnoProtocol(),
        eventRegistry.protocol
      ),
      assemblers: {
        markdown: createMarkdownAssembler()
      }
    });

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'agno-run-1',
        name: 'Agno'
      },
      {
        event: 'RunContent',
        run_id: 'agno-run-1',
        content: '我来查询天气。'
      },
      {
        event: 'weather_card',
        run_id: 'agno-run-1',
        result: {
          city: '北京'
        }
      }
    ]);
    bridge.flush('agno-event-component-registry');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'agno-run-1');
    const eventBlock = snapshot.blocks.find((block) => block.id === 'event:block:agno-weather');

    expect(runNode?.type).toBe('run');
    expect(eventRegistry.renderers['event.weather']).toBe(WeatherEventCard);
    expect(eventBlock).toMatchObject({
      id: 'event:block:agno-weather',
      renderer: 'event.weather'
    });
    expect(eventBlock?.data.payload).toEqual({
      city: '北京'
    });
  });
});
