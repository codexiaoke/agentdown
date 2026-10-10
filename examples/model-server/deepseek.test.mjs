import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeepSeekProvider, DeepSeekError } from './deepseek.mjs';

const encode = new TextEncoder();
const messages = [{ role: 'user', content: '生成报告' }];
const delta = (value, finish = null) => ({ choices: [{ index: 0, delta: value, finish_reason: finish }] });
const frame = value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`;
const response = (frames, { chunkSize = 7, onCancel } = {}) => {
  const bytes = encode.encode(frames.join(''));
  return new Response(new ReadableStream({
    start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize)); controller.close(); },
    cancel() { onCancel?.(); },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
};
const collect = async stream => { const output = []; for await (const item of stream) output.push(item); return output; };
const provider = (fetch, options = {}) => createDeepSeekProvider({ apiKey: 'test-only-key', fetch, ...options });

test('one POST streams UTF-8 text across byte and CRLF boundaries with usage', async () => {
  const requests = [];
  const model = provider(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), method: init.method });
    return response([
      ': keepalive\r\n\r\n', frame(delta({ role: 'assistant', content: '你好💨' })),
      frame(delta({ content: '，报告已就绪' })), frame(delta({}, 'stop')),
      frame({ model: 'deepseek-flash', choices: [], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, ignored: 'secret' } }), frame('[DONE]'),
    ], { chunkSize: 1 });
  });
  const output = await collect(model.stream({ messages }));
  assert.deepEqual(output, [
    { type: 'text', delta: '你好💨' }, { type: 'text', delta: '，报告已就绪' },
    { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }, model: 'deepseek-flash' },
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.model, 'deepseek-flash');
  assert.equal(requests[0].body.max_tokens, 1500);
  assert.equal(requests[0].body.stream, true);
  assert.equal(requests[0].body.stream_options.include_usage, true);
});

test('aggregates interleaved tool fragments and yields only parsed complete calls', async () => {
  const tools = [{ type: 'function', function: { name: 'save_report', parameters: { type: 'object' } } }];
  const model = provider(async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body).tools, tools);
    return response([
      frame(delta({ tool_calls: [
        { index: 1, id: 'call_b', type: 'function', function: { name: 'publish_', arguments: '{"target":' } },
        { index: 0, id: 'call_a', type: 'function', function: { name: 'save_', arguments: '{"title":"' } },
      ] })),
      frame(delta({ tool_calls: [
        { index: 0, function: { name: 'report', arguments: '报告","content":"完成"}' } },
        { index: 1, function: { name: 'summary', arguments: '"本地"}' } },
      ] })), frame(delta({}, 'tool_calls')), frame('[DONE]'),
    ]);
  }, { model: 'deepseek-v4-pro', baseUrl: 'https://api.example.test/v1/' });
  assert.deepEqual(await collect(model.stream({ messages, tools })), [
    { type: 'tool-call', id: 'call_a', name: 'save_report', arguments: { title: '报告', content: '完成' } },
    { type: 'tool-call', id: 'call_b', name: 'publish_summary', arguments: { target: '本地' } },
  ]);
});

test('missing DONE fails after partial text without claiming completion', async () => {
  const seen = [];
  const model = provider(async () => response([frame(delta({ content: '部分' })), frame(delta({}, 'stop'))]));
  await assert.rejects(async () => { for await (const item of model.stream({ messages })) seen.push(item); }, { code: 'incomplete_stream' });
  assert.deepEqual(seen, [{ type: 'text', delta: '部分' }]);
});

test('DONE without finish and malformed JSON are rejected', async () => {
  for (const [frames, code] of [
    [[frame(delta({ content: '部分' })), frame('[DONE]')], 'incomplete_stream'],
    [['data: {invalid}\r\n\r\n'], 'invalid_stream'],
    [[frame(delta({}, 'stop')), frame('[DONE]')], 'empty_response'],
  ]) await assert.rejects(collect(provider(async () => response(frames)).stream({ messages })), { code });
});

test('length termination never yields a tool call, even with valid JSON arguments', async () => {
  const seen = [];
  const model = provider(async () => response([
    frame(delta({ tool_calls: [{ index: 0, id: 'call', type: 'function', function: { name: 'save_report', arguments: '{}' } }] })),
    frame(delta({}, 'length')), frame('[DONE]'),
  ]));
  await assert.rejects(async () => { for await (const item of model.stream({ messages })) seen.push(item); }, { code: 'max_tokens' });
  assert.deepEqual(seen, []);
});

test('truncated, array and conflicting tool arguments cannot yield tools', async () => {
  for (const args of ['{"title":', '[]', '"text"', 'null']) {
    const model = provider(async () => response([
      frame(delta({ tool_calls: [{ index: 0, id: 'call', function: { name: 'save_report', arguments: args } }] })),
      frame(delta({}, 'tool_calls')), frame('[DONE]'),
    ]));
    await assert.rejects(collect(model.stream({ messages })), { code: 'invalid_tool_call' });
  }
});

test('provider HTTP errors are safe and never retried', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [402, 'payment_required'], [429, 'rate_limited'], [500, 'provider_unavailable'], [503, 'provider_unavailable']]) {
    let count = 0;
    const model = provider(async () => { count++; return new Response('private-provider-body test-only-key', { status }); });
    await assert.rejects(collect(model.stream({ messages })), error => {
      assert.ok(error instanceof DeepSeekError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(error.message, /private-provider-body|test-only-key/);
      return true;
    });
    assert.equal(count, 1);
  }
});

test('already aborted request makes no network request', async () => {
  let count = 0;
  const controller = new AbortController();
  controller.abort('do not leak this reason');
  await assert.rejects(collect(provider(async () => { count++; }).stream({ messages, signal: controller.signal })), { code: 'cancelled' });
  assert.equal(count, 0);
});

test('abort during stream stops reading and cancels a body independent of fetch abort handling', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const model = provider(async () => new Response(new ReadableStream({
    start(body) {
      body.enqueue(encode.encode(frame(delta({ content: '部分' }))));
    },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'text/event-stream' } }));
  const stream = model.stream({ messages, signal: controller.signal });
  assert.deepEqual((await stream.next()).value, { type: 'text', delta: '部分' });
  controller.abort('private cancellation');
  await assert.rejects(stream.next(), { code: 'cancelled' });
  assert.equal(cancelled, true);
});

test('caller ending consumption releases the provider body', async () => {
  let cancelled = false;
  const model = provider(async () => new Response(new ReadableStream({
    start(body) { body.enqueue(encode.encode(frame(delta({ content: '部分' })))); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'text/event-stream' } }));
  for await (const item of model.stream({ messages })) { assert.equal(item.type, 'text'); break; }
  assert.equal(cancelled, true);
});

test('request deadline aborts a pending request and reports a safe timeout', async () => {
  const keepAlive = setInterval(() => {}, 100);
  let count = 0;
  try {
    const model = provider(async (_url, init) => {
      count++;
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('private timeout detail')), { once: true }));
    }, { timeoutMs: 10 });
    await assert.rejects(collect(model.stream({ messages })), { code: 'timeout' });
    assert.equal(count, 1);
  } finally { clearInterval(keepAlive); }
});

test('unsafe endpoint configuration and network error details are sanitized', async () => {
  assert.throws(() => provider(async () => {}, { baseUrl: 'https://user:secret@example.test/' }), { code: 'configuration_error' });
  await assert.rejects(collect(provider(async () => { throw new Error('private header test-only-key'); }).stream({ messages })), error => {
    assert.equal(error.code, 'provider_connection');
    assert.doesNotMatch(error.message, /private header|test-only-key/);
    return true;
  });
});

test('environment request limits reach POST body and explicit options take precedence', async () => {
  const previousMax = process.env.DEEPSEEK_MAX_TOKENS;
  const previousTimeout = process.env.DEEPSEEK_TIMEOUT_MS;
  const bodies = [];
  try {
    process.env.DEEPSEEK_MAX_TOKENS = '2048';
    process.env.DEEPSEEK_TIMEOUT_MS = '45000';
    const fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return response([frame(delta({ content: '完成' })), frame(delta({}, 'stop')), frame('[DONE]')]);
    };
    await collect(provider(fetch).stream({ messages }));
    await collect(provider(fetch, { maxTokens: 512, timeoutMs: 1000 }).stream({ messages }));
    assert.equal(bodies[0].max_tokens, 2048);
    assert.equal(bodies[1].max_tokens, 512);
    assert.equal(bodies.length, 2);
  } finally {
    if (previousMax === undefined) delete process.env.DEEPSEEK_MAX_TOKENS;
    else process.env.DEEPSEEK_MAX_TOKENS = previousMax;
    if (previousTimeout === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS;
    else process.env.DEEPSEEK_TIMEOUT_MS = previousTimeout;
  }
});

test('invalid environment request limits fail before a POST; explicit valid options override them', async () => {
  const previousMax = process.env.DEEPSEEK_MAX_TOKENS;
  const previousTimeout = process.env.DEEPSEEK_TIMEOUT_MS;
  let requests = 0;
  const fetch = async () => { requests++; return response([frame(delta({ content: '完成' })), frame(delta({}, 'stop')), frame('[DONE]')]); };
  try {
    for (const value of ['NaN', '0', '-1', '1.5', '']) {
      process.env.DEEPSEEK_MAX_TOKENS = value;
      process.env.DEEPSEEK_TIMEOUT_MS = '90000';
      assert.throws(() => provider(fetch), { code: 'configuration_error' });
    }
    process.env.DEEPSEEK_MAX_TOKENS = '1500';
    for (const value of ['NaN', 'Infinity', '0', '-1', '']) {
      process.env.DEEPSEEK_TIMEOUT_MS = value;
      assert.throws(() => provider(fetch), { code: 'configuration_error' });
    }
    assert.equal(requests, 0);
    process.env.DEEPSEEK_MAX_TOKENS = 'invalid';
    process.env.DEEPSEEK_TIMEOUT_MS = 'invalid';
    await collect(provider(fetch, { maxTokens: 256, timeoutMs: 1000 }).stream({ messages }));
    assert.equal(requests, 1);
  } finally {
    if (previousMax === undefined) delete process.env.DEEPSEEK_MAX_TOKENS;
    else process.env.DEEPSEEK_MAX_TOKENS = previousMax;
    if (previousTimeout === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS;
    else process.env.DEEPSEEK_TIMEOUT_MS = previousTimeout;
  }
});
