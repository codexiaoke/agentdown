<script setup lang="ts">
import { EventType, type AGUIEvent } from '@ag-ui/core';
import { ref } from 'vue';
import MarkdownRenderer from '../../src/components/MarkdownRenderer.vue';
import RunSurface from '../../src/components/RunSurface.vue';
import A2UiSurface from '../../src/a2ui/components/A2UiSurface.vue';
import {
  A2UI_BASIC_CATALOG_ID,
  type A2UiActionStateSnapshot,
  type A2UiClientEnvelope
} from '../../src/a2ui/types';
import { createMarkdownAssembler } from '../../src/runtime/assemblers';
import { createBridge } from '../../src/runtime/createBridge';
import type { RuntimeCommand } from '../../src/runtime/types';
import { useAgentChat } from '../../src/composables/useAgentChat';
import { browserAgentdown } from './agentdown';
import HarnessWeatherCard from './HarnessWeatherCard.vue';

type StreamPacket = {
  type: 'open' | 'delta' | 'close';
  text?: string;
};

const maliciousMarkdown = [
  '## HTML 安全验收',
  '',
  '<div id="raw-safe" style="color:red" onclick="window.__agentdownXss = true">原始 HTML 安全内容</div>',
  '<img id="raw-image" src="/missing-image.png" onerror="window.__agentdownXss = true">',
  '<iframe id="raw-frame" src="https://example.com"></iframe>',
  '<' + 'script>window.__agentdownXss = true<' + '/script>'
].join('\n');

const runtime = browserAgentdown.createRuntime();
const bridge = createBridge<StreamPacket>({
  runtime,
  scheduler: 'sync',
  protocol: {
    map({ packet }): RuntimeCommand {
      if (packet.type === 'open') {
        return {
          type: 'stream.open',
          streamId: 'e2e:stream',
          slot: 'main',
          assembler: 'markdown',
          conversationId: 'e2e:conversation',
          turnId: 'e2e:turn',
          messageId: 'e2e:message',
          groupId: 'e2e:turn',
          data: {
            blockData: {
              role: 'assistant'
            }
          }
        };
      }

      if (packet.type === 'delta') {
        return {
          type: 'stream.delta',
          streamId: 'e2e:stream',
          text: packet.text ?? ''
        };
      }

      return {
        type: 'stream.close',
        streamId: 'e2e:stream'
      };
    }
  },
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
const streaming = ref(false);

async function startStreaming() {
  bridge.reset();
  streaming.value = true;
  bridge.push({ type: 'open' });
  bridge.push({ type: 'delta', text: '## 真实浏览器流式输出\n\n' });
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 20));
  bridge.push({ type: 'delta', text: 'Chrome、Firefox、WebKit ' });
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 20));
  bridge.push({ type: 'delta', text: '**全部收到消息**。' });
  bridge.push({ type: 'close' });
  streaming.value = false;
}

