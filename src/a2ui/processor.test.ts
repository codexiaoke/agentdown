import { describe, expect, it, vi } from 'vitest';
import { createA2UiBasicCatalog } from './catalog';
import { createA2UiProcessor } from './processor';
import { A2UI_BASIC_COMPONENT_NAMES } from './catalog';
import { A2UI_BASIC_CATALOG_ID } from './types';

function createMessages() {
  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId: 'planner',
        catalogId: A2UI_BASIC_CATALOG_ID,
        sendDataModel: true
      }
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['title', 'city', 'submit']
          },
          {
            id: 'title',
            component: 'Text',
            text: { path: '/title' },
            variant: 'h2'
          },
          {
            id: 'city',
            component: 'TextField',
            label: '城市',
            value: { path: '/city' }
          },
          {
            id: 'submit',
            component: 'Button',
            child: 'submit-label',
            action: {
              event: {
                name: 'trip_submitted',
                context: { city: { path: '/city' } }
              }
            }
          },
          {
            id: 'submit-label',
            component: 'Text',
            text: '生成计划'
          }
        ]
      }
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'planner',
        path: '/',
        value: { title: '周末旅行', city: '杭州' }
      }
    }
  ];
}

describe('createA2UiProcessor', () => {
  it('processes official v0.9 surface, components and data model messages', () => {
    const controller = createA2UiProcessor({ catalogs: [createA2UiBasicCatalog()] });
    const messages = createMessages();

    controller.process(messages[0]);
    expect(controller.getSurface('planner')).toBeDefined();
    expect(controller.getSurface('planner')?.componentsModel.get('title')).toBeUndefined();

    controller.process(messages[1]);
    expect(controller.getSurface('planner')?.componentsModel.get('title')?.type).toBe('Text');
    expect(controller.getSurface('planner')?.dataModel.get('/city')).toBeUndefined();

    controller.process(messages[2]);

    const surface = controller.getSurface('planner');
    expect(surface?.dataModel.get('/city')).toBe('杭州');
    expect(controller.processor.getClientDataModel()).toEqual({
      version: 'v0.9',
      surfaces: {
        planner: { title: '周末旅行', city: '杭州' }
      }
    });

    controller.dispose();
  });

  it('emits a standard A2UI client action', async () => {
    const onAction = vi.fn();
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      onAction
    });
    controller.process(createMessages());

    await controller.getSurface('planner')?.dispatchAction({
      event: {
        name: 'trip_submitted',
        context: { city: '杭州' }
      }
    }, 'submit');

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'trip_submitted',
      surfaceId: 'planner',
      sourceComponentId: 'submit',
      context: { city: '杭州' }
    }));

    controller.dispose();
  });

  it('rejects unknown catalogs and components', () => {
    const controller = createA2UiProcessor({ catalogs: [createA2UiBasicCatalog()] });

    expect(() => controller.process({
      version: 'v0.9',
      createSurface: { surfaceId: 'bad', catalogId: 'https://evil.invalid/catalog.json' }
    })).toThrow('catalog is not allowed');

    controller.process(createMessages()[0]);
    expect(() => controller.process({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [{ id: 'root', component: 'ArbitraryScript', source: 'alert(1)' }]
      }
    })).toThrow('component is not registered');

    controller.dispose();
  });

  it('enforces resource limits and blocks prototype pollution keys', () => {
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      policy: { maxComponents: 1 }
    });
    controller.process(createMessages()[0]);

    expect(() => controller.process({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'planner',
        components: [
          { id: 'one', component: 'Text', text: 'one' },
          { id: 'two', component: 'Text', text: 'two' }
        ]
      }
    })).toThrow('exceeds 1 components');

    const polluted = JSON.parse('{"version":"v0.9","updateDataModel":{"surfaceId":"planner","path":"/","value":{"__proto__":{"admin":true}}}}');
    expect(() => controller.process(polluted)).toThrow('forbidden key');

    controller.dispose();
  });

  it('does not register the side-effecting openUrl function by default', () => {
    const catalog = createA2UiBasicCatalog();

    expect(catalog.protocol.functions.has('formatString')).toBe(true);
    expect(catalog.protocol.functions.has('openUrl')).toBe(false);
  });

  it('registers a frontend-owned Vue renderer for every Basic Catalog component', () => {
    const catalog = createA2UiBasicCatalog();

    expect(Object.keys(catalog.renderers).sort()).toEqual(
      [...A2UI_BASIC_COMPONENT_NAMES].sort()
    );
  });

  it('measures message limits as UTF-8 bytes', () => {
    const controller = createA2UiProcessor({
      catalogs: [createA2UiBasicCatalog()],
      policy: { maxMessageBytes: 170 }
    });

    expect(() => controller.process({
      version: 'v0.9',
      createSurface: {
        surfaceId: `planner-${'杭'.repeat(20)}`,
        catalogId: A2UI_BASIC_CATALOG_ID
      }
    })).toThrow('exceeds 170 bytes');

    controller.dispose();
  });
});
