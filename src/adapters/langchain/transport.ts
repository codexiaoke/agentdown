import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions, TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport } from '../shared/jsonSseTransportFactory';
import type { LangChainEvent } from './types';
import type { LangChainHumanDecision } from './types';

/**
 * 继续一个已暂停的 LangChain HITL interrupt 时使用的请求体结构。
 */
export interface LangChainResumeRequestBody extends RuntimeData {
  /** 当前 interrupt batch 对应的人工决策列表。 */
  decisions: LangChainHumanDecision[];
}

/**
 * LangChain 请求体里最常见的 JSON 结构。
 */
export interface LangChainRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
  /** 当前要继续沿用的后端 thread / session id。 */
  session_id?: string;
  /** LangChain backend 的运行模式，例如 `hitl`。 */
  mode?: string;
  /** 使用同一个 `/api/stream/langchain` 继续已暂停 interrupt 的载荷。 */
  langchain_resume?: LangChainResumeRequestBody;
}

/**
 * LangChain SSE transport 的快捷配置。
 *
 * 这个 helper 默认假设后端接的是：
 * - `POST`
 * - `Content-Type: application/json`
 * - `{ message: string }`
 */
export interface LangChainSseTransportOptions<
  TSource = FetchTransportSource
> extends Omit<JsonSseTransportOptions<LangChainEvent, TSource, LangChainRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 LangChain 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, LangChainRequestBody>, 'body'>;
}

/**
 * 创建一个更贴近 LangChain backend 请求习惯的 SSE transport。
 */
export function createLangChainSseTransport<
  TSource = FetchTransportSource
>(options: LangChainSseTransportOptions<TSource> = {}) {
  return createFrameworkJsonSseTransport<LangChainEvent, TSource, LangChainRequestBody, LangChainSseTransportOptions<TSource>>({
    options
  });
}
