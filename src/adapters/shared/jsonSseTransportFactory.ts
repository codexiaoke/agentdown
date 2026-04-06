import { createJsonSseTransport, type FetchTransportSource, type JsonRequestOptions, type JsonSseTransportOptions, type TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';

/**
 * 四套官方 SSE helper 共享的最小 transport 配置结构。
 */
export interface FrameworkJsonSseTransportOptionsLike<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData
> extends Omit<JsonSseTransportOptions<TRawPacket, TSource, TBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: TransportResolvable<TSource, string | undefined>;
  /** 需要额外合并到 JSON 请求体里的字段。 */
  body?: TransportResolvable<TSource, RuntimeData | undefined>;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, TBody>, 'body'>;
}

/**
 * 创建共享 JSON SSE transport 时需要的附加默认值。
 */
export interface CreateFrameworkJsonSseTransportOptions<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData,
  TOptions extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody> = FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody>
> {
  /** 当前框架传入的 transport options。 */
  options: TOptions;
  /** 框架默认的 SSE parser。 */
  parse?: JsonSseTransportOptions<TRawPacket, TSource, TBody>['parse'];
}

/**
 * 解析一个可直接传值或按 source 延迟求值的 transport 配置项。
 */
async function resolveFrameworkTransportValue<TSource, TValue>(
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
 * 创建一个共享的 JSON SSE transport helper。
 */
export function createFrameworkJsonSseTransport<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData,
  TOptions extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody> = FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody>
>(
  config: CreateFrameworkJsonSseTransportOptions<TRawPacket, TSource, TBody, TOptions>
 ) {
  return createJsonSseTransport<TRawPacket, TSource, TBody>({
    ...(config.options.fetch ? { fetch: config.options.fetch } : {}),
    ...(config.options.parse
      ? { parse: config.options.parse }
      : config.parse
        ? { parse: config.parse }
        : {}),
    ...(config.options.init ? { init: config.options.init } : {}),
    request: {
      method: config.options.request?.method ?? 'POST',
      ...(config.options.request?.headers ? { headers: config.options.request.headers } : {}),
      body: async (source: TSource) => {
        const resolvedBody = await resolveFrameworkTransportValue(source, config.options.body);
        const resolvedMessage = await resolveFrameworkTransportValue(source, config.options.message);

        if (resolvedBody === undefined && resolvedMessage === undefined) {
          return undefined;
        }

        return {
          ...(resolvedBody ?? {}),
          ...(resolvedMessage !== undefined ? { message: resolvedMessage } : {})
        } as TBody;
      }
    }
  });
}
