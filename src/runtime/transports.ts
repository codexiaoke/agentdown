import type { TransportAdapter } from './types';
import { toArray, toAsyncIterable } from './utils';

/**
 * 支持同步或异步返回值的工具类型。
 */
export type TransportAwaitable<T> = T | Promise<T>;

/**
 * 支持直接传值或按 source 延迟求值的 transport 配置值。
 */
export type TransportResolvable<TSource, TValue> =
  TValue | ((source: TSource) => TransportAwaitable<TValue>);

/**
 * fetch 类 transport 支持的输入源类型。
 */
export type FetchTransportSource = RequestInfo | URL;

/**
 * WebSocket transport 支持的输入源描述。
 */
export type WebSocketTransportSource =
  | string
  | URL
  | {
      url: string | URL;
      protocols?: string | string[];
    };

/**
 * SSE transport 的内置解析模式。
 */
export type SseTransportMode = 'event' | 'json' | 'text';

/**
 * NDJSON transport 的内置解析模式。
 */
export type NdjsonTransportMode = 'json' | 'text';

/**
 * WebSocket transport 的内置解析模式。
 */
export type WebSocketTransportMode = 'event' | 'json' | 'text';

/**
 * 标准 SSE message 结构。
 */
export interface SseTransportMessage {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

/**
 * SSE parser 执行时的上下文信息。
 */
export interface SseTransportContext<TSource = FetchTransportSource> {
  source: TSource;
}

/**
 * NDJSON parser 执行时的上下文信息。
 */
export interface NdjsonTransportContext<TSource = FetchTransportSource> {
  source: TSource;
  lineNumber: number;
}

/**
 * WebSocket message 的原始封装。
 */
export interface WebSocketTransportMessage {
  data: unknown;
  raw: MessageEvent;
}

/**
 * WebSocket parser / onOpen 执行时的上下文信息。
 */
export interface WebSocketTransportContext<TSource = WebSocketTransportSource> {
  source: TSource;
  socket: WebSocket;
}

/**
 * SSE transport 的配置项。
 */
export interface SseTransportOptions<
  TPacket = SseTransportMessage,
  TSource = FetchTransportSource
> {
  mode?: SseTransportMode;
  fetch?: typeof fetch;
  init?: RequestInit | ((source: TSource) => TransportAwaitable<RequestInit | undefined>);
  parse?: (
    message: SseTransportMessage,
    context: SseTransportContext<TSource>
  ) => TransportAwaitable<TPacket | TPacket[] | null | void>;
}

/**
 * 更贴近“请求 JSON SSE 接口”这一业务语义的请求描述。
 *
 * 它会自动处理：
 * - 普通对象 body 的 `JSON.stringify`
 * - 缺省 `Content-Type: application/json`
 * - 如果传了 body 但没显式写 method，则默认使用 `POST`
 */
export interface JsonRequestOptions<
  TSource = FetchTransportSource,
  TBody = BodyInit | Record<string, unknown>
> {
  /** 请求方法，可直接传值，也可按 source 动态生成。 */
  method?: TransportResolvable<TSource, string | undefined>;
  /** 请求头，可直接传值，也可按 source 动态生成。 */
  headers?: TransportResolvable<TSource, HeadersInit | undefined>;
  /** 请求体，可直接传值，也可按 source 动态生成。 */
  body?: TransportResolvable<TSource, TBody | undefined>;
}

/**
 * “请求 JSON SSE 接口” 的 transport 配置。
 *
 * 和 `createSseTransport({ mode: 'json', init })` 相比，
 * 这里更适合常见的 POST JSON body 场景。
 */
export interface JsonSseTransportOptions<
  TPacket = unknown,
  TSource = FetchTransportSource,
  TBody = BodyInit | Record<string, unknown>
> extends Omit<SseTransportOptions<TPacket, TSource>, 'mode' | 'init'> {
  /** 更贴近业务语义的请求描述。 */
  request?: JsonRequestOptions<TSource, TBody>;
  /** 仍然允许叠加一个原始 RequestInit 或工厂函数。 */
  init?: SseTransportOptions<TPacket, TSource>['init'];
}

/**
 * NDJSON transport 的配置项。
 */
export interface NdjsonTransportOptions<
  TPacket = unknown,
  TSource = FetchTransportSource
> {
  mode?: NdjsonTransportMode;
  fetch?: typeof fetch;
  init?: RequestInit | ((source: TSource) => TransportAwaitable<RequestInit | undefined>);
  parse?: (
    line: string,
    context: NdjsonTransportContext<TSource>
  ) => TransportAwaitable<TPacket | TPacket[] | null | void>;
}

/**
 * WebSocket transport 的配置项。
 */
export interface WebSocketTransportOptions<
  TPacket = WebSocketTransportMessage,
  TSource = WebSocketTransportSource
> {
  mode?: WebSocketTransportMode;
  WebSocket?: typeof WebSocket;
  protocols?: string | string[] | ((source: TSource) => TransportAwaitable<string | string[] | undefined>);
  binaryType?: BinaryType;
  onOpen?: (context: WebSocketTransportContext<TSource>) => TransportAwaitable<void>;
  parse?: (
    message: WebSocketTransportMessage,
    context: WebSocketTransportContext<TSource>
  ) => TransportAwaitable<TPacket | TPacket[] | null | void>;
}

/**
 * 用于把事件监听转换成 async iterator 的轻量队列接口。
 */
interface AsyncQueue<T> {
  push(item: T): void;
  end(): void;
  fail(error: unknown): void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

/**
 * 解析 fetch 实现，优先使用显式传入的 fetch。
 */
function resolveFetcher(fetcher?: typeof fetch): typeof fetch {
  if (fetcher) {
    return fetcher;
  }

  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }

