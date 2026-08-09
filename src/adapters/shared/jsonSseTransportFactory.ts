import { createJsonSseTransport, type FetchTransportSource, type JsonRequestOptions, type JsonSseTransportOptions, type TransportResolvable } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import {
  attachAgentdownRecoveryMetadata,
  parseAgentdownEventCursor,
  type AgentdownEventRecoveryMetadata
} from '../../recovery/backendConversation';

/**
 * 共享 JSON SSE transport 支持的可解析配置值。
 *
 * 除了沿用原本只接收 `source` 的 resolver，也额外支持读取当前请求上下文。
 */
export type FrameworkJsonTransportResolvable<
  TSource = FetchTransportSource,
  TValue = unknown,
  TContext = undefined
> =
  | TransportResolvable<TSource, TValue>
  | ((source: TSource, context: TContext | undefined) => Promise<TValue> | TValue);

/**
 * 内置框架 SSE helper 共享的最小 transport 配置结构。
 */
export interface FrameworkJsonSseTransportOptionsLike<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData,
  TContext = undefined
> extends Omit<JsonSseTransportOptions<TRawPacket, TSource, TBody>, 'request'> {
  /** 当前请求的用户输入，会自动落到 body.message。 */
  message?: FrameworkJsonTransportResolvable<TSource, string | undefined, TContext>;
  /** 需要额外合并到 JSON 请求体里的字段。 */
  body?: FrameworkJsonTransportResolvable<TSource, RuntimeData | undefined, TContext>;
  /** 当前请求可选的附加上下文。 */
  resolveContext?: () => TContext | undefined;
  /** 少数场景下覆写 method / headers 等请求细节。 */
  request?: Omit<JsonRequestOptions<TSource, TBody>, 'body'>;
  /** 内部恢复协调器；负责游标推进与重复事件过滤。 */
  recovery?: {
    isDuplicate?: (metadata: AgentdownEventRecoveryMetadata) => boolean;
    onEvent?: (metadata: AgentdownEventRecoveryMetadata) => void;
  };
}

function readRecoveryRequestContext(value: unknown): {
  sessionId?: string;
  clientRequestId?: string;
  afterCursor?: number;
} {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.sessionId === 'string' && record.sessionId.length > 0
      ? { sessionId: record.sessionId }
      : {}),
    ...(typeof record.clientRequestId === 'string' && record.clientRequestId.length > 0
      ? { clientRequestId: record.clientRequestId }
      : {}),
    ...(typeof record.afterCursor === 'number' && Number.isSafeInteger(record.afterCursor)
      ? { afterCursor: record.afterCursor }
      : {})
  };
}

function toPacketArray<TPacket>(value: TPacket | TPacket[] | null | void): TPacket[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/**
 * 创建共享 JSON SSE transport 时需要的附加默认值。
 */
export interface CreateFrameworkJsonSseTransportOptions<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData,
  TContext = undefined,
  TOptions extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody, TContext> = FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody, TContext>
> {
  /** 当前框架传入的 transport options。 */
  options: TOptions;
  /** 框架默认的 SSE parser。 */
  parse?: JsonSseTransportOptions<TRawPacket, TSource, TBody>['parse'];
}

/**
 * 解析一个可直接传值或按 source 延迟求值的 transport 配置项。
 */
async function resolveFrameworkTransportValue<TSource, TValue, TContext>(
  source: TSource,
  value: FrameworkJsonTransportResolvable<TSource, TValue, TContext> | undefined,
  context: TContext | undefined
): Promise<TValue | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (source: TSource, context: TContext | undefined) => Promise<TValue> | TValue)(
      source,
      context
    );
  }

  return value;
}

/**
 * 判断当前 message 字段是否值得继续写入请求体。
 *
 * 这里会把空字符串视为“未提供”，方便继续执行 / resume 场景临时清空 message。
 */
function shouldIncludeFrameworkTransportMessage(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 创建一个共享的 JSON SSE transport helper。
 */
export function createFrameworkJsonSseTransport<
  TRawPacket = unknown,
  TSource = FetchTransportSource,
  TBody extends RuntimeData = RuntimeData,
  TContext = undefined,
  TOptions extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody, TContext> = FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource, TBody, TContext>
>(
  config: CreateFrameworkJsonSseTransportOptions<TRawPacket, TSource, TBody, TContext, TOptions>
 ) {
  const configuredParser = config.options.parse ?? config.parse;

  return createJsonSseTransport<TRawPacket, TSource, TBody>({
    ...(config.options.fetch ? { fetch: config.options.fetch } : {}),
    parse: async (message, context) => {
      const parsed = configuredParser
        ? await configuredParser(message, context)
        : JSON.parse(message.data) as TRawPacket;
      const cursor = parseAgentdownEventCursor(message.id);

      if (cursor === null || !message.id) {
        return parsed;
      }

      const metadata: AgentdownEventRecoveryMetadata = {
        eventId: message.id,
        cursor
      };

      if (config.options.recovery?.isDuplicate?.(metadata)) {
        return null;
      }

      const packets = toPacketArray(parsed).map((packet) => (
        attachAgentdownRecoveryMetadata(packet, metadata)
      ));
      config.options.recovery?.onEvent?.(metadata);
      return packets;
    },
    ...(config.options.init ? { init: config.options.init } : {}),
    request: {
      method: config.options.request?.method ?? 'POST',
      ...(config.options.request?.headers ? { headers: config.options.request.headers } : {}),
      body: async (source: TSource) => {
        const context = config.options.resolveContext?.();
        const resolvedBody = await resolveFrameworkTransportValue(source, config.options.body, context);
        const resolvedMessage = await resolveFrameworkTransportValue(source, config.options.message, context);
        const recovery = readRecoveryRequestContext(context);

        if (resolvedBody === undefined && resolvedMessage === undefined) {
          return undefined;
        }

        return {
          ...(resolvedBody ?? {}),
          ...(shouldIncludeFrameworkTransportMessage(resolvedMessage)
            ? { message: resolvedMessage }
            : {}),
          ...(recovery.sessionId ? { session_id: recovery.sessionId } : {}),
          ...(recovery.clientRequestId ? { client_request_id: recovery.clientRequestId } : {}),
          ...(recovery.afterCursor !== undefined ? { after_cursor: recovery.afterCursor } : {})
        } as TBody;
      }
    }
  });
}