const editableA2uiMessages: unknown[] = [
  {
    version: 'v0.9.1',
    createSurface: {
      surfaceId: 'production-form',
      catalogId: A2UI_BASIC_CATALOG_ID,
      sendDataModel: true
    }
  },
  {
    version: 'v0.9.1',
    updateComponents: {
      surfaceId: 'production-form',
      components: [
        { id: 'root', component: 'Column', children: ['title', 'intro', 'name', 'agree', 'topics', 'minutes', 'date', 'tabs', 'modal', 'divider', 'submit'] },
        { id: 'title', component: 'Text', text: '生产级 A2UI 表单', variant: 'h2' },
        { id: 'intro', component: 'Text', text: '支持 **基础 Markdown**、`代码` 和安全交互。' },
        { id: 'name', component: 'TextField', label: '计划名称', value: { path: '/name' } },
        { id: 'agree', component: 'CheckBox', label: '启用每日提醒', value: { path: '/reminder' } },
        {
          id: 'topics',
          component: 'ChoicePicker',
          label: '阅读主题',
          value: { path: '/topics' },
          variant: 'multipleSelection',
          displayStyle: 'chips',
          filterable: true,
          options: [
            { label: '工程', value: 'engineering' },
            { label: '产品', value: 'product' },
            { label: '设计', value: 'design' }
          ]
        },
        { id: 'minutes', component: 'Slider', label: '每日分钟数', min: 10, max: 90, value: { path: '/minutes' } },
        { id: 'date', component: 'DateTimeInput', label: '开始日期', enableDate: true, value: { path: '/date' } },
        { id: 'tabs', component: 'Tabs', tabs: [{ title: '第一页', child: 'tab-one' }, { title: '第二页', child: 'tab-two' }] },
        { id: 'tab-one', component: 'Text', text: '第一页内容' },
        { id: 'tab-two', component: 'Text', text: '第二页内容' },
        { id: 'modal', component: 'Modal', trigger: 'modal-trigger', content: 'modal-content' },
        { id: 'modal-trigger', component: 'Button', child: 'modal-trigger-label' },
        { id: 'modal-trigger-label', component: 'Text', text: '查看说明' },
        { id: 'modal-content', component: 'Text', text: '这是可用 Escape 关闭并恢复焦点的说明。' },
        { id: 'divider', component: 'Divider' },
        {
          id: 'submit',
          component: 'Button',
          child: 'submit-label',
          variant: 'primary',
          action: {
            event: {
              name: 'plan_submitted',
              context: {
                name: { path: '/name' },
                reminder: { path: '/reminder' },
                topics: { path: '/topics' },
                minutes: { path: '/minutes' },
                date: { path: '/date' }
              }
            }
          }
        },
        { id: 'submit-label', component: 'Text', text: '提交计划' }
      ]
    }
  },
  {
    version: 'v0.9.1',
    updateDataModel: {
      surfaceId: 'production-form',
      path: '/',
      value: {
        name: '默认计划',
        reminder: false,
        topics: ['engineering'],
        minutes: 30,
        date: '2026-08-11'
      }
    }
  }
];

interface SubmittedPlan {
  name: string;
  reminder: boolean;
  topics: string[];
  minutes: number;
  date: string;
}

const defaultPlan: SubmittedPlan = {
  name: '默认计划',
  reminder: false,
  topics: ['engineering'],
  minutes: 30,
  date: '2026-08-11'
};
const a2uiMessages = ref<unknown[]>(editableA2uiMessages);
let submittedPlan: SubmittedPlan = defaultPlan;

function editableMessages(plan: SubmittedPlan): unknown[] {
  return [
    editableA2uiMessages[0],
    editableA2uiMessages[1],
    {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 'production-form',
        path: '/',
        value: plan
      }
    }
  ];
}

function submittedMessages(plan: SubmittedPlan): unknown[] {
  return [
    editableA2uiMessages[0],
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'production-form',
        components: [
          { id: 'root', component: 'Column', children: ['status', 'summary', 'edit'] },
          { id: 'status', component: 'Text', text: '✓ 已提交', variant: 'h2' },
          { id: 'summary', component: 'Card', child: 'details' },
          { id: 'details', component: 'Column', children: ['name-summary', 'minutes-summary', 'topics-summary', 'date-summary'] },
          { id: 'name-summary', component: 'Text', text: { path: '/nameSummary' } },
          { id: 'minutes-summary', component: 'Text', text: { path: '/minutesSummary' } },
          { id: 'topics-summary', component: 'Text', text: { path: '/topicsSummary' } },
          { id: 'date-summary', component: 'Text', text: { path: '/dateSummary' } },
          {
            id: 'edit',
            component: 'Button',
            child: 'edit-label',
            action: {
              event: {
                name: 'plan_edit_requested',
                context: {
                  name: { path: '/name' },
                  reminder: { path: '/reminder' },
                  topics: { path: '/topics' },
                  minutes: { path: '/minutes' },
                  date: { path: '/date' }
                }
              }
            }
          },
          { id: 'edit-label', component: 'Text', text: '修改计划' }
        ]
      }
    },
    {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 'production-form',
        path: '/',
        value: {
          ...plan,
          nameSummary: `计划名称：${plan.name}`,
          minutesSummary: `每日时长：${plan.minutes} 分钟`,
          topicsSummary: `阅读主题：${plan.topics.join('、')}`,
          dateSummary: `开始日期：${plan.date}`
        }
      }
    }
  ];
}