  throw new Error('Fetch API is not available. Please pass `fetch` explicitly in transport options.');
}

/**
 * 统一解析 RequestInit，兼容对象和工厂函数两种写法。
 */
async function resolveRequestInit<TSource>(
  init: RequestInit | ((source: TSource) => TransportAwaitable<RequestInit | undefined>) | undefined,
  source: TSource
): Promise<RequestInit | undefined> {
  if (!init) {
    return undefined;
  }

  if (typeof init === 'function') {
    return init(source);
  }

  return init;
}

/**
 * 判断一组 headers 是否已经是原生 `Headers` 实例。
 */
function isHeaders(value: HeadersInit | undefined): value is Headers {
  return typeof Headers !== 'undefined' && value instanceof Headers;
}

/**
 * 合并多份 headers，后面的值覆盖前面的值。
 */
function mergeRequestHeaders(...values: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (isHeaders(value)) {
      value.forEach((headerValue, key) => {
        headers.set(key, headerValue);
      });
      continue;
    }

    if (Array.isArray(value)) {
      for (const [key, headerValue] of value) {
        headers.set(key, headerValue);
      }
      continue;
    }

    Object.entries(value).forEach(([key, headerValue]) => {
      if (headerValue !== undefined) {
        headers.set(key, String(headerValue));
      }
    });
  }

  return headers;
}

/**
 * 判断 body 是否是需要自动 JSON.stringify 的普通对象。
 */
function isJsonRecordRequestBody(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  if (value instanceof FormData || value instanceof URLSearchParams || value instanceof Blob) {
    return false;
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return false;
  }

  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
    return false;
  }

  return true;
}

/**
 * 解析一个可直接传值或按 source 计算的配置项。
 */
async function resolveResolvableValue<TSource, TValue>(
  source: TSource,
  value: TransportResolvable<TSource, TValue> | undefined
): Promise<TValue | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (source: TSource) => TransportAwaitable<TValue>)(source);
  }

  return value;
}

/**
 * 把更贴近业务语义的 JSON 请求描述，统一转换成 `transport.init`。
 *
 * 这样：
 * - `useSse()`
 * - `useSseBridge()`
 * - `createJsonSseTransport()`
 *
 * 都能共用同一套请求拼装规则。
 */
export function createJsonRequestInitResolver<
  TSource = FetchTransportSource,
  TBody = BodyInit | Record<string, unknown>
