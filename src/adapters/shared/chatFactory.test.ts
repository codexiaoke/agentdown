import { describe, expect, it } from 'vitest';
import { resolveFrameworkChatRecoveryUrl } from './chatFactory';

describe('resolveFrameworkChatRecoveryUrl', () => {
  it('derives archive and event endpoints from relative and absolute stream sources', () => {
    expect(resolveFrameworkChatRecoveryUrl(
      '/gateway/api/stream/chat?framework=springai',
      'session:demo/1',
      'archive'
    )).toBe('/gateway/api/v1/conversations/session%3Ademo%2F1?framework=springai');

    expect(resolveFrameworkChatRecoveryUrl(
      new URL('https://agent.example/gateway/api/stream/agno'),
      'session:demo',
      'events',
      'request:active'
    )).toBe(
      'https://agent.example/gateway/api/v1/conversations/session%3Ademo/events?request_id=request%3Aactive'
    );

    expect(resolveFrameworkChatRecoveryUrl(
      'https://agent.example/api/stream/chat?framework=langchain',
      'session:langchain',
      'events',
      'request:langchain'
    )).toBe(
      'https://agent.example/api/v1/conversations/session%3Alangchain/events?framework=langchain&request_id=request%3Alangchain'
    );
  });

  it('requires a custom recovery resolver for non-standard sources', () => {
    expect(() => resolveFrameworkChatRecoveryUrl(
      '/custom-agent-stream',
      'session:demo',
      'archive'
    )).toThrow('Provide recovery.loadArchive and recovery.resolveEventsSource');
  });
});
