import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions, TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport } from '../shared/jsonSseTransportFactory';
import { parseCrewAISseMessage } from './packet';
import type { CrewAIEvent } from './types';

/**
 * CrewAI 请求体里最常见的 JSON 结构。
 */
export interface CrewAIRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
}

/**
 * CrewAI SSE transport 的快捷配置。
 */
export interface CrewAISseTransportOptions<
  TSource = FetchTransportSource
> extends Omit<JsonSseTransportOptions<CrewAIEvent, TSource, CrewAIRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 CrewAI 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, CrewAIRequestBody>, 'body'>;
}

/**
 * 创建一个更贴近 CrewAI backend 请求习惯的 SSE transport。
 *
 * 默认会自动套上 `parseCrewAISseMessage()`，这样显式 `event:` 名称也能被保留下来。
 */
export function createCrewAISseTransport<
  TSource = FetchTransportSource
>(options: CrewAISseTransportOptions<TSource> = {}) {
  return createFrameworkJsonSseTransport<CrewAIEvent, TSource, CrewAIRequestBody, CrewAISseTransportOptions<TSource>>({
    options,
    parse: parseCrewAISseMessage
  });
}