>(
  request?: JsonRequestOptions<TSource, TBody>,
  baseInit?: SseTransportOptions<unknown, TSource>['init']
): SseTransportOptions<unknown, TSource>['init'] | undefined {
  if (!request && !baseInit) {
    return undefined;
  }

  return async (source: TSource) => {
    const resolvedInit = await resolveRequestInit(baseInit, source);
    const resolvedMethod = await resolveResolvableValue(source, request?.method);
    const resolvedHeaders = await resolveResolvableValue(source, request?.headers);
    const resolvedBody = await resolveResolvableValue(source, request?.body);
    const headers = mergeRequestHeaders(resolvedInit?.headers, resolvedHeaders);
    let body: BodyInit | undefined = resolvedBody as BodyInit | undefined;

    if (resolvedBody !== undefined && isJsonRecordRequestBody(resolvedBody)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      body = JSON.stringify(resolvedBody);
    }

    const mergedMethod = resolvedMethod
      ?? resolvedInit?.method
      ?? (body !== undefined ? 'POST' : undefined);

    return {
      ...resolvedInit,
      ...(mergedMethod !== undefined ? { method: mergedMethod } : {}),
      ...(headers.keys().next().done ? {} : { headers }),
      ...(body !== undefined ? { body: body as BodyInit } : {})
    };
  };
}

/**
 * 发起 transport 对应的 fetch 请求，并验证返回体可读。
 */
async function openResponse<TSource>(
  source: TSource,
  options: {
    fetch?: typeof fetch;
    init?: RequestInit | ((source: TSource) => TransportAwaitable<RequestInit | undefined>);
  },
  signal?: AbortSignal
): Promise<Response> {
  const fetcher = resolveFetcher(options.fetch);
  const resolvedInit = await resolveRequestInit(options.init, source);
  const init = signal
    ? {
        ...resolvedInit,
        signal
      }
    : resolvedInit;
  const response = await fetcher(source as FetchTransportSource, init);

  if (!response.ok) {
    throw new Error(`Transport request failed with ${response.status} ${response.statusText}.`);
  }

  if (!response.body) {
    throw new Error('Transport response does not contain a readable body.');
  }

  return response;
}

/**
 * 解析 WebSocket 构造器，优先使用显式传入的实现。
 */
function resolveWebSocketConstructor(WebSocketCtor?: typeof WebSocket): typeof WebSocket {
  if (WebSocketCtor) {
    return WebSocketCtor;
  }

  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket;
  }

  throw new Error('WebSocket API is not available. Please pass `WebSocket` explicitly in transport options.');
}

/**
 * 统一解析 WebSocket protocols 配置。
 */
async function resolveWebSocketProtocols<TSource>(
  source: TSource,
  protocols:
    | string
    | string[]
    | ((source: TSource) => TransportAwaitable<string | string[] | undefined>)
    | undefined
): Promise<string | string[] | undefined> {
  if (!protocols) {
    return undefined;
  }

  if (typeof protocols === 'function') {
    return protocols(source);
  }

  return protocols;
}

/**
 * 把多种 WebSocket source 形式规范化成最终连接地址。
 */
async function resolveWebSocketEndpoint<TSource = WebSocketTransportSource>(
  source: TSource,
  protocols:
    | string
    | string[]
    | ((source: TSource) => TransportAwaitable<string | string[] | undefined>)
    | undefined
): Promise<{
  url: string;
  protocols?: string | string[];
}> {
  if (typeof source === 'string' || source instanceof URL) {
    const resolvedProtocols = await resolveWebSocketProtocols(source, protocols);

    return {
      url: String(source),
      ...(resolvedProtocols ? { protocols: resolvedProtocols } : {})
    };
  }

  const sourceConfig = source as Extract<WebSocketTransportSource, { url: string | URL }>;
  const resolvedProtocols = await resolveWebSocketProtocols(source, protocols ?? sourceConfig.protocols);

  return {
    url: String(sourceConfig.url),
    ...(resolvedProtocols ? { protocols: resolvedProtocols } : {})
  };
}

/**
 * 创建一个可由 push / end / fail 驱动的 async queue。
 */
