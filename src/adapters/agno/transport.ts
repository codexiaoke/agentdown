import type { FetchTransportSource, JsonRequestOptions, JsonSseTransportOptions } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import { createFrameworkJsonSseTransport, type FrameworkJsonTransportResolvable } from '../shared/jsonSseTransportFactory';
import type { AgnoEvent } from './types';

/**
 * 继续一个已暂停的 Agno requirement 时使用的请求体结构。
 */
export interface AgnoResumeRequestBody extends RuntimeData {
  /** 要继续的 run id。 */
  run_id: string;
  /** 当前要处理的 requirement id。 */
  requirement_id: string;
  /** 对 requirement 执行的动作。 */
  action: 'approve' | 'reject' | 'submit_input' | 'submit_feedback' | 'submit_external_result';
  /** 拒绝或补充说明时附带的原因。 */
  note?: string;
  /** user_input requirement 提交的字段值。 */
  values?: Record<string, unknown>;
  /** user_feedback requirement 提交的多选结果。 */
  selections?: Record<string, string[]>;
  /** external_execution requirement 提交的外部执行结果。 */
  result?: string;
}

/**
 * Agno 请求体里最常见的 JSON 结构。
 */
export interface AgnoRequestBody extends RuntimeData {
  /** 用户当前输入的问题。 */
  message?: string;
  /** 当前要继续沿用的后端 session id。 */
  session_id?: string;
  /** 当前 end-user id。 */
  user_id?: string;
  /** Agno backend 的运行模式，例如 `hitl`。 */
  mode?: string;
  /** 使用同一个 `/api/stream/agno` 继续已暂停 requirement 的载荷。 */
  agno_resume?: AgnoResumeRequestBody;
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
  TSource = FetchTransportSource,
  TContext = undefined
> extends Omit<JsonSseTransportOptions<AgnoEvent, TSource, AgnoRequestBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: FrameworkJsonTransportResolvable<TSource, string | undefined, TContext>;
  /** 需要额外合并到 Agno 请求体里的字段。 */
  body?: FrameworkJsonTransportResolvable<TSource, RuntimeData | undefined, TContext>;
  /** 当前请求可选的附加上下文。 */
  resolveContext?: () => TContext | undefined;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, AgnoRequestBody>, 'body'>;
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
  TSource = FetchTransportSource,
  TContext = undefined
>(options: AgnoSseTransportOptions<TSource, TContext> = {}) {
  return createFrameworkJsonSseTransport<AgnoEvent, TSource, AgnoRequestBody, TContext, AgnoSseTransportOptions<TSource, TContext>>({
    options
  });
}
