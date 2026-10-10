import { readFileSync } from 'node:fs';
import * as tls from 'node:tls';

export class DeepSeekError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'DeepSeekError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const fail = (code, message, status) => new DeepSeekError(code, message, status);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function httpError(status) {
  const known = {
    400: ['invalid_request', '模型服务拒绝了请求，请检查输入与工具定义。'],
    401: ['unauthorized', '模型 API 密钥未通过认证，请检查服务端配置。'],
    402: ['payment_required', '模型账户余额不足，请检查账户额度。'],
    403: ['forbidden', '模型 API 拒绝访问，请检查密钥权限。'],
    404: ['model_not_found', '模型或 API 地址不可用，请检查服务端配置。'],
    429: ['rate_limited', '模型请求过于频繁，请稍后手动重试。'],
  };
  const [code, message] = known[status] ?? (status >= 500
    ? ['provider_unavailable', '模型服务暂时不可用，请稍后手动重试。']
    : ['provider_error', '模型服务返回了错误，请检查服务端配置。']);
  return fail(code, message, status);
}

/** Preserve the session proxy and public CA trust; never inspect credential files. */
async function proxyFetch() {
  const { EnvHttpProxyAgent, fetch } = await import('undici');
  const ca = [...(typeof tls.getCACertificates === 'function' ? tls.getCACertificates('default') : tls.rootCertificates)];
  for (const path of new Set([process.env.SSL_CERT_FILE, process.env.NODE_EXTRA_CA_CERTS].filter(Boolean))) {
    ca.push(readFileSync(path, 'utf8'));
  }
  const dispatcher = new EnvHttpProxyAgent({ requestTls: { ca }, proxyTls: { ca } });
  return (url, options) => fetch(url, { ...options, dispatcher });
}

