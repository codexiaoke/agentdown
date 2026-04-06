import { describe, expect, it, vi } from 'vitest';
import { createJsonRequestInitResolver, createJsonSseTransport } from './transports';

describe('createJsonRequestInitResolver', () => {
  it('converts a JSON body into a POST RequestInit with content-type', async () => {
    const resolveInit = createJsonRequestInitResolver<string>({
      body(source) {
        return {
          prompt: source
        };
      }
    });

    if (typeof resolveInit !== 'function') {
      throw new Error('Expected createJsonRequestInitResolver() to return an init function.');
    }

    const init = await resolveInit('/api/test');

    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"prompt":"/api/test"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });
});

describe('createJsonSseTransport', () => {
  it('requests json SSE with a compact request config', async () => {
    const fetcher = vi.fn(async (_source: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('{"message":"hello"}');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');

      return new Response('data: {"ok":true}\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream'
        }
      });
    });
    const transport = createJsonSseTransport<{ ok: boolean }, string>({
      fetch: fetcher,
      request: {
        body: {
          message: 'hello'
        }
      }
    });
    const packets: Array<{ ok: boolean }> = [];

    for await (const packet of transport.connect('/api/test', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(packets).toEqual([
      {
        ok: true
      }
    ]);
  });
});