function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let ended = false;
  let failure: unknown;

  /**
   * 尽可能把积压的值或错误分发给等待中的消费者。
   */
  function flushWaiters() {
    while (waiters.length > 0) {
      const waiter = waiters.shift();

      if (!waiter) {
        break;
      }

      if (failure !== undefined) {
        waiter.reject(failure);
        continue;
      }

      const nextValue = values.shift();

      if (nextValue !== undefined) {
        waiter.resolve({
          value: nextValue,
          done: false
        });
        continue;
      }

      if (ended) {
        waiter.resolve({
          value: undefined as T,
          done: true
        });
      } else {
        waiters.unshift(waiter);
        break;
      }
    }
  }

  return {
    push(item) {
      if (ended || failure !== undefined) {
        return;
      }

      values.push(item);
      flushWaiters();
    },
    end() {
      if (ended || failure !== undefined) {
        return;
      }

      ended = true;
      flushWaiters();
    },
    fail(error) {
      if (ended || failure !== undefined) {
        return;
      }

      failure = error;
      flushWaiters();
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (failure !== undefined) {
            return Promise.reject(failure);
          }

          const nextValue = values.shift();

          if (nextValue !== undefined) {
            return Promise.resolve({
              value: nextValue,
              done: false
            });
          }

          if (ended) {
            return Promise.resolve({
              value: undefined as T,
              done: true
            });
          }

          return new Promise<IteratorResult<T>>((resolve, reject) => {
            waiters.push({ resolve, reject });
          });
        }
      };
    }
  };
}

/**
 * 把 ReadableStream<Uint8Array> 统一拆成文本行。
 * SSE 和 NDJSON 都建立在线分隔之上，所以先共享这层读取器。
 */
async function* readTextLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n');
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        yield segment.endsWith('\r') ? segment.slice(0, -1) : segment;
      }
    }

    buffer += decoder.decode();

    if (buffer.length > 0) {
      yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 使用内置模式解析一条 SSE message。
 */
function defaultSseParser<TPacket>(
  mode: SseTransportMode,
  message: SseTransportMessage
): TPacket | TPacket[] | null | void {
  switch (mode) {
    case 'json':
      return JSON.parse(message.data) as TPacket;
    case 'text':
      return message.data as TPacket;
    case 'event':
    default:
      return message as TPacket;
  }
}

/**
 * 使用内置模式解析一行 NDJSON。
 */
function defaultNdjsonParser<TPacket>(mode: NdjsonTransportMode, line: string): TPacket | TPacket[] | null | void {
  if (mode === 'text') {
    return line as TPacket;
  }

  return JSON.parse(line) as TPacket;
}

/**
 * 把 WebSocket 的各种二进制或文本数据统一解码为字符串。
 */
async function readWebSocketDataAsText(data: unknown): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof Blob) {
    return data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  throw new Error('WebSocket message data is not text-decodable.');
}

/**
 * 使用内置模式解析一条 WebSocket message。
 */
async function defaultWebSocketParser<TPacket>(
  mode: WebSocketTransportMode,
  message: WebSocketTransportMessage
): Promise<TPacket | TPacket[] | null | void> {
  switch (mode) {
    case 'json':
      return JSON.parse(await readWebSocketDataAsText(message.data)) as TPacket;
    case 'text':
      return await readWebSocketDataAsText(message.data) as TPacket;
    case 'event':
    default:
      return message as TPacket;
  }
}

/**
 * 适合直接消费已经是 iterable 的输入源，例如本地 mock 数据或手写 async generator。
 */
export function createAsyncIterableTransport<TPacket>(): TransportAdapter<AsyncIterable<TPacket> | Iterable<TPacket>, TPacket> {
  return {
    async *connect(source) {
      yield* toAsyncIterable(source);
    }
  };
}

/**
 * 从 fetch 响应里解析标准 SSE 文本流。
 * 默认返回完整 SSE message；也可以切成 text / json，或者交给自定义 parse。
 */
export function createSseTransport<
  TPacket = SseTransportMessage,
  TSource = FetchTransportSource