function endpoint(baseUrl) {
  let url;
  try { url = new URL(baseUrl); } catch { throw fail('configuration_error', '模型 API 地址配置无效。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw fail('configuration_error', '模型 API 地址配置无效。');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  return url.href;
}

/** Server-only OpenAI-compatible provider. Each stream issues at most one paid POST. */
export function createDeepSeekProvider(options = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-flash';
  const url = endpoint(options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com');
  const maxTokens = options.maxTokens ?? (process.env.DEEPSEEK_MAX_TOKENS === undefined ? 1500 : Number(process.env.DEEPSEEK_MAX_TOKENS));
  const timeoutMs = options.timeoutMs ?? (process.env.DEEPSEEK_TIMEOUT_MS === undefined ? 90_000 : Number(process.env.DEEPSEEK_TIMEOUT_MS));
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw fail('configuration_error', '请在服务端配置 DEEPSEEK_API_KEY。');
  if (typeof model !== 'string' || !model.trim() || !Number.isInteger(maxTokens) || maxTokens < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw fail('configuration_error', '模型或请求限制配置无效。');
  }
  let fetchPromise;
  const getFetch = () => fetchPromise ??= options.fetch ? Promise.resolve(options.fetch) : proxyFetch();

  return {
    async *stream({ messages, tools, signal } = {}) {
      if (!Array.isArray(messages) || messages.length === 0 || (tools !== undefined && !Array.isArray(tools))) {
        throw fail('invalid_request', '请提供有效的模型消息与工具列表。');
      }
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      timer.unref?.();
      let reader;
      let cancelReader;
      try {
        if (controller.signal.aborted) throw fail('cancelled', '模型请求已取消。');
        const fetch = await getFetch();
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model, messages, ...(tools?.length ? { tools } : {}), stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw httpError(response.status);
        }
        if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
          await response.body?.cancel().catch(() => {});
          throw fail('invalid_stream', '模型服务未返回有效的流式响应。');
        }
        reader = response.body.getReader();
        cancelReader = () => { void reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        if (controller.signal.aborted) cancelReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let buffer = '';
        let data = [];
        let done = false;
        let finishReason;
        let hasText = false;
        let totalBytes = 0;
        let usage;
        let responseModel;
        const calls = new Map();

        const parse = frame => {
          if (frame === '[DONE]') { done = true; return []; }
          let chunk;
          try { chunk = JSON.parse(frame); } catch { throw fail('invalid_stream', '模型流包含无效的 JSON 数据。'); }
          if (!object(chunk) || chunk.error) throw fail('provider_stream_error', '模型服务在响应过程中返回了错误。');
          if (typeof chunk.model === 'string' && chunk.model.length <= 128) responseModel = chunk.model;
          if (chunk.usage !== undefined && chunk.usage !== null) {
            if (!object(chunk.usage)) throw fail('invalid_stream', '模型流包含无效的用量数据。');
            usage = Object.fromEntries(Object.entries(chunk.usage).filter(([key, value]) => /^[a-z_]+tokens$/.test(key) && Number.isFinite(value) && value >= 0));
          }
          if (!Array.isArray(chunk.choices)) throw fail('invalid_stream', '模型流缺少有效的输出数据。');
          const outputs = [];
          for (const choice of chunk.choices) {
            if (!object(choice) || choice.index !== 0) continue;
            if (choice.finish_reason !== null && choice.finish_reason !== undefined) finishReason = choice.finish_reason;
            const delta = choice.delta;
            if (!object(delta)) continue;
            if (delta.content !== undefined && delta.content !== null) {
              if (typeof delta.content !== 'string') throw fail('invalid_stream', '模型流包含无效的文本数据。');
              if (delta.content) { hasText = true; outputs.push({ type: 'text', delta: delta.content }); }
            }
            if (delta.tool_calls !== undefined) {
              if (!Array.isArray(delta.tool_calls)) throw fail('invalid_tool_call', '模型返回了无效的工具调用。');
              for (const fragment of delta.tool_calls) {
                if (!object(fragment) || !Number.isInteger(fragment.index) || fragment.index < 0 || fragment.index > 63) throw fail('invalid_tool_call', '模型返回了无效的工具调用。');
                const call = calls.get(fragment.index) ?? { id: '', name: '', arguments: '' };
                if (fragment.id !== undefined) {
                  if (typeof fragment.id !== 'string') throw fail('invalid_tool_call', '模型返回了无效的工具标识。');
                  call.id += fragment.id;
                }
                if (fragment.type !== undefined && fragment.type !== 'function') throw fail('invalid_tool_call', '模型返回了不支持的工具类型。');
                if (fragment.function !== undefined) {
                  if (!object(fragment.function)) throw fail('invalid_tool_call', '模型返回了无效的工具参数。');
                  for (const field of ['name', 'arguments']) if (fragment.function[field] !== undefined) {
                    if (typeof fragment.function[field] !== 'string') throw fail('invalid_tool_call', '模型返回了无效的工具参数。');
                    call[field] += fragment.function[field];
                  }
                }
                if (call.arguments.length > 1_048_576 || call.id.length > 512 || call.name.length > 128) throw fail('invalid_tool_call', '模型工具调用超过了允许的大小。');
                calls.set(fragment.index, call);
              }
            }
          }
          return outputs;
        };

        while (!done) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw fail(timedOut ? 'timeout' : 'cancelled', timedOut ? '模型响应超时，请稍后手动重试。' : '模型请求已取消。');
          if (chunk.done) {
            buffer += decoder.decode();
            break;
          }
          totalBytes += chunk.value.byteLength;
          if (totalBytes > 8_388_608) throw fail('invalid_stream', '模型响应超过了允许的大小。');
          buffer += decoder.decode(chunk.value, { stream: true });
          let newline;
          while (!done && (newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            if (!line) {
              if (data.length) { for (const output of parse(data.join('\n'))) yield output; data = []; }
            } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          if (buffer.length > 1_048_576) throw fail('invalid_stream', '模型流数据帧超过了允许的大小。');
        }
        if (!done || finishReason === undefined) throw fail('incomplete_stream', '模型响应意外中断，请手动重试。');
        if (finishReason === 'length') throw fail('max_tokens', '模型输出达到长度限制，任务未完成。');
        if (!['stop', 'tool_calls'].includes(finishReason)) throw fail('incomplete_stream', '模型未正常完成响应。');
        if (!hasText && !calls.size) throw fail('empty_response', '模型未返回文本或工具调用。');
        const completeCalls = [];
        const ids = new Set();
        for (const [, call] of [...calls.entries()].sort(([a], [b]) => a - b)) {
          let args;
          try { args = JSON.parse(call.arguments); } catch { throw fail('invalid_tool_call', '模型工具参数不是完整有效的 JSON。'); }
          if (!call.id || ids.has(call.id) || !/^[a-zA-Z0-9_-]+$/.test(call.name) || !object(args)) throw fail('invalid_tool_call', '模型返回了无效的工具调用。');
          ids.add(call.id);
          completeCalls.push({ type: 'tool-call', id: call.id, name: call.name, arguments: args });
        }
        if (finishReason === 'tool_calls' && !completeCalls.length) throw fail('invalid_tool_call', '模型未返回完整的工具调用。');
        for (const call of completeCalls) yield call;
        if (usage) yield { type: 'usage', usage, ...(responseModel ? { model: responseModel } : {}) };
      } catch (error) {
        if (error instanceof DeepSeekError) throw error;
        if (controller.signal.aborted) throw fail(timedOut ? 'timeout' : 'cancelled', timedOut ? '模型响应超时，请稍后手动重试。' : '模型请求已取消。');
        throw fail('provider_connection', '无法连接模型服务，请检查服务端网络与 API 配置。');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (cancelReader) controller.signal.removeEventListener('abort', cancelReader);
        if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
    },
  };
}
