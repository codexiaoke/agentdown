import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions, TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport } from '../shared/jsonSseTransportFactory';
import type { SpringAiEvent, SpringAiHumanDecision } from './types';

/**
 * 继续一个已暂停的 Spring AI HITL interrupt 时使用的请求体结构。
 */
export interface SpringAiResumeRequestBody extends RuntimeData {
  /** 当前 interrupt batch 对应的人工决策列表。 */
  decisions: SpringAiHumanDecision[];
}

/**
 * Spring AI 请求体里最常见的 JSON 结构。
 */
export interface SpringAiRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
  /** 当前要继续沿用的后端 session id。 */
  session_id?: string;
  /** Spring AI backend 的运行模式，例如 `hitl`。 */
  mode?: string;
  /** 使用同一个 `/api/stream/springai` 继续已暂停 approval 的载荷。 */
  springai_resume?: SpringAiResumeRequestBody;
}

/**
 * Spring AI SSE transport 的快捷配置。
 */
export interface SpringAiSseTransportOptions<
  TSource = FetchTransportSource
> extends Omit<JsonSseTransportOptions<SpringAiEvent, TSource, SpringAiRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 Spring AI 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, SpringAiRequestBody>, 'body'>;
}

/**
 * 创建一个更贴近 Spring AI backend 请求习惯的 SSE transport。
 */
export function createSpringAiSseTransport<
  TSource = FetchTransportSource
>(options: SpringAiSseTransportOptions<TSource> = {}) {
  return createFrameworkJsonSseTransport<SpringAiEvent, TSource, SpringAiRequestBody, SpringAiSseTransportOptions<TSource>>({
    options
  });
}
