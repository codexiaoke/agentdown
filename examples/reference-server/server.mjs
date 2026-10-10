import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const APPROVALS = [
  { key: 'save', name: 'save_report', prompt: '允许保存这份演示报告吗？' },
  { key: 'publish', name: 'publish_summary', prompt: '允许公开报告摘要吗？' }
];

export const referenceCapabilities = Object.freeze({
  maxConcurrentExecutions: 4,
  respond: true,
  regenerate: true,
  cancelExecution: true,
  resume: true,
  operationIdempotency: true,
  operationQuery: true
});

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assert(condition, status, code, message) {
  if (!condition) throw new HttpError(status, code, message);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function fingerprint(operation) {
  // Attempts and observation cursors may change; the business intent may not.
  return createHash('sha256').update(canonicalJson({
    conversationId: operation.conversationId,
    executionId: operation.executionId,
    turnId: operation.turnId,
    interactionRevision: operation.interactionRevision ?? null,
    action: operation.action
  })).digest('hex');
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[\x21-\x7e]+$/.test(value);
}

async function readJson(request, limit) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    assert(length <= limit, 413, 'bodyTooLarge', 'Request body exceeds the size limit.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalidJson', 'The request body must contain JSON.');
  }
}

function validateOperation(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'invalidInput', 'An operation object is required.');
  for (const field of ['operationId', 'attemptId', 'conversationId', 'executionId', 'turnId']) {
    assert(validId(value[field]), 400, 'invalidInput', `${field} must be a nonempty printable ASCII string of at most 200 characters.`);
  }
  assert(value.action && typeof value.action === 'object', 400, 'invalidInput', 'An action object is required.');
  const action = value.action;
  assert(['send', 'respond', 'regenerate', 'cancelExecution', 'resume'].includes(action.type), 400, 'unsupported', 'This action is not supported by the reference backend.');
  if (action.type === 'send') {
    assert(typeof action.input?.text === 'string' && action.input.text.trim().length > 0, 400, 'invalidInput', 'send requires nonempty input.text.');
  }
  if (action.type === 'respond') {
    assert(validId(action.interactionId), 400, 'invalidInput', 'respond requires interactionId.');
    assert(action.response && typeof action.response.approved === 'boolean', 400, 'invalidInput', 'Approval responses use { approved: boolean }.');
    assert(Object.keys(action.response).length === 1, 400, 'invalidInput', 'Approval responses only accept the approved field.');
    assert(value.interactionRevision === undefined || (Number.isInteger(value.interactionRevision) && value.interactionRevision >= 0), 400, 'invalidInput', 'interactionRevision must be a nonnegative integer.');
  }
  if (action.type === 'regenerate') assert(validId(action.turnId), 400, 'invalidInput', 'regenerate requires turnId.');
  if (action.type === 'cancelExecution' || action.type === 'resume') {
    assert(action.executionId === value.executionId, 400, 'invalidInput', 'The action executionId must match the operation executionId.');
  }
  return value;
}

function cursorNumber(value, latest) {
  if (value === undefined || value === null || value === '') return 0;
  assert(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), 400, 'invalidCursor', 'The cursor must be a nonnegative decimal string.');
  const cursor = Number(value);
  assert(Number.isSafeInteger(cursor), 400, 'invalidCursor', 'The cursor is outside the supported range.');
  assert(cursor <= latest, 409, 'invalidCursor', 'The cursor is ahead of this execution stream.');
  return cursor;
}

/**
 * An intentionally process-local backend for exercising the Agentdown contract.
 * It calls no model and keeps operations/events only until this process exits.
 */
