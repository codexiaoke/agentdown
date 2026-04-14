import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport, type FrameworkJsonTransportResolvable } from '../shared/jsonSseTransportFactory';
import type { AutoGenEvent } from './types';

/**
 * AutoGen 请求体里最常见的 JSON 结构。
 */
export interface AutoGenRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
  /** 后端运行模式，例如 `hitl`。 */
  mode?: string;
  /** 当前会话真正绑定的后端 sessionId。 */
  session_id?: string;
  /** 继续一个已暂停 AutoGen handoff 时使用的人类回复。 */
  autogen_resume?: AutoGenResumeRequestBody;
}

/**
 * 继续一个已暂停 AutoGen handoff 时使用的请求体。
 */
export interface AutoGenResumeRequestBody extends RuntimeData {
  /** 作为下一条 user turn 送回 AutoGen 的人工回复。 */
  content: string;
}

/**
 * AutoGen SSE transport 的快捷配置。
 */
export interface AutoGenSseTransportOptions<
  TSource = FetchTransportSource,
  TContext = undefined
> extends Omit<JsonSseTransportOptions<AutoGenEvent, TSource, AutoGenRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: FrameworkJsonTransportResolvable<TSource, string | undefined, TContext>;
  /** 需要额外合并到 AutoGen 请求体里的字段。 */
  body?: FrameworkJsonTransportResolvable<TSource, RuntimeData | undefined, TContext>;
  /** 当前请求可选的附加上下文。 */
  resolveContext?: () => TContext | undefined;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, AutoGenRequestBody>, 'body'>;
}

/**
 * 创建一个更贴近 AutoGen backend 请求习惯的 SSE transport。
 */
export function createAutoGenSseTransport<
  TSource = FetchTransportSource,
  TContext = undefined
>(options: AutoGenSseTransportOptions<TSource, TContext> = {}) {
  return createFrameworkJsonSseTransport<AutoGenEvent, TSource, AutoGenRequestBody, TContext, AutoGenSseTransportOptions<TSource, TContext>>({
    options
  });
}