>(
  options: SseTransportOptions<TPacket, TSource> = {}
): TransportAdapter<TSource, TPacket> {
  const mode = options.mode ?? 'event';

  return {
    async *connect(source, context) {
      const response = await openResponse(source, options, context.signal);
      const body = response.body;
      const signal = context.signal;
      let currentEvent = '';
      let currentId: string | undefined;
      let currentRetry: number | undefined;
      const dataLines: string[] = [];
      let hasEventFields = false;

      /**
       * 在遇到空行或流结束时，把当前缓存的 SSE 字段产出为一条消息。
       */
      const flushEvent = async function* (): AsyncIterable<TPacket> {
        if (!hasEventFields) {
          return;
        }

        const message: SseTransportMessage = {
          data: dataLines.join('\n'),
          ...(currentEvent ? { event: currentEvent } : {}),
          ...(currentId !== undefined ? { id: currentId } : {}),
          ...(currentRetry !== undefined ? { retry: currentRetry } : {})
        };

        const packets = options.parse
          ? await options.parse(message, { source })
          : defaultSseParser<TPacket>(mode, message);

        for (const packet of toArray(packets)) {
          yield packet;
        }

        currentEvent = '';
        currentId = undefined;
        currentRetry = undefined;
        dataLines.length = 0;
        hasEventFields = false;
      };

      if (!body) {
        throw new Error('Transport response does not contain a readable body.');
      }

      for await (const line of readTextLines(body)) {
        if (signal.aborted) {
          break;
        }

        if (line.length === 0) {
          yield* flushEvent();
          continue;
        }

        if (line.startsWith(':')) {
          continue;
        }

        const separatorIndex = line.indexOf(':');
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
        const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
        hasEventFields = true;

        switch (field) {
          case 'data':
            dataLines.push(value);
            break;
          case 'event':
            currentEvent = value;
            break;
          case 'id':
            currentId = value;
            break;
          case 'retry':
            if (/^\d+$/.test(value)) {
              currentRetry = Number(value);
            }
            break;
          default:
            break;
        }
      }

      yield* flushEvent();
    }
  };
}

/**
 * 更适合“请求 JSON SSE 接口”的快捷 transport。
 *
 * 相比直接手写：
 *
 * ```ts
 * createSseTransport({
 *   mode: 'json',
 *   init() {
 *     return {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ message: 'hello' })
 *     };
 *   }
 * })
 * ```
 *
 * 这里可以直接写：
 *
 * ```ts
 * createJsonSseTransport({
 *   request: {
 *     body: { message: 'hello' }
 *   }
 * })
 * ```
 */
export function createJsonSseTransport<
  TPacket = unknown,
  TSource = FetchTransportSource,
  TBody = BodyInit | Record<string, unknown>
>(
  options: JsonSseTransportOptions<TPacket, TSource, TBody> = {}
): TransportAdapter<TSource, TPacket> {
  const init = createJsonRequestInitResolver(options.request, options.init);

  return createSseTransport<TPacket, TSource>({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.parse ? { parse: options.parse } : {}),
    mode: 'json',
    ...(init ? { init } : {})
  });
}

/**
 * 从 fetch 响应里解析 NDJSON。
 * 默认每一行都走 JSON.parse，也可以切成 text 或交给自定义 parse。
 */
export function createNdjsonTransport<
  TPacket = unknown,
  TSource = FetchTransportSource
>(
  options: NdjsonTransportOptions<TPacket, TSource> = {}
): TransportAdapter<TSource, TPacket> {
  const mode = options.mode ?? 'json';

  return {
    async *connect(source, context) {
      const response = await openResponse(source, options, context.signal);
      const body = response.body;
      let lineNumber = 0;

      if (!body) {
        throw new Error('Transport response does not contain a readable body.');
      }

      for await (const line of readTextLines(body)) {
        if (context.signal.aborted) {
          break;
        }

        const trimmed = line.trim();

        if (trimmed.length === 0) {
          continue;
        }

        lineNumber += 1;
        const packets = options.parse
          ? await options.parse(trimmed, { source, lineNumber })
          : defaultNdjsonParser<TPacket>(mode, trimmed);

        for (const packet of toArray(packets)) {
          yield packet;
        }
      }
    }
  };
}

