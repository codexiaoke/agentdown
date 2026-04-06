import { createJsonSseTransport, type FetchTransportSource, type JsonRequestOptions, type JsonSseTransportOptions, type TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import type { AgnoEvent } from './types';

/**
 * Agno 请求体里最常见的 JSON 结构。
 */
export interface AgnoRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
}

/**
 * Agno SSE transport 的快捷配置。
 *
 * 这个 helper 默认假设后端接的是：
 * - `POST`
 * - `Content-Type: application/json`
 * - `{ message: string }`
 *
 * 所以前端最常见的场景里只需要写 `message` 即可。
 */
export interface AgnoSseTransportOptions<
  TSource = FetchTransportSource
> extends Omit<JsonSseTransportOptions<AgnoEvent, TSource, AgnoRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 Agno 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, AgnoRequestBody>, 'body'>;
}

/**
 * 解析一个可直接传值或按 source 延迟求值的 Agno 配置项。
 */
async function resolveAgnoValue<TSource, TValue>(
  source: TSource,
  value: TransportResolvable<TSource, TValue> | undefined
): Promise<TValue | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (source: TSource) => Promise<TValue> | TValue)(source);
  }

  return value;
}

/**
 * 创建一个更贴近 Agno backend 请求习惯的 SSE transport。
 *
 * 相比通用写法：
 *
 * ```ts
 * createSseTransport({
 *   mode: 'json',
 *   init() {
 *     return {
 *       method: 'POST',
 *       headers: {
 *         'Content-Type': 'application/json'
 *       },
 *       body: JSON.stringify({
 *         message: '帮我查一下北京天气'
 *       })
 *     };
 *   }
 * })
 * ```
 *
 * 这里可以直接写：
 *
 * ```ts
 * createAgnoSseTransport({
 *   message: '帮我查一下北京天气'
 * })
 * ```
 */
export function createAgnoSseTransport<
  TSource = FetchTransportSource
>(options: AgnoSseTransportOptions<TSource> = {}) {
  return createJsonSseTransport<AgnoEvent, TSource, AgnoRequestBody>({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.parse ? { parse: options.parse } : {}),
    ...(options.init ? { init: options.init } : {}),
    request: {
      method: options.request?.method ?? 'POST',
      ...(options.request?.headers ? { headers: options.request.headers } : {}),
      body: async (source: TSource) => {
        const resolvedBody = await resolveAgnoValue(source, options.body);
        const resolvedMessage = await resolveAgnoValue(source, options.message);

        if (resolvedBody === undefined && resolvedMessage === undefined) {
          return undefined;
        }

        return {
          ...(resolvedBody ?? {}),
          ...(resolvedMessage !== undefined ? { message: resolvedMessage } : {})
        };
      }
    }
  });
}
