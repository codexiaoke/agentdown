export type RuntimeData = Record<string, unknown>;

export interface RuntimeNode<TData extends RuntimeData = RuntimeData> {
  id: string;
  type: string;
  status?: string;
  parentId?: string | null;
  title?: string;
  message?: string;
  data: TData;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
}

export interface SurfaceBlock<TData extends RuntimeData = RuntimeData> {
  id: string;
  slot: string;
  type: string;
  renderer: string;
  state: 'draft' | 'stable';
  nodeId?: string | null;
  groupId?: string | null;
  content?: string;
  data: TData;
  createdAt?: number;
  updatedAt?: number;
}

export interface RuntimeIntent<TPayload extends RuntimeData = RuntimeData> {
  id: string;
  type: string;
  nodeId?: string | null;
  blockId?: string | null;
  payload: TPayload;
  at: number;
}

export type NodeUpsertCommand = {
  type: 'node.upsert';
  node: RuntimeNode;
};

export type NodePatchCommand = {
  type: 'node.patch';
  id: string;
  patch: Partial<RuntimeNode>;
};

export type NodeRemoveCommand = {
  type: 'node.remove';
  id: string;
};

export type BlockInsertCommand = {
  type: 'block.insert';
  block: SurfaceBlock;
  beforeId?: string;
  afterId?: string;
};

export type BlockUpsertCommand = {
  type: 'block.upsert';
  block: SurfaceBlock;
};

export type BlockPatchCommand = {
  type: 'block.patch';
  id: string;
  patch: Partial<SurfaceBlock>;
};

export type BlockRemoveCommand = {
  type: 'block.remove';
  id: string;
};

export type StreamOpenCommand = {
  type: 'stream.open';
  streamId: string;
  slot: string;
  assembler: string;
  nodeId?: string | null;
  groupId?: string | null;
  data?: RuntimeData;
};

export type StreamDeltaCommand = {
  type: 'stream.delta';
  streamId: string;
  text: string;
};

export type StreamCloseCommand = {
  type: 'stream.close';
  streamId: string;
};

export type StreamAbortCommand = {
  type: 'stream.abort';
  streamId: string;
  reason?: string;
};

export type EventRecordCommand = {
  type: 'event.record';
  event: RuntimeData;
};

export type RuntimeCommand =
  | NodeUpsertCommand
  | NodePatchCommand
  | NodeRemoveCommand
  | BlockInsertCommand
  | BlockUpsertCommand
  | BlockPatchCommand
  | BlockRemoveCommand
  | StreamOpenCommand
  | StreamDeltaCommand
  | StreamCloseCommand
  | StreamAbortCommand
  | EventRecordCommand;

export interface RuntimeCommandHistoryEntry {
  id: string;
  kind: 'command';
  at: number;
  command: RuntimeCommand;
}

export interface RuntimeIntentHistoryEntry {
  id: string;
  kind: 'intent';
  at: number;
  intent: RuntimeIntent;
}

export type RuntimeHistoryEntry = RuntimeCommandHistoryEntry | RuntimeIntentHistoryEntry;

export interface RuntimeSnapshot {
  nodes: RuntimeNode[];
  blocks: SurfaceBlock[];
  intents: RuntimeIntent[];
  history: RuntimeHistoryEntry[];
}

export interface AgentRuntime {
  apply(commands: RuntimeCommand | RuntimeCommand[]): void;
  node(id: string): RuntimeNode | undefined;
  nodes(): RuntimeNode[];
  block(id: string): SurfaceBlock | undefined;
  blocks(slot?: string): SurfaceBlock[];
  children(nodeId: string): RuntimeNode[];
  intents(): RuntimeIntent[];
  history(): RuntimeHistoryEntry[];
  emitIntent(intent: Omit<RuntimeIntent, 'id' | 'at'>): RuntimeIntent;
  snapshot(): RuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

export interface ProtocolContext {
  now(): number;
  makeId(prefix?: string): string;
}

export interface ProtocolRule<TRawEvent> {
  name?: string;
  match: (event: TRawEvent, context: ProtocolContext) => boolean;
  map: (input: {
    event: TRawEvent;
    context: ProtocolContext;
  }) => RuntimeCommand | RuntimeCommand[] | null | void;
}

export interface RuntimeProtocol<TRawPacket = unknown> {
  map(input: {
    packet: TRawPacket;
    context: ProtocolContext;
  }): RuntimeCommand | RuntimeCommand[] | null | void;
}

export interface AssemblerContext {
  now(): number;
  makeId(prefix?: string): string;
}

export interface StreamAssembler {
  open(command: StreamOpenCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  delta(command: StreamDeltaCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  close(command: StreamCloseCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  abort?(command: StreamAbortCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  reset?(): void;
}

export interface TransportContext {
  signal: AbortSignal;
}

export interface TransportAdapter<TSource = unknown, TRawPacket = unknown> {
  connect(source: TSource, context: TransportContext): AsyncIterable<TRawPacket>;
}

export type FlushScheduler = (flush: () => void) => void | (() => void);

export type BridgeStage = 'packet' | 'protocol' | 'stream' | 'flush' | 'consume';

export interface BridgeError<TRawPacket = unknown> extends Error {
  stage: BridgeStage;
  packet?: TRawPacket;
  command?: RuntimeCommand;
  cause?: unknown;
}

export interface ConsumeOptions {
  signal?: AbortSignal;
}

export interface BridgeStatus {
  phase: 'idle' | 'consuming' | 'closed' | 'errored';
  scheduled: boolean;
  pendingCommandCount: number;
  activeStreamCount: number;
  lastFlushAt?: number;
  lastError?: BridgeError;
}

export interface BridgeSnapshot<TRawPacket = unknown> {
  status: BridgeStatus;
  rawPackets: TRawPacket[];
  mappedCommands: RuntimeCommand[][];
}

export interface BridgeHooks<TRawPacket = unknown> {
  onPacket?: (packet: TRawPacket) => void;
  onMapped?: (commands: RuntimeCommand[], packet: TRawPacket) => void;
  onFlush?: (commands: RuntimeCommand[]) => void;
  onError?: (error: BridgeError<TRawPacket>) => void;
}

export interface BridgeOptions<TRawPacket = unknown, TSource = unknown> {
  runtime?: AgentRuntime;
  protocol: RuntimeProtocol<TRawPacket>;
  transport?: TransportAdapter<TSource, TRawPacket>;
  assemblers?: Record<string, StreamAssembler>;
  scheduler?: 'sync' | 'microtask' | 'animation-frame' | FlushScheduler;
  batch?: {
    maxCommands?: number;
    maxLatencyMs?: number;
    coalesceStreamDeltas?: boolean;
  };
  debug?: {
    recordRawPackets?: boolean;
    recordMappedCommands?: boolean;
    maxEntries?: number;
  };
  hooks?: BridgeHooks<TRawPacket>;
}

export interface Bridge<TRawPacket = unknown, TSource = unknown> {
  readonly runtime: AgentRuntime;
  readonly protocol: RuntimeProtocol<TRawPacket>;
  push(packet: TRawPacket | TRawPacket[]): void;
  consume(source: TSource, options?: ConsumeOptions): Promise<void>;
  flush(reason?: string): void;
  reset(): void;
  close(): void;
  status(): BridgeStatus;
  snapshot(): BridgeSnapshot<TRawPacket>;
}

export interface TextAssemblerOptions {
  type?: string;
  draftRenderer?: string;
  stableRenderer?: string;
}