/**
 * 适合直接消费 WebSocket 消息流。
 * 默认支持 event / json / text 三种模式，也可以在 onOpen / parse 里接入自定义握手和解析逻辑。
 */
export function createWebSocketTransport<
  TPacket = WebSocketTransportMessage,
  TSource = WebSocketTransportSource
>(
  options: WebSocketTransportOptions<TPacket, TSource> = {}
): TransportAdapter<TSource, TPacket> {
  const mode = options.mode ?? 'event';

  return {
    async *connect(source, context) {
      const WebSocketCtor = resolveWebSocketConstructor(options.WebSocket);
      const endpoint = await resolveWebSocketEndpoint(source, options.protocols);
      const socket = endpoint.protocols !== undefined
        ? new WebSocketCtor(endpoint.url, endpoint.protocols)
        : new WebSocketCtor(endpoint.url);
      const queue = createAsyncQueue<MessageEvent>();
      const signal = context.signal;

      if (options.binaryType) {
        socket.binaryType = options.binaryType;
      }

      const transportContext: WebSocketTransportContext<TSource> = {
        source,
        socket
      };

      let opened = false;

      /**
       * 连接打开后执行一次可选握手逻辑。
       */
      const handleOpen = async () => {
        opened = true;

        if (options.onOpen) {
          await options.onOpen(transportContext);
        }
      };

      /**
       * 把 message 事件推入异步队列。
       */
      const handleMessage = (event: MessageEvent) => {
        queue.push(event);
      };

      /**
       * 把 close 事件转换成正常结束或错误结束。
       */
      const handleClose = (event: CloseEvent) => {
        if (signal.aborted || event.wasClean || event.code === 1000 || event.code === 1001) {
          queue.end();
          return;
        }

        queue.fail(new Error(`WebSocket closed unexpectedly with code ${event.code}.`));
      };

      /**
       * 把底层 socket error 统一转成队列错误。
       */
      const handleError = () => {
        queue.fail(new Error('WebSocket transport encountered an error.'));
      };

      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', handleClose);
      socket.addEventListener('error', handleError);

      /**
       * 移除当前 transport 绑定的事件监听。
       */
      const cleanup = () => {
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('close', handleClose);
        socket.removeEventListener('error', handleError);
      };

      /**
       * 在外部 signal 中断时结束队列并关闭 socket。
       */
      const abortListener = () => {
        queue.end();

        if (socket.readyState === WebSocketCtor.CONNECTING || socket.readyState === WebSocketCtor.OPEN) {
          socket.close(1000, 'aborted');
        }
      };

      signal.addEventListener('abort', abortListener, { once: true });

      try {
        if (socket.readyState === WebSocketCtor.CONNECTING) {
          await new Promise<void>((resolve, reject) => {
            /**
             * 等待 WebSocket 连接真正打开后继续后续流程。
             */
            const openListener = () => {
              socket.removeEventListener('open', openListener);
              socket.removeEventListener('error', errorListener);
              handleOpen().then(resolve).catch(reject);
            };

            /**
             * 在打开前连接失败时拒绝当前等待。
             */
            const errorListener = () => {
              socket.removeEventListener('open', openListener);
              socket.removeEventListener('error', errorListener);
              reject(new Error('WebSocket connection failed before opening.'));
            };

            socket.addEventListener('open', openListener, { once: true });
            socket.addEventListener('error', errorListener, { once: true });
          });
        } else if (socket.readyState === WebSocketCtor.OPEN && !opened) {
          await handleOpen();
        }

        for await (const event of queue) {
          if (signal.aborted) {
            break;
          }

          const message: WebSocketTransportMessage = {
            data: event.data,
            raw: event
          };
          const packets = options.parse
            ? await options.parse(message, transportContext)
            : await defaultWebSocketParser<TPacket>(mode, message);

          for (const packet of toArray(packets)) {
            yield packet;
          }
        }
      } finally {
        signal.removeEventListener('abort', abortListener);
        cleanup();

        if (socket.readyState === WebSocketCtor.CONNECTING || socket.readyState === WebSocketCtor.OPEN) {
          socket.close(1000, 'completed');
        }
      }
    }
  };
}
