<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  cmd,
  RunSurface,
  useSse
} from '../../index';
import { weatherRunPreset, type WeatherSsePayload } from '../presets/weatherPreset';

const RUN_ID = 'run:weather';
const TOOL_ID = 'tool-1';
const STREAM_ID = 'stream:weather:answer';
const USER_GROUP_ID = 'turn:user:weather';
const ASSISTANT_GROUP_ID = 'turn:weather';
const DEMO_SOURCE = '/demo/weather.sse';
const DEMO_HEADERS = {
  Authorization: 'Bearer demo-agent-token',
  'X-Agentdown-Demo': 'weather'
};
const DEMO_REQUEST = {
  city: '北京',
  dateLabel: '今天',
  message: '帮我查一下北京今天天气'
};
const { runtime, bridge, surface } = weatherRunPreset.createSession();

/**
 * mock SSE 请求里会用到的业务入参。
 */
interface WeatherDemoRequest {
  city: string;
  dateLabel: string;
  message: string;
}

/**
 * 把一个 packet 编码成标准 SSE 文本片段。
 */
function encodeSsePacket(payload: WeatherSsePayload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * 根据页面输入构造整组天气查询 demo packet。
 */
function buildDemoPackets(input: WeatherDemoRequest): WeatherSsePayload[] {
  return [
    {
      event: 'RunStarted',
      runId: RUN_ID,
      title: '天气助手'
    },
    {
      event: 'ContentOpen',
      streamId: STREAM_ID,
      slot: 'main',
      groupId: ASSISTANT_GROUP_ID
    },
    {
      event: 'ContentDelta',
      streamId: STREAM_ID,
      text: `我来为你查询${input.city}${input.dateLabel}天气`
    },
    {
      event: 'ToolCall',
      name: '查询天气',
      id: TOOL_ID
    },
    {
      event: 'ToolCompleted',
      name: '查询天气',
      id: TOOL_ID,
      content: {
        city: input.city,
        condition: '晴',
        tempC: 26,
        humidity: '42%'
      }
    },
    {
      event: 'ContentClose',
      streamId: STREAM_ID
    },
    {
      event: 'RunCompleted',
      runId: RUN_ID
    }
  ];
}

/**
 * 从 fetch init.body 中解析出当前 demo 请求参数。
 */
function parseRequestBody(init?: RequestInit): WeatherDemoRequest {
  if (!init?.body || typeof init.body !== 'string') {
    return DEMO_REQUEST;
  }

  try {
    const parsed = JSON.parse(init.body) as Partial<WeatherDemoRequest>;

    return {
      city: parsed.city ?? DEMO_REQUEST.city,
      dateLabel: parsed.dateLabel ?? DEMO_REQUEST.dateLabel,
      message: parsed.message ?? DEMO_REQUEST.message
    };
  } catch {
    return DEMO_REQUEST;
  }
}

// 用一个本地 mock fetch 把 POST SSE 请求包成真正的响应流。
// 这样页面里可以直接演示 useSse({ request: { body, headers } }) 怎么接到 Agentdown。
/**
 * 创建一个本地 mock SSE fetch，用来模拟后端按时间推送事件。
 */
function createMockSseFetch(intervalMs: number): typeof fetch {
  return async (_source: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    if (headers.get('Authorization') !== DEMO_HEADERS.Authorization) {
      return new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized'
      });
    }

    const encoder = new TextEncoder();
    const signal = init?.signal;
    const payloads = buildDemoPackets(parseRequestBody(init));
    const timers: number[] = [];
    let abortListener: (() => void) | undefined;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        /**
         * 清理当前响应流里已注册的所有定时器。
         */
        const cleanup = () => {
          while (timers.length > 0) {
            const timerId = timers.pop();

            if (timerId !== undefined) {
              globalThis.clearTimeout(timerId);
            }
          }
        };

        /**
         * 安全关闭当前 mock SSE stream。
         */
        const closeStream = () => {
          if (closed) {
            return;
          }

          closed = true;
          controller.close();
        };

        abortListener = () => {
          cleanup();
          closeStream();
        };

        if (signal?.aborted) {
          abortListener();
          return;
        }

        signal?.addEventListener('abort', abortListener, { once: true });

        payloads.forEach((payload, index) => {
          const timerId = globalThis.setTimeout(() => {
            if (signal?.aborted) {
              return;
            }

            controller.enqueue(encoder.encode(encodeSsePacket(payload)));

            if (index === payloads.length - 1) {
              closeStream();
            }
          }, intervalMs * (index + 1));

          timers.push(timerId);
        });
      },
      cancel() {
        abortListener?.();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream'
      }
    });
  };
}

const {
  connect,
  abort,
  status
} = useSse<WeatherSsePayload>({
  source: DEMO_SOURCE,
  keepMessages: 12,
  mode: 'json',
  fetch: createMockSseFetch(650),
  onMessage(packet) {
    bridge.push(packet);
  },
  onComplete() {
    bridge.flush('demo-complete');
  },
  autoStart: false
});

const playing = computed(() => status.value === 'connecting' || status.value === 'streaming');

/**
 * 预先插入一条用户提问，模拟真实聊天开场。
 */
function seedConversation(input: WeatherDemoRequest) {
  const now = Date.now();

  runtime.apply(cmd.message.text({
    id: 'block:user:weather',
    role: 'user',
    text: input.message,
    groupId: USER_GROUP_ID,
    at: now
  }));
}

/**
 * 重置 demo 并重新发起一轮天气 SSE 请求。
 */
async function replayDemo() {
  abort();
  bridge.reset();
  seedConversation(DEMO_REQUEST);
  await connect(undefined, {
    request: {
      method: 'POST',
      headers: DEMO_HEADERS,
      body: DEMO_REQUEST
    }
  });
}

onMounted(() => {
  replayDemo().catch(() => {
    // demo 页面里失败只需要安静结束，不需要额外抛错打断界面。
  });
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>天气对话</h1>
      <p>这个示例直接用通用 useSse 发起一个带 body 和 headers 的 POST SSE 请求，收到 packet 后再推给 Agentdown runtime。</p>
      <div class="demo-request-meta">
        <span>POST</span>
        <span>{{ DEMO_REQUEST.city }}</span>
        <span>{{ DEMO_REQUEST.dateLabel }}</span>
        <span>{{ DEMO_HEADERS.Authorization }}</span>
      </div>
    </header>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />

    <button
      v-if="!playing"
      type="button"
      class="demo-page__replay"
      @click="replayDemo().catch(() => {})"
    >
      重播
    </button>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 44px 24px 80px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 28px;
}

.demo-page__header h1,
.demo-page__header p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 28px;
  letter-spacing: -0.05em;
}

.demo-page__header p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.demo-request-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.demo-request-meta span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2f7;
  color: #475569;
  font-size: 12px;
}

.demo-page__replay {
  margin-top: 24px;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e8eef7;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }
}
</style>
