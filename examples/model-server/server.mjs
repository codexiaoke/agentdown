import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDeepSeekProvider, DeepSeekError } from './deepseek.mjs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const TOOL_SCHEMA = [{ type: 'function', function: {
  name: 'save_report',
  description: 'Save a report on this Agentdown server after explicit human approval. This never publishes externally.',
  parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string', description: 'The complete report, in Markdown or plain text.' } }, required: ['title', 'content'], additionalProperties: false }
} }];
const SYSTEM = 'You are a helpful Agentdown assistant. Answer in the user\'s language. Use save_report only when the user requests saving a report or document; prepare the actual complete content before calling it. Each save requires human approval. Never claim that a file was saved before the tool reports success. A denied tool must not be retried without a new user request. Otherwise answer directly, without inventing tool calls.';

export const modelCapabilities = Object.freeze({ maxConcurrentExecutions: 4, respond: true, regenerate: true, cancelExecution: true, resume: true, operationIdempotency: true, operationQuery: true });

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function assert(condition, status, code, message) { if (!condition) throw new HttpError(status, code, message); }
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[\x21-\x7e]+$/.test(value); }
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function fingerprint(operation) { return createHash('sha256').update(canonical({ conversationId: operation.conversationId, executionId: operation.executionId, turnId: operation.turnId, interactionRevision: operation.interactionRevision ?? null, action: operation.action })).digest('hex'); }
function cursorNumber(value, latest) {
  if (value === undefined || value === null || value === '') return 0;
  assert(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), 400, 'invalidCursor', 'A nonnegative decimal cursor is required.');
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number <= latest, 409, 'invalidCursor', 'The cursor is outside this execution stream.');
  return number;
}
async function readJson(request, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; assert(length <= limit, 413, 'bodyTooLarge', 'Request body is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'invalidJson', 'A JSON request is required.'); }
}
function validateOperation(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'invalidInput', 'An operation object is required.');
  for (const field of ['operationId', 'attemptId', 'conversationId', 'executionId', 'turnId']) assert(validId(value[field]), 400, 'invalidInput', `${field} is invalid.`);
  const action = value.action;
  assert(action && typeof action === 'object' && ['send', 'respond', 'regenerate', 'cancelExecution', 'resume'].includes(action.type), 400, 'unsupported', 'Unsupported action.');
  if (action.type === 'send') {
    assert(typeof action.input?.text === 'string' && action.input.text.trim().length > 0 && action.input.text.length <= 32_000, 400, 'invalidInput', 'send requires nonempty text of at most 32000 characters.');
    assert(!action.input.attachments?.length, 400, 'unsupported', 'This backend currently accepts text only.');
  }
  if (action.type === 'respond') {
    assert(validId(action.interactionId) && action.response && typeof action.response.approved === 'boolean' && Object.keys(action.response).length === 1, 400, 'invalidInput', 'An interactionId and { approved: boolean } are required.');
    assert(value.interactionRevision === undefined || (Number.isInteger(value.interactionRevision) && value.interactionRevision >= 0), 400, 'invalidInput', 'Invalid interaction revision.');
  }
  if (action.type === 'regenerate') assert(validId(action.turnId) && action.turnId === value.turnId, 400, 'invalidInput', 'The regenerated turn must match turnId.');
  if (action.type === 'cancelExecution' || action.type === 'resume') assert(action.executionId === value.executionId, 400, 'invalidInput', 'Execution identity mismatch.');
  return value;
}
function authMatches(header, accessToken) {
  if (!accessToken) return true;
  const actual = Buffer.from(header ?? ''); const expected = Buffer.from(`Bearer ${accessToken}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function loopback(host) { return host === '127.0.0.1' || host === '::1' || host === 'localhost'; }

/** Real model-backed Agentdown protocol. Execution state and replay logs are process-local. */
export function createModelServer(options = {}) {
  const provider = options.provider ?? createDeepSeekProvider();
  assert(provider && typeof provider.stream === 'function', 500, 'configuration', 'A model provider is required.');
  const dataDir = resolve(options.dataDir ?? './.agentdown-data');
  const staticDir = options.staticDir ? resolve(options.staticDir) : undefined;
  const accessToken = options.accessToken ?? '';
  if (accessToken && /[\r\n]/.test(accessToken)) throw new Error('AGENTDOWN_ACCESS_TOKEN contains invalid characters.');
  const corsOrigins = new Set(options.corsOrigins ?? []);
  for (const origin of corsOrigins) if (origin === '*' || new URL(origin).origin !== origin) throw new Error('CORS origins must be exact URL origins.');
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const maxRounds = options.maxRounds ?? 8;
  const maxBufferedBytes = options.maxBufferedBytes ?? 1024 * 1024;
  const maxOutputChars = options.maxOutputChars ?? 256_000;
  const executions = new Map(); const operations = new Map(); const turns = new Map(); const subscribers = new Set();
  let closing = false;

  function emit(execution, event) {
    if (closing) return;
    const envelope = { streamId: execution.id, executionId: execution.id, eventId: String(execution.events.length + 1), cursor: String(execution.events.length + 1), event };
    execution.events.push(envelope);
    for (const subscriber of [...execution.subscribers]) subscriber.write(envelope);
  }
  function status(execution, value, error) { execution.status = value; emit(execution, { type: 'execution.updated', status: value, ...(error ? { error } : {}) }); }
  function run(execution, value) { emit(execution, { type: 'run.upsert', run: { id: execution.runId, executionId: execution.id, title: '模型任务', status: value } }); }
  function step(execution, round, value) { emit(execution, { type: 'step.upsert', step: { id: `${execution.id}:step:${round}`, executionId: execution.id, runId: execution.runId, title: `模型推理 · ${round}`, status: value } }); }
  function tool(execution, call, value, output) { emit(execution, { type: 'tool.upsert', tool: { id: call.entityId, executionId: execution.id, runId: execution.runId, name: call.name, input: call.arguments, status: value, ...(output === undefined ? {} : { output }) } }); }
  function endStreams(execution) { for (const subscriber of [...execution.subscribers]) subscriber.end(); }
  function expireInteractions(execution) {
    for (const interaction of execution.interactions.values()) if (interaction.status === 'pending') {
      interaction.status = 'expired'; interaction.revision++;
      emit(execution, { type: 'interaction.upsert', interaction: { ...interaction } });
      const call = execution.batch?.find((item) => item.interactionId === interaction.id);
      if (call) tool(execution, call, 'cancelled');
    }
  }
  function fail(execution, error) {
    if (TERMINAL.has(execution.status) || closing) return;
    expireInteractions(execution);
    // Provider errors may contain request metadata. Never expose provider errors or credentials.
    const knownMessages = { unauthorized: '模型 API 密钥未通过认证，请检查服务端配置。', payment_required: '模型账户余额不足，请检查账户额度。', rate_limited: '模型请求过于频繁，请稍后手动重新生成。', model_not_found: '模型或 API 地址不可用，请检查服务端配置。', max_tokens: '模型输出达到长度限制，请缩短任务或调高服务端 DEEPSEEK_MAX_TOKENS 后重新生成。', timeout: '模型请求超时，请稍后手动重新生成。', incomplete_stream: '模型响应中途断开，请手动重新生成。' };
    const message = error instanceof DeepSeekError && knownMessages[error.code] || '模型请求失败，请检查服务端模型配置后重新生成。';
    if (execution.messageId) emit(execution, { type: 'message.upsert', message: { id: execution.messageId, turnId: execution.turnId, executionId: execution.id, runId: execution.runId, role: 'assistant', text: execution.roundText ?? '', status: 'failed', createdAt: execution.messageCreatedAt } });
    step(execution, execution.round, 'failed'); run(execution, 'failed'); status(execution, 'failed', message); endStreams(execution);
  }

  async function saveReport(execution, call) {
    const args = call.arguments;
    if (call.name !== 'save_report' || typeof args?.title !== 'string' || typeof args?.content !== 'string' || !args.title.trim() || !args.content.trim() || args.title.length > 200 || args.content.length > 200_000 || Object.keys(args).some((key) => !['title', 'content'].includes(key))) return { ok: false, error: 'Invalid save_report arguments.' };
    const key = createHash('sha256').update(`${execution.id}:${call.entityId}`).digest('hex');
    const filename = `${key}.md`; const destination = resolve(dataDir, filename); const temporary = `${destination}.pending`;
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    if (execution.controller.signal.aborted) return { ok: false, cancelled: true };
    await writeFile(temporary, `# ${args.title}\n\n${args.content}\n`, { mode: 0o600, flag: 'wx' });
    if (execution.controller.signal.aborted) { await unlink(temporary).catch(() => {}); return { ok: false, cancelled: true }; }
    await rename(temporary, destination);
    if (execution.controller.signal.aborted) return { ok: false, cancelled: true, saved: true };
    emit(execution, { type: 'artifact.upsert', artifact: { id: `${call.entityId}:report`, executionId: execution.id, title: args.title, kind: 'report', revision: 1, status: 'ready', content: { summary: args.content, filename, saved: true } } });
    return { ok: true, saved: true, filename, title: args.title };
  }
  async function decide(execution, call, approved) {
    if (!approved) { call.result = { ok: false, approved: false, denied: true, message: 'Human denied this save. Do not retry it.' }; tool(execution, call, 'cancelled', call.result); }
    else {
      tool(execution, call, 'running');
      try { call.result = await saveReport(execution, call); } catch { call.result = { ok: false, error: 'The report could not be saved.' }; }
      if (TERMINAL.has(execution.status) || closing) return;
      tool(execution, call, call.result.ok ? 'completed' : 'failed', call.result);
    }
    if (TERMINAL.has(execution.status) || closing || execution.batch.some((item) => item.result === undefined)) return;
    const batch = execution.batch; execution.batch = undefined;
    for (const item of batch) execution.history.push({ role: 'tool', tool_call_id: item.id, content: JSON.stringify(item.result) });
    void advance(execution);
  }
  async function advance(execution) {
    if (TERMINAL.has(execution.status) || execution.busy || closing) return;
    execution.busy = true;
    try {
      assert(++execution.round <= maxRounds, 500, 'modelLimit', 'Maximum tool rounds exceeded.');
      status(execution, 'running'); run(execution, 'running'); step(execution, execution.round, 'running');
      execution.messageId = `${execution.id}:assistant:${execution.round}`; execution.roundText = ''; execution.messageCreatedAt = Date.now();
      emit(execution, { type: 'message.upsert', message: { id: execution.messageId, turnId: execution.turnId, executionId: execution.id, runId: execution.runId, role: 'assistant', text: '', status: 'streaming', createdAt: execution.messageCreatedAt } });
      const calls = [];
      for await (const event of provider.stream({ messages: [{ role: 'system', content: options.systemPrompt ?? SYSTEM }, ...execution.history], tools: TOOL_SCHEMA, signal: execution.controller.signal })) {
        if (execution.controller.signal.aborted || closing) return;
        if (event.type === 'text' && typeof event.delta === 'string') {
          execution.roundText += event.delta; execution.outputChars += event.delta.length;
          assert(execution.outputChars <= maxOutputChars, 500, 'modelLimit', 'Maximum output exceeded.');
          emit(execution, { type: 'message.delta', messageId: execution.messageId, delta: event.delta });
        }
        if (event.type === 'tool-call') {
          assert(validId(event.id) && typeof event.name === 'string' && event.arguments && typeof event.arguments === 'object' && !Array.isArray(event.arguments) && !calls.some((call) => call.id === event.id) && calls.length < 8, 500, 'invalidModelOutput', 'Invalid tool call.');
          calls.push({ id: event.id, name: event.name, arguments: structuredClone(event.arguments), entityId: `${execution.id}:tool:${execution.round}:${calls.length}` });
        }
      }
      if (execution.controller.signal.aborted || closing) return;
      execution.history.push({ role: 'assistant', content: execution.roundText || null, ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}) });
      emit(execution, { type: 'message.completed', messageId: execution.messageId }); step(execution, execution.round, 'completed');
      if (!calls.length) { run(execution, 'completed'); status(execution, 'completed'); endStreams(execution); return; }
      execution.batch = calls;
      for (const call of calls) {
        // Unknown/malformed tools are returned to the model; they never acquire side effects.
        if (call.name !== 'save_report' || typeof call.arguments.title !== 'string' || typeof call.arguments.content !== 'string' || !call.arguments.title.trim() || !call.arguments.content.trim() || call.arguments.title.length > 200 || call.arguments.content.length > 200_000 || Object.keys(call.arguments).some((key) => !['title', 'content'].includes(key))) {
          call.result = { ok: false, error: 'Unsupported tool or invalid arguments.' }; tool(execution, call, 'failed', call.result); continue;
        }
        tool(execution, call, 'waiting'); call.interactionId = `${call.entityId}:approval`;
        const interaction = { id: call.interactionId, executionId: execution.id, runId: execution.runId, toolCallId: call.entityId, kind: 'approval', prompt: `允许在服务器保存报告「${call.arguments.title}」吗？`, revision: 1, status: 'pending', responseSchema: { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean' } }, additionalProperties: false } };
        execution.interactions.set(interaction.id, interaction); emit(execution, { type: 'interaction.upsert', interaction: { ...interaction } });
      }
      if (calls.every((call) => call.result !== undefined)) {
        execution.batch = undefined;
        for (const call of calls) execution.history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(call.result) });
        queueMicrotask(() => void advance(execution));
      } else { run(execution, 'waiting'); status(execution, 'waiting'); }
    } catch (error) { fail(execution, error); }
    finally { execution.busy = false; }
  }

  function receiptFor(operation, execution) {
    const cursor = operation.cursor ?? operation.cursors?.[execution.id]; cursorNumber(cursor, execution.events.length);
    return { confirmation: 'backend', remoteId: operation.operationId, subscription: { streamId: execution.id, executionId: execution.id, ...(cursor === undefined ? {} : { cursor }) } };
  }
  function accept(operation) {
    const intent = fingerprint(operation); const existing = operations.get(operation.operationId);
    if (existing) { assert(existing.fingerprint === intent, 409, 'idempotencyConflict', 'Operation identity was reused with different input.'); assert(existing.conversationId === operation.conversationId, 409, 'conflict', 'Conversation mismatch.'); const execution = executions.get(existing.executionId); return { execution, receipt: receiptFor(operation, execution), duplicate: true }; }
    const action = operation.action; let execution;
    if (action.type === 'send' || action.type === 'regenerate') {
      assert(!executions.has(operation.executionId), 409, 'conflict', 'Execution already exists.');
      assert([...executions.values()].filter((item) => !TERMINAL.has(item.status)).length < (options.maxConcurrentExecutions ?? modelCapabilities.maxConcurrentExecutions), 409, 'conflict', 'Too many active model tasks.');
      let input;
      if (action.type === 'send') { assert(!turns.has(operation.turnId), 409, 'conflict', 'Turn already exists.'); input = structuredClone(action.input); }
      else { const original = turns.get(action.turnId); assert(original && original.conversationId === operation.conversationId, 404, 'notFound', 'Original turn is unavailable.'); input = structuredClone(original.input); if (action.fromExecutionId) { const previous = executions.get(action.fromExecutionId); assert(previous?.turnId === action.turnId && previous.conversationId === operation.conversationId, 404, 'notFound', 'Original execution is unavailable.'); } }
      const latest = [...executions.values()].filter((item) => item.conversationId === operation.conversationId && item.status === 'completed').at(-1);
      const parentHistory = action.type === 'regenerate' ? turns.get(action.turnId).parentHistory : latest?.history ?? [];
      assert(JSON.stringify(parentHistory).length < 256_000, 409, 'contextLimit', 'Start a new conversation: this conversation exceeds the supported context limit.');
      execution = { id: operation.executionId, conversationId: operation.conversationId, turnId: operation.turnId, input, parentHistory: structuredClone(parentHistory), runId: `${operation.executionId}:run`, status: 'pending', round: 0, outputChars: 0, busy: false, history: [...structuredClone(parentHistory), { role: 'user', content: input.text }], events: [], interactions: new Map(), subscribers: new Set(), controller: new AbortController() };
    } else {
      execution = executions.get(operation.executionId);
      assert(execution && execution.conversationId === operation.conversationId, 404, 'notFound', 'Execution is unavailable in this conversation.'); assert(execution.turnId === operation.turnId, 400, 'invalidInput', 'Turn identity mismatch.');
      if (action.type === 'respond') { const interaction = execution.interactions.get(action.interactionId); assert(!TERMINAL.has(execution.status), 409, 'expired', 'This execution no longer accepts decisions.'); assert(interaction, 404, 'notFound', 'Interaction is unavailable.'); assert(interaction.status === 'pending', 409, 'conflict', 'Decision already confirmed.'); assert(operation.interactionRevision === undefined || operation.interactionRevision === interaction.revision, 409, 'conflict', 'Interaction revision changed.'); }
      if (action.type === 'cancelExecution') assert(!TERMINAL.has(execution.status), 409, 'conflict', 'Execution already finished.');
    }
    const receipt = receiptFor(operation, execution);
    if (action.type === 'send' || action.type === 'regenerate') { executions.set(execution.id, execution); if (action.type === 'send') turns.set(operation.turnId, { conversationId: operation.conversationId, input: execution.input, parentHistory: execution.parentHistory }); }
    operations.set(operation.operationId, { operationId: operation.operationId, conversationId: operation.conversationId, executionId: execution.id, status: 'accepted', fingerprint: intent, receipt });
    if (action.type !== 'resume') emit(execution, { type: 'operation.accepted', operationId: operation.operationId, remoteId: operation.operationId });
    if (action.type === 'send' || action.type === 'regenerate') queueMicrotask(() => void advance(execution));
    if (action.type === 'respond') {
      const interaction = execution.interactions.get(action.interactionId); interaction.status = 'resolved'; interaction.revision++; interaction.response = structuredClone(action.response);
      emit(execution, { type: 'interaction.resolved', interactionId: interaction.id, response: interaction.response, revision: interaction.revision });
      const call = execution.batch.find((item) => item.interactionId === interaction.id); void decide(execution, call, action.response.approved);
    }
    if (action.type === 'cancelExecution') {
      execution.controller.abort(); expireInteractions(execution);
      for (const call of execution.batch ?? []) if (call.result === undefined && execution.interactions.get(call.interactionId)?.status === 'resolved') tool(execution, call, 'cancelled');
      if (execution.messageId) emit(execution, { type: 'message.completed', messageId: execution.messageId });
      if (execution.round) step(execution, execution.round, 'cancelled'); run(execution, 'cancelled'); status(execution, 'cancelled'); endStreams(execution);
    }
    return { execution, receipt, duplicate: false };
  }
  function json(response, code, value) { response.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); }
  function subscribe(response, execution, cursor, operationId) {
    const after = cursorNumber(cursor, execution.events.length);
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'x-agentdown-execution-id': execution.id, ...(operationId ? { 'x-agentdown-operation-id': operationId, 'x-agentdown-confirmation': 'backend' } : {}) }); response.flushHeaders();
    let ended = false; let heartbeat;
    const subscriber = { write(envelope) { if (ended || response.destroyed) return; response.write(`id: ${envelope.eventId}\ndata: ${JSON.stringify(envelope)}\n\n`); if (response.writableLength > maxBufferedBytes) subscriber.end(); }, end() { if (ended) return; ended = true; clearInterval(heartbeat); execution.subscribers.delete(subscriber); subscribers.delete(subscriber); response.end(); } };
    execution.subscribers.add(subscriber); subscribers.add(subscriber); response.on('close', () => subscriber.end());
    for (const envelope of execution.events.slice(after)) subscriber.write(envelope);
    if (TERMINAL.has(execution.status)) subscriber.end(); else if (!ended) { heartbeat = setInterval(() => { if (!ended) response.write(': heartbeat\n\n'); }, heartbeatMs); heartbeat.unref(); }
  }
  async function serveStatic(url, response) {
    assert(staticDir, 404, 'notFound', 'Endpoint not found.');
    const pathname = decodeURIComponent(url.pathname); const file = resolve(staticDir, `.${pathname === '/' ? '/index.html' : pathname}`);
    assert(file === staticDir || file.startsWith(`${staticDir}${sep}`), 403, 'forbidden', 'Invalid asset path.');
    const actual = await realpath(file).catch(() => undefined); assert(actual && (actual === staticDir || actual.startsWith(`${staticDir}${sep}`)), 404, 'notFound', 'Asset unavailable.');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }[extname(actual)] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(await readFile(actual));
  }
  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    try {
      const url = new URL(request.url, 'http://localhost'); const api = url.pathname.startsWith('/api/'); const origin = request.headers.origin;
      if (origin && api) {
        const ownOrigin = `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
        assert(corsOrigins.has(origin) || origin === ownOrigin, 403, 'forbiddenOrigin', 'This browser origin is not allowed.');
        response.setHeader('access-control-allow-origin', origin); response.setHeader('vary', 'Origin');
        response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); response.setHeader('access-control-allow-headers', 'Authorization, Content-Type, Accept, Last-Event-ID, X-Agentdown-Drop-Ack'); response.setHeader('access-control-expose-headers', 'X-Agentdown-Execution-Id, X-Agentdown-Operation-Id, X-Agentdown-Confirmation');
      }
      if (request.method === 'OPTIONS' && api) { response.writeHead(204); response.end(); return; }
      if (request.method === 'GET' && url.pathname === '/health') { json(response, 200, { status: 'ok', protocol: 'agentdown-model/v1', capabilities: modelCapabilities, authenticated: Boolean(accessToken) }); return; }
      if (api) assert(authMatches(request.headers.authorization, accessToken), 401, 'unauthorized', 'A valid Agentdown access token is required.');
      if (request.method === 'POST' && url.pathname === '/api/operations') {
        const operation = validateOperation(await readJson(request, options.bodyLimit ?? 256 * 1024)); const result = accept(operation);
        if (request.headers['x-agentdown-drop-ack'] === 'true' && !result.duplicate) { request.socket.destroy(); return; }
        if (request.headers.accept?.includes('text/event-stream')) subscribe(response, result.execution, result.receipt.subscription.cursor, operation.operationId); else json(response, 200, result.receipt);
        return;
      }
      const eventsRoute = /^\/api\/executions\/([^/]+)\/events$/.exec(url.pathname);
      if (request.method === 'GET' && eventsRoute) { const execution = executions.get(decodeURIComponent(eventsRoute[1])); assert(execution, 404, 'notFound', 'Execution is unavailable in this server process.'); subscribe(response, execution, url.searchParams.get('cursor') ?? request.headers['last-event-id']); return; }
      const operationRoute = /^\/api\/operations\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && operationRoute) { const operation = operations.get(decodeURIComponent(operationRoute[1])); assert(operation, 404, 'notFound', 'Operation is unavailable in this server process.'); json(response, 200, { status: operation.status, operationId: operation.operationId, receipt: operation.receipt }); return; }
      if (request.method === 'GET' && !api) { await serveStatic(url, response); return; }
      throw new HttpError(404, 'notFound', 'Endpoint not found.');
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const known = error instanceof HttpError; json(response, known ? error.status : error instanceof URIError ? 400 : 500, { error: { code: known ? error.code : 'internal', message: known ? error.message : 'The model server could not handle this request.' } });
    }
  });
  const listen = server.listen.bind(server);
  server.listen = (...args) => { const host = typeof args[0] === 'object' ? args[0].host : typeof args[1] === 'string' ? args[1] : undefined; if (!accessToken && !loopback(host)) throw new Error('Public binding requires AGENTDOWN_ACCESS_TOKEN; use 127.0.0.1 for local development.'); return listen(...args); };
  const close = server.close.bind(server);
  server.close = (callback) => { closing = true; for (const execution of executions.values()) execution.controller.abort(); for (const subscriber of [...subscribers]) subscriber.end(); return close(callback); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST ?? '127.0.0.1'; const port = Number(process.env.PORT ?? 8011);
  const server = createModelServer({ accessToken: process.env.AGENTDOWN_ACCESS_TOKEN, dataDir: process.env.AGENTDOWN_DATA_DIR, staticDir: process.env.AGENTDOWN_STATIC_DIR, corsOrigins: (process.env.AGENTDOWN_CORS_ORIGINS ?? '').split(',').filter(Boolean) });
  server.listen(port, host, () => process.stdout.write(`Agentdown model server: http://${host}:${port}\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