export function createReferenceServer(options = {}) {
  const stepDelay = options.stepDelay ?? 120;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const bodyLimit = options.bodyLimit ?? 64 * 1024;
  const maxBufferedBytes = options.maxBufferedBytes ?? 1024 * 1024;
  const executions = new Map();
  const operations = new Map();
  const turns = new Map();
  const subscribers = new Set();
  const timers = new Set();
  let closing = false;

  function later(task, delay = stepDelay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!closing) task();
    }, delay);
    timers.add(timer);
    return timer;
  }

  function emit(execution, event) {
    const envelope = {
      streamId: execution.id,
      eventId: String(execution.events.length + 1),
      cursor: String(execution.events.length + 1),
      executionId: execution.id,
      event
    };
    execution.events.push(envelope);
    for (const subscriber of [...execution.subscribers]) subscriber.write(envelope);
    return envelope;
  }

  function setStatus(execution, status) {
    execution.status = status;
    emit(execution, { type: 'execution.updated', status });
  }

  function run(execution, status) {
    emit(execution, { type: 'run.upsert', run: { id: execution.runId, executionId: execution.id, title: '参考任务', status } });
  }

  function step(execution, key, title, status) {
    emit(execution, { type: 'step.upsert', step: { id: `${execution.id}:step:${key}`, executionId: execution.id, runId: execution.runId, title, status } });
  }

  function tool(execution, approval, status, output) {
    emit(execution, {
      type: 'tool.upsert',
      tool: {
        id: `${execution.id}:tool:${approval.key}`,
        executionId: execution.id,
        runId: execution.runId,
        name: approval.name,
        input: { text: execution.input.text },
        status,
        ...(output === undefined ? {} : { output })
      }
    });
  }

  function finishStreams(execution) {
    for (const subscriber of [...execution.subscribers]) subscriber.end();
  }

  function complete(execution) {
    if (TERMINAL.has(execution.status) || execution.continuing) return;
    execution.continuing = true;
    run(execution, 'running');
    setStatus(execution, 'running');
    step(execution, 'prepare', '整理计划与需要确认的操作', 'completed');
    step(execution, 'result', '生成最终报告', 'running');
    later(() => {
      if (TERMINAL.has(execution.status)) return;
      emit(execution, { type: 'message.delta', messageId: execution.messageId, delta: '\n\n两项决定均已确认，正在生成结果。' });
      later(() => {
        if (TERMINAL.has(execution.status)) return;
        const decisions = APPROVALS.map((approval) => ({
          action: approval.name,
          approved: execution.interactions.get(`${execution.id}:approval:${approval.key}`).response.approved
        }));
        emit(execution, {
          type: 'artifact.upsert',
          artifact: {
            id: `${execution.id}:report`,
            executionId: execution.id,
            title: '任务报告',
            kind: 'report',
            revision: 1,
            status: 'ready',
            content: { summary: '这是无模型参考后端生成的演示报告。', input: execution.input.text, decisions }
          }
        });
        emit(execution, { type: 'message.delta', messageId: execution.messageId, delta: '\n\n报告已生成。被拒绝的操作已跳过；你的决定会保留在报告中。' });
        emit(execution, { type: 'message.completed', messageId: execution.messageId });
        step(execution, 'result', '生成最终报告', 'completed');
        run(execution, 'completed');
        setStatus(execution, 'completed');
        finishStreams(execution);
      });
    });
  }

  function start(execution) {
    setStatus(execution, 'running');
    run(execution, 'running');
    emit(execution, {
      type: 'message.upsert',
      message: {
        id: execution.messageId,
        turnId: execution.turnId,
        executionId: execution.id,
        runId: execution.runId,
        role: 'assistant',
        text: '',
        status: 'streaming',
        createdAt: Date.now()
      }
    });
    step(execution, 'prepare', '整理计划与需要确认的操作', 'running');
    later(() => {
      if (TERMINAL.has(execution.status)) return;
      emit(execution, { type: 'message.delta', messageId: execution.messageId, delta: '我会先整理任务，再分别请求保存报告和公开摘要的许可。' });
      later(() => {
        if (TERMINAL.has(execution.status)) return;
        for (const approval of APPROVALS) {
          tool(execution, approval, 'waiting');
          const interaction = {
            id: `${execution.id}:approval:${approval.key}`,
            executionId: execution.id,
            runId: execution.runId,
            toolCallId: `${execution.id}:tool:${approval.key}`,
            kind: 'approval',
            prompt: approval.prompt,
            revision: 1,
            status: 'pending',
            responseSchema: { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean' } }, additionalProperties: false }
          };
          execution.interactions.set(interaction.id, interaction);
          emit(execution, { type: 'interaction.upsert', interaction });
        }
        run(execution, 'waiting');
        setStatus(execution, 'waiting');
      });
    });
  }

  function receiptFor(operation, execution) {
    const cursor = operation.cursor ?? operation.cursors?.[execution.id];
    cursorNumber(cursor, execution.events.length);
    return {
      confirmation: 'backend',
      remoteId: operation.operationId,
      subscription: { streamId: execution.id, executionId: execution.id, ...(cursor === undefined ? {} : { cursor }) }
    };
  }

  function accept(operation) {
    const intent = fingerprint(operation);
    const existing = operations.get(operation.operationId);
    if (existing) {
      assert(existing.fingerprint === intent, 409, 'idempotencyConflict', 'An operationId cannot be reused with different business input.');
      const execution = executions.get(existing.executionId);
      return { execution, receipt: receiptFor(operation, execution), duplicate: true };
    }

    const action = operation.action;
    let execution;
    let input;
    if (action.type === 'send' || action.type === 'regenerate') {
      assert(!executions.has(operation.executionId), 409, 'conflict', 'This executionId already exists.');
      const active = [...executions.values()].filter((item) => item.conversationId === operation.conversationId && !TERMINAL.has(item.status)).length;
      assert(active < referenceCapabilities.maxConcurrentExecutions, 409, 'conflict', 'Too many active executions.');
      if (action.type === 'send') {
        assert(!turns.has(operation.turnId), 409, 'conflict', 'This turnId already exists.');
        input = structuredClone(action.input);
      } else {
        const original = turns.get(action.turnId);
        assert(original && original.conversationId === operation.conversationId, 404, 'notFound', 'The original turn does not exist.');
        assert(operation.turnId === action.turnId, 400, 'invalidInput', 'The turnId must match the regenerated turn.');
        if (action.fromExecutionId !== undefined) {
          const previous = executions.get(action.fromExecutionId);
          assert(previous && previous.turnId === action.turnId && previous.conversationId === operation.conversationId, 404, 'notFound', 'The previous execution does not belong to this turn.');
        }
        input = structuredClone(original.input);
      }
      execution = {
        id: operation.executionId,
        conversationId: operation.conversationId,
        turnId: operation.turnId,
        input,
        runId: `${operation.executionId}:run`,
        messageId: `${operation.executionId}:assistant`,
        status: 'pending',
        continuing: false,
        events: [],
        interactions: new Map(),
        subscribers: new Set()
      };
    } else {
      execution = executions.get(operation.executionId);
      assert(execution && execution.conversationId === operation.conversationId, 404, 'notFound', 'The execution does not exist in this conversation.');
      assert(execution.turnId === operation.turnId, 400, 'invalidInput', 'The turnId does not belong to this execution.');
      if (action.type === 'respond') {
        assert(!TERMINAL.has(execution.status), 409, 'expired', 'This execution no longer accepts decisions.');
        const interaction = execution.interactions.get(action.interactionId);
        assert(interaction, 404, 'notFound', 'The interaction does not exist.');
        assert(interaction.status === 'pending', 409, 'conflict', 'This interaction already has a confirmed decision.');
        assert(operation.interactionRevision === undefined || operation.interactionRevision === interaction.revision, 409, 'conflict', 'The interaction revision has changed.');
      }
      if (action.type === 'cancelExecution') {
        assert(!TERMINAL.has(execution.status), 409, 'conflict', 'This execution has already finished.');
      }
    }

    // Validate the observation cursor before accepting any business mutation.
    const receipt = receiptFor(operation, execution);
    if (action.type === 'send' || action.type === 'regenerate') {
      executions.set(execution.id, execution);
      if (action.type === 'send') turns.set(operation.turnId, { conversationId: operation.conversationId, input });
    }
    operations.set(operation.operationId, {
      operationId: operation.operationId,
      executionId: execution.id,
      status: 'accepted',
      fingerprint: intent,
      receipt
    });
    if (action.type !== 'resume') emit(execution, { type: 'operation.accepted', operationId: operation.operationId, remoteId: operation.operationId });

    if (action.type === 'send' || action.type === 'regenerate') start(execution);
    if (action.type === 'respond') {
      const interaction = execution.interactions.get(action.interactionId);
      const response = structuredClone(action.response);
      const resolved = { ...interaction, status: 'resolved', response, revision: interaction.revision + 1 };
      execution.interactions.set(interaction.id, resolved);
      emit(execution, { type: 'interaction.resolved', interactionId: interaction.id, response, revision: resolved.revision });
      const approval = APPROVALS.find((item) => interaction.toolCallId === `${execution.id}:tool:${item.key}`);
      tool(execution, approval, response.approved ? 'completed' : 'cancelled', { approved: response.approved });
      if ([...execution.interactions.values()].every((item) => item.status === 'resolved')) complete(execution);
    }
    if (action.type === 'cancelExecution') {
      for (const interaction of execution.interactions.values()) {
        if (interaction.status !== 'pending') continue;
        const expired = { ...interaction, status: 'expired', revision: interaction.revision + 1 };
        execution.interactions.set(interaction.id, expired);
        emit(execution, { type: 'interaction.upsert', interaction: expired });
        const approval = APPROVALS.find((item) => interaction.toolCallId === `${execution.id}:tool:${item.key}`);
        tool(execution, approval, 'cancelled');
      }
      step(execution, execution.continuing ? 'result' : 'prepare', execution.continuing ? '生成最终报告' : '整理计划与需要确认的操作', 'cancelled');
      emit(execution, { type: 'message.completed', messageId: execution.messageId });
      run(execution, 'cancelled');
      setStatus(execution, 'cancelled');
      finishStreams(execution);
    }
    return { execution, receipt, duplicate: false };
  }

  function json(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  }

  function subscribe(response, execution, cursor, operationId) {
    const after = cursorNumber(cursor, execution.events.length);
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-agentdown-execution-id': execution.id,
      ...(operationId === undefined ? {} : { 'x-agentdown-operation-id': operationId, 'x-agentdown-confirmation': 'backend' })
    });
    response.flushHeaders();
    let heartbeat;
    let ended = false;
    const subscriber = {
      write(envelope) {
        if (ended || response.destroyed) return;
        response.write(`id: ${envelope.eventId}\ndata: ${JSON.stringify(envelope)}\n\n`);
        if (response.writableLength > maxBufferedBytes) subscriber.end();
      },
      end() {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        execution.subscribers.delete(subscriber);
        subscribers.delete(subscriber);
        response.end();
      }
    };
    execution.subscribers.add(subscriber);
    subscribers.add(subscriber);
    response.on('close', () => subscriber.end());
    for (const envelope of execution.events.slice(after)) subscriber.write(envelope);
    if (TERMINAL.has(execution.status)) {
      subscriber.end();
    } else if (!ended) {
      heartbeat = setInterval(() => {
        if (!ended) response.write(': heartbeat\n\n');
      }, heartbeatMs);
      heartbeat.unref();
    }
  }

  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'Content-Type, Accept, Last-Event-ID, X-Agentdown-Drop-Ack');
    response.setHeader('access-control-expose-headers', 'X-Agentdown-Execution-Id, X-Agentdown-Operation-Id, X-Agentdown-Confirmation');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { status: 'ok', protocol: 'agentdown-reference/v1', capabilities: referenceCapabilities });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/operations') {
        const operation = validateOperation(await readJson(request, bodyLimit));
        const result = accept(operation);
        if (request.headers['x-agentdown-drop-ack'] === 'true' && !result.duplicate) {
          request.socket.destroy();
          return;
        }
        if (request.headers.accept?.includes('text/event-stream')) {
          subscribe(response, result.execution, result.receipt.subscription.cursor, operation.operationId);
        } else {
          json(response, 200, result.receipt);
        }
        return;
      }
      const eventsRoute = /^\/api\/executions\/([^/]+)\/events$/.exec(url.pathname);
      if (request.method === 'GET' && eventsRoute) {
        const execution = executions.get(decodeURIComponent(eventsRoute[1]));
        assert(execution, 404, 'notFound', 'The execution does not exist.');
        subscribe(response, execution, url.searchParams.get('cursor') ?? request.headers['last-event-id']);
        return;
      }
      const operationRoute = /^\/api\/operations\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && operationRoute) {
        const operation = operations.get(decodeURIComponent(operationRoute[1]));
        assert(operation, 404, 'notFound', 'The operation is unknown to this process.');
        json(response, 200, { status: operation.status, operationId: operation.operationId, receipt: operation.receipt });
        return;
      }
      throw new HttpError(404, 'notFound', 'This endpoint does not exist.');
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      const known = error instanceof HttpError;
      const malformedPath = error instanceof URIError;
      json(response, known ? error.status : malformedPath ? 400 : 500, { error: { code: known ? error.code : malformedPath ? 'invalidInput' : 'internal', message: known ? error.message : malformedPath ? 'The path contains invalid encoding.' : 'The reference server could not handle the request.' } });
    }
  });

  const close = server.close.bind(server);
  server.close = (callback) => {
    closing = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const subscriber of [...subscribers]) subscriber.end();
    return close(callback);
  };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8010);
  const server = createReferenceServer();
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`Agentdown reference server: http://localhost:${port}\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
