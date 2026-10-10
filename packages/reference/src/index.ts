import { AdapterDeliveryError } from '@agentdown/core';
import type {
  AdapterContext, AdapterOperation, AdapterReceipt, AgentAdapter,
  EventEnvelope, EventSubscription,
} from '@agentdown/core';

export interface ReferenceAdapterOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  id?: string;
  version?: string;
  headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);
}

export interface ReferenceAdapter extends AgentAdapter {
  /** Drop the next business operation acknowledgement in the reference server. */
  loseNextAcknowledgement(): void;
}

/** Reference wire protocol for the prototype; this is not an AG-UI adapter. */
export function createReferenceAdapter(options: ReferenceAdapterOptions): ReferenceAdapter {
  const endpoint = options.endpoint.replace(/\/$/, '');
  const fetcher = options.fetch ?? globalThis.fetch;
  const requestHeaders = () => typeof options.headers === 'function' ? options.headers() : options.headers ?? {};
  const handoffs = new Map<string, { response: Response; release: () => void }>();
  let loseNext = false;
  let handoffSequence = 0;

  function receiptFromHeaders(response: Response, executionId: string, signal: AbortSignal): AdapterReceipt {
    const streamId = response.headers.get('x-agentdown-execution-id') ?? executionId;
    const remoteId = response.headers.get('x-agentdown-operation-id');
    const confirmation = response.headers.get('x-agentdown-confirmation') === 'backend' ? 'backend' : 'transport';
    const handoffId = String(++handoffSequence);
    const abort = () => {
      handoffs.delete(handoffId);
      void response.body?.cancel().catch(() => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    handoffs.set(handoffId, { response, release: () => signal.removeEventListener('abort', abort) });
    if (signal.aborted) abort();
    return {
      confirmation,
      ...(remoteId ? { remoteId } : {}),
      subscription: { streamId, executionId, data: { handoffId } },
    };
  }

  async function checked(response: Response): Promise<Response> {
    if (response.ok) return response;
    let message = `Reference backend returned HTTP ${response.status}`;
    let serverCode = '';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'error' in payload) {
        if (typeof payload.error === 'string') message = payload.error;
        else if (payload.error && typeof payload.error === 'object') {
          if ('message' in payload.error && typeof payload.error.message === 'string') message = payload.error.message;
          if ('code' in payload.error && typeof payload.error.code === 'string') serverCode = payload.error.code;
        }
      }
    } catch { /* Status is sufficient when a response has no JSON body. */ }
    if (response.status >= 500) {
      throw new AdapterDeliveryError({ status: 'uncertain', reason: message });
    }
    throw new AdapterDeliveryError({
      status: 'failed',
      error: { code: serverCode === 'expired' || response.status === 410 ? 'expired' : response.status === 409 ? 'conflict' : response.status === 400 ? 'invalidInput' : 'transport', message },
      retryable: false,
    });
  }

  async function execute(operation: AdapterOperation, context: AdapterContext): Promise<AdapterReceipt> {
    if (operation.action.type === 'resume') {
      return {
        confirmation: 'transport',
        subscription: {
          streamId: operation.executionId, executionId: operation.executionId,
          ...(operation.cursor ? { cursor: operation.cursor } : {}),
        },
      };
    }

    // Reconcile an uncertain attempt before submitting the same frozen intent.
    const recorded = context.snapshot.operations[operation.operationId];
    if (recorded && recorded.attemptCount > 1) {
      const lookup = await fetcher(`${endpoint}/operations/${encodeURIComponent(operation.operationId)}`, { signal: context.signal, headers: requestHeaders() });
      if (lookup.ok) {
        const known: unknown = await lookup.json();
        if (known && typeof known === 'object' && 'status' in known && known.status === 'accepted') {
          return {
            confirmation: 'backend', remoteId: operation.operationId,
            subscription: {
              streamId: operation.executionId, executionId: operation.executionId,
              ...(operation.cursor ? { cursor: operation.cursor } : {}),
            },
          };
        }
      } else if (lookup.status !== 404) {
        await checked(lookup);
      }
    }

    const drop = loseNext;
    loseNext = false;
    const response = await checked(await fetcher(`${endpoint}/operations`, {
      method: 'POST', signal: context.signal,
      headers: {
        ...requestHeaders(),
        'Content-Type': 'application/json', Accept: 'text/event-stream',
        ...(drop ? { 'x-agentdown-drop-ack': 'true' } : {}),
      },
      body: JSON.stringify(operation),
    }));
    return receiptFromHeaders(response, operation.executionId, context.signal);
  }

  async function* events(subscription: EventSubscription, context: AdapterContext): AsyncIterable<EventEnvelope> {
    const data = subscription.data;
    const handoffId = data && !Array.isArray(data) && typeof data === 'object' && 'handoffId' in data && typeof data.handoffId === 'string' ? data.handoffId : undefined;
    const handoff = handoffId ? handoffs.get(handoffId) : undefined;
    let response = handoff?.response;
    handoff?.release();
    if (handoffId) handoffs.delete(handoffId);
    if (!response) {
      const cursor = subscription.cursor ?? '';
      response = await checked(await fetcher(
        `${endpoint}/executions/${encodeURIComponent(subscription.executionId)}/events?cursor=${encodeURIComponent(cursor)}`,
        { signal: context.signal, headers: { ...requestHeaders(), Accept: 'text/event-stream' } },
      ));
    }
    if (!response.body) throw new Error('Reference event response has no body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const abort = () => { void reader.cancel().catch(() => undefined); };
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        if (buffer.length > 1_048_576) throw new Error('Reference SSE frame exceeds 1 MiB');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const payload = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!payload) continue;
          const parsed: unknown = JSON.parse(payload);
          if (!parsed || typeof parsed !== 'object' || !('streamId' in parsed) || typeof parsed.streamId !== 'string'
            || !('executionId' in parsed) || typeof parsed.executionId !== 'string' || !('event' in parsed)
            || !parsed.event || typeof parsed.event !== 'object' || !('type' in parsed.event) || typeof parsed.event.type !== 'string') {
            throw new Error('Malformed reference event envelope');
          }
          if (parsed.executionId !== subscription.executionId || parsed.streamId !== subscription.streamId) throw new Error('Reference event identity mismatch');
          yield parsed as EventEnvelope;
        }
        if (done) {
          if (buffer.trim()) throw new Error('Reference SSE stream ended with a partial frame');
          break;
        }
      }
    } finally {
      context.signal.removeEventListener('abort', abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  return {
    id: options.id ?? 'agentdown-reference', version: options.version ?? '1',
    capabilities: {
      maxConcurrentExecutions: 1, respond: true, regenerate: true,
      cancelExecution: true, resume: true, operationIdempotency: true, operationQuery: true,
    },
    execute, events,
    loseNextAcknowledgement() { loseNext = true; },
  };
}
