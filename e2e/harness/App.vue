<script setup lang="ts">
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
import { createAgentRuntime } from '../../src/runtime/createAgentRuntime';
import { createBridge } from '../../src/runtime/createBridge';
import type { RuntimeCommand } from '../../src/runtime/types';

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

const runtime = createAgentRuntime();
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

const a2uiMessages: unknown[] = [
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

const lastClientEnvelope = ref<A2UiClientEnvelope | null>(null);
const actionStateHistory = ref<A2UiActionStateSnapshot[]>([]);

function recordActionState(snapshot: A2UiActionStateSnapshot) {
  actionStateHistory.value.push(snapshot);
}

async function sendClientMessage(envelope: A2UiClientEnvelope) {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 600));
  lastClientEnvelope.value = envelope;
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
  </main>
</template>

<style scoped>
.harness { display: grid; gap: 2rem; width: min(900px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 5rem; }
.harness > section { padding: 1.25rem; border: 1px solid #d8dee9; border-radius: 1rem; background: #fff; }
button { font: inherit; }
pre { overflow: auto; white-space: pre-wrap; }
</style>