const readonlyWeatherMessages: unknown[] = [
  {
    version: 'v0.9.1',
    createSurface: {
      surfaceId: 'readonly-weather',
      catalogId: A2UI_BASIC_CATALOG_ID
    }
  },
  {
    version: 'v0.9.1',
    updateComponents: {
      surfaceId: 'readonly-weather',
      components: [
        { id: 'root', component: 'Card', child: 'content' },
        { id: 'content', component: 'Column', children: ['city', 'condition', 'divider', 'humidity', 'wind'] },
        { id: 'city', component: 'Text', text: { path: '/city' }, variant: 'h2' },
        { id: 'condition', component: 'Text', text: { path: '/condition' }, variant: 'h3' },
        { id: 'divider', component: 'Divider' },
        { id: 'humidity', component: 'Text', text: { path: '/humidity' } },
        { id: 'wind', component: 'Text', text: { path: '/wind' } }
      ]
    }
  },
  {
    version: 'v0.9.1',
    updateDataModel: {
      surfaceId: 'readonly-weather',
      path: '/',
      value: {
        city: '深圳',
        condition: '26°C · 多云',
        humidity: '湿度 72%',
        wind: '风速 3.2 m/s'
      }
    }
  }
];

const unifiedRequestThreadIds = ref<string[]>([]);

function sseResponse(events: AGUIEvent[]): Response {
  return new Response([
    ...events.flatMap((event) => [`data: ${JSON.stringify(event)}`, '']),
    ''
  ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } });
}

const unifiedFetch: typeof fetch = async (_source, init) => {
  const request = JSON.parse(String(init?.body)) as {
    threadId: string;
    runId: string;
    messages: Array<{ content?: string }>;
  };
  const content = request.messages.at(-1)?.content ?? '';
  unifiedRequestThreadIds.value.push(request.threadId);

  const events: AGUIEvent[] = [
    { type: EventType.RUN_STARTED, threadId: request.threadId, runId: request.runId }
  ];

  if (content === 'weather') {
    events.push(
      { type: EventType.TEXT_MESSAGE_START, messageId: `${request.runId}:assistant`, role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: `${request.runId}:assistant`, delta: '使用前端注册的天气组件展示。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: `${request.runId}:assistant` },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: `${request.runId}:weather`,
        toolCallName: 'weather_card',
        parentMessageId: `${request.runId}:assistant`
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: `${request.runId}:weather`,
        delta: '{"city":"深圳","temperature":26,"condition":"多云","humidity":72,"windSpeed":3.2}'
      },
      { type: EventType.TOOL_CALL_END, toolCallId: `${request.runId}:weather` },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: `${request.runId}:weather`,
        messageId: `${request.runId}:weather-result`,
        content: '{"rendered":true}'
      }
    );
  } else if (content === 'a2ui') {
    events.push(
      { type: EventType.TEXT_MESSAGE_START, messageId: `${request.runId}:assistant`, role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: `${request.runId}:assistant`, delta: '固定组件不足，返回动态计划界面。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: `${request.runId}:assistant` },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9.1',
          createSurface: {
            surfaceId: 'unified-planner',
            catalogId: A2UI_BASIC_CATALOG_ID
          }
        }
      },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9.1',
          updateComponents: {
            surfaceId: 'unified-planner',
            components: [
              { id: 'root', component: 'Card', child: 'content' },
              { id: 'content', component: 'Column', children: ['title', 'book', 'minutes'] },
              { id: 'title', component: 'Text', text: '动态读书计划', variant: 'h2' },
              { id: 'book', component: 'TextField', label: '书名', value: { path: '/book' } },
              { id: 'minutes', component: 'Slider', label: '每日分钟数', min: 10, max: 90, value: { path: '/minutes' } }
            ]
          }
        }
      },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9.1',
          updateDataModel: {
            surfaceId: 'unified-planner',
            path: '/',
            value: { book: 'Designing Data-Intensive Applications', minutes: 30 }
          }
        }
      }
    );
  } else {
    events.push(
      { type: EventType.TEXT_MESSAGE_START, messageId: `${request.runId}:assistant`, role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: `${request.runId}:assistant`, delta: '这是不需要任何 UI 组件的普通文本回答。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: `${request.runId}:assistant` }
    );
  }

  events.push({ type: EventType.RUN_FINISHED, threadId: request.threadId, runId: request.runId });
  return sseResponse(events);
};

