import type { RuntimeData } from '../runtime/types';

/** SSE 事件附带的后端恢复元数据。 */
export interface AgentdownEventRecoveryMetadata extends RuntimeData {
  eventId: string;
  cursor: number;
}

/** 后端会话归档中的一条原始框架事件。 */
export interface AgentdownBackendConversationEvent<TRawPacket = RuntimeData> {
  cursor: number;
  event_id: string;
  request_id: string;
  event?: string | null;
  data: TRawPacket;
  created_at: string;
}

/** FastAPI 与 Spring 示例后端共同返回的权威会话归档。 */
export interface AgentdownBackendConversationArchive<TRawPacket = RuntimeData> {
  format: 'agentdown.conversation/v1';
  conversation_id: string;
  provider_id: string;
  latest_cursor: number;
  status: string;
  updated_at: string;
  events: AgentdownBackendConversationEvent<TRawPacket>[];
}

/** 从 SSE event id 的最后一段读取单调游标。 */
export function parseAgentdownEventCursor(eventId: string | undefined): number | null {
  if (!eventId) {
    return null;
  }

  const candidate = eventId.slice(eventId.lastIndexOf(':') + 1);
  if (!/^\d+$/.test(candidate)) {
    return null;
  }

  const cursor = Number(candidate);
  return Number.isSafeInteger(cursor) ? cursor : null;
}

/** 为一次发送或 HITL 恢复生成客户端幂等键。 */
export function createAgentdownClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `request:${globalThis.crypto.randomUUID()}`;
  }

  return `request:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/**
 * 维护页面当前已确认的后端游标与事件 id。
 * 它只保存连接态，不承担会话持久化职责。
 */
export class AgentdownBackendRecoveryTracker {
  private readonly seenEventIds = new Set<string>();

  cursor = 0;
  requestId = '';

  beginRequest(): string {
    this.requestId = createAgentdownClientRequestId();
    return this.requestId;
  }

  isDuplicate(metadata: AgentdownEventRecoveryMetadata): boolean {
    return this.seenEventIds.has(metadata.eventId);
  }

  observe(metadata: AgentdownEventRecoveryMetadata): void {
    this.seenEventIds.add(metadata.eventId);
    this.cursor = Math.max(this.cursor, metadata.cursor);
  }

  restore<TRawPacket>(archive: AgentdownBackendConversationArchive<TRawPacket>): void {
    this.cursor = Math.max(0, archive.latest_cursor);
    for (const event of archive.events) {
      this.seenEventIds.add(event.event_id);
      this.cursor = Math.max(this.cursor, event.cursor);
    }
  }

  reset(): void {
    this.cursor = 0;
    this.requestId = '';
    this.seenEventIds.clear();
  }
}

/** 把归档事件恢复成 transport 实时事件相同的元数据形状。 */
export function attachAgentdownRecoveryMetadata<TRawPacket>(
  packet: TRawPacket,
  metadata: AgentdownEventRecoveryMetadata
): TRawPacket {
  if (typeof packet !== 'object' || packet === null || Array.isArray(packet)) {
    return packet;
  }

  return {
    ...packet,
    agentdown_recovery: metadata
  } as TRawPacket;
}
