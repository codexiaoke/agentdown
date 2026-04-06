import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions, TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport } from '../shared/jsonSseTransportFactory';
import type { AutoGenEvent } from './types';

/**
 * AutoGen 请求体里最常见的 JSON 结构。
 */
export interface AutoGenRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
}

/**
 * AutoGen SSE transport 的快捷配置。
 */
export interface AutoGenSseTransportOptions<
  TSource = FetchTransportSource
> extends Omit<JsonSseTransportOptions<AutoGenEvent, TSource, AutoGenRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 AutoGen 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, AutoGenRequestBody>, 'body'>;
}

/**
 * 创建一个更贴近 AutoGen backend 请求习惯的 SSE transport。
 */
export function createAutoGenSseTransport<
  TSource = FetchTransportSource
>(options: AutoGenSseTransportOptions<TSource> = {}) {
  return createFrameworkJsonSseTransport<AutoGenEvent, TSource, AutoGenRequestBody, AutoGenSseTransportOptions<TSource>>({
    options
  });
}