const unifiedSession = useAgentChat({
  source: '/api/stream/chat',
  conversationId: 'e2e:unified-chat',
  components: {
    weather_card: {
      component: HarnessWeatherCard,
      description: '展示天气结果',
      propsSchema: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          temperature: { type: 'number' },
          condition: { type: 'string' },
          humidity: { type: 'number' },
          windSpeed: { type: 'number' }
        },
        required: ['city', 'temperature', 'condition', 'humidity', 'windSpeed'],
        additionalProperties: false
      }
    }
  },
  transport: { fetch: unifiedFetch }
});

const lastClientEnvelope = ref<A2UiClientEnvelope | null>(null);
const actionStateHistory = ref<A2UiActionStateSnapshot[]>([]);

function recordActionState(snapshot: A2UiActionStateSnapshot) {
  actionStateHistory.value.push(snapshot);
}

async function sendClientMessage(envelope: A2UiClientEnvelope) {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 600));
  lastClientEnvelope.value = envelope;
  if (!envelope.message || !('action' in envelope.message)) return;

  const { action } = envelope.message;
  if (action.name === 'plan_submitted') {
    const context = action.context ?? {};
    submittedPlan = {
      name: typeof context.name === 'string' ? context.name : defaultPlan.name,
      reminder: typeof context.reminder === 'boolean' ? context.reminder : defaultPlan.reminder,
      topics: Array.isArray(context.topics)
        ? context.topics.filter((value): value is string => typeof value === 'string')
        : defaultPlan.topics,
      minutes: typeof context.minutes === 'number' ? context.minutes : defaultPlan.minutes,
      date: typeof context.date === 'string' ? context.date : defaultPlan.date
    };
    a2uiMessages.value = submittedMessages(submittedPlan);
    return;
  }

  if (action.name === 'plan_edit_requested') {
    a2uiMessages.value = editableMessages(submittedPlan);
  }
}
</script>

<template>
  <main class="harness">
    <h1>Agentdown Production Browser Harness</h1>

    <section data-testid="html-security">
      <MarkdownRenderer :source="maliciousMarkdown" allow-unsafe-html />
    </section>

    <section data-testid="runtime-stream">
      <h2>Runtime Stream</h2>
      <button type="button" :disabled="streaming" @click="startStreaming">
        {{ streaming ? '输出中…' : '开始流式输出' }}
      </button>
      <RunSurface :runtime="runtime" empty-text="尚未开始" />
    </section>

    <section data-testid="a2ui-surface">
      <A2UiSurface
        surface-id="production-form"
        :messages="a2uiMessages"
        :send-client-message="sendClientMessage"
        @action-state-change="recordActionState"
      />
      <pre data-testid="action-state-history">{{ JSON.stringify(actionStateHistory) }}</pre>
      <pre data-testid="client-envelope">{{ lastClientEnvelope ? JSON.stringify(lastClientEnvelope.message) : '' }}</pre>
    </section>

    <section data-testid="readonly-weather">
      <h2>Read-only A2UI</h2>
      <A2UiSurface
        surface-id="readonly-weather"
        :messages="readonlyWeatherMessages"
      />
    </section>

    <section data-testid="unified-chat">
      <h2>Unified Chat</h2>
      <div class="unified-actions">
        <button type="button" @click="unifiedSession.send('text')">统一流：文本</button>
        <button type="button" @click="unifiedSession.send('weather')">统一流：天气组件</button>
        <button type="button" @click="unifiedSession.send('a2ui')">统一流：动态 A2UI</button>
      </div>
      <RunSurface :runtime="unifiedSession.runtime" v-bind="unifiedSession.surface.value" />
      <output data-testid="unified-thread-ids">{{ unifiedRequestThreadIds.join(',') }}</output>
    </section>
  </main>
</template>

<style scoped>
.harness { display: grid; gap: 2rem; width: min(900px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 5rem; }
.harness > section { padding: 1.25rem; border: 1px solid #d8dee9; border-radius: 1rem; background: #fff; }
button { font: inherit; }
pre { overflow: auto; white-space: pre-wrap; }
.unified-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
</style>
