/**
 * runtime 中通用的结构化数据载荷。
 */
export type RuntimeData = Record<string, unknown>;

/**
 * runtime 节点的通用结构。
 */
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

/**
 * surface 上可渲染 block 的通用结构。
 */
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

/**
 * runtime 记录的意图事件。
 */
export interface RuntimeIntent<TPayload extends RuntimeData = RuntimeData> {
  id: string;
  type: string;
  nodeId?: string | null;
  blockId?: string | null;
  payload: TPayload;
  at: number;
}

/**
 * 创建或覆盖一个节点的命令。
 */
export type NodeUpsertCommand = {
  type: 'node.upsert';
  node: RuntimeNode;
};

/**
 * 局部更新一个节点的命令。
 */
export type NodePatchCommand = {
  type: 'node.patch';
  id: string;
  patch: Partial<RuntimeNode>;
};

/**
 * 删除一个节点的命令。
 */
export type NodeRemoveCommand = {
  type: 'node.remove';
  id: string;
};

/**
 * 按顺序插入一个 block 的命令。
 */
export type BlockInsertCommand = {
  type: 'block.insert';
  block: SurfaceBlock;
  beforeId?: string;
  afterId?: string;
};

/**
 * 创建或覆盖一个 block 的命令。
 */
export type BlockUpsertCommand = {
  type: 'block.upsert';
  block: SurfaceBlock;
};

/**
 * 局部更新一个 block 的命令。
 */
export type BlockPatchCommand = {
  type: 'block.patch';
  id: string;
  patch: Partial<SurfaceBlock>;
};

/**
 * 删除一个 block 的命令。
 */
export type BlockRemoveCommand = {
  type: 'block.remove';
  id: string;
};

/**
 * 打开一个流式内容会话的命令。
 */
export type StreamOpenCommand = {
  type: 'stream.open';
  streamId: string;
  slot: string;
  assembler: string;
  nodeId?: string | null;
  groupId?: string | null;
  data?: RuntimeData;
};

/**
 * 向一个流式内容会话追加文本的命令。
 */
export type StreamDeltaCommand = {
  type: 'stream.delta';
  streamId: string;
  text: string;
};

/**
 * 正常关闭一个流式内容会话的命令。
 */
export type StreamCloseCommand = {
  type: 'stream.close';
  streamId: string;
};

/**
 * 异常中止一个流式内容会话的命令。
 */
export type StreamAbortCommand = {
  type: 'stream.abort';
  streamId: string;
  reason?: string;
};

/**
 * 记录一条原始事件数据的命令。
 */
export type EventRecordCommand = {
  type: 'event.record';
  event: RuntimeData;
};

/**
 * runtime 可执行的所有命令联合类型。
 */
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

/**
 * history 中记录的一条命令执行条目。
 */
export interface RuntimeCommandHistoryEntry {
  id: string;
  kind: 'command';
  at: number;
  command: RuntimeCommand;
}

/**
 * history 中记录的一条 intent 条目。
 */
export interface RuntimeIntentHistoryEntry {
  id: string;
  kind: 'intent';
  at: number;
  intent: RuntimeIntent;
}

/**
 * runtime history 支持的条目类型。
 */
export type RuntimeHistoryEntry = RuntimeCommandHistoryEntry | RuntimeIntentHistoryEntry;

/**
 * runtime 当前完整快照。
 */
export interface RuntimeSnapshot {
  nodes: RuntimeNode[];
  blocks: SurfaceBlock[];
  intents: RuntimeIntent[];
  history: RuntimeHistoryEntry[];
}

/**
 * Agentdown runtime 的核心读写接口。
 */
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

/**
 * protocol 执行时可用的上下文能力。
 */
export interface ProtocolContext {
  now(): number;
  makeId(prefix?: string): string;
}

/**
 * 协议规则的最小单元。
 */
export interface ProtocolRule<TRawEvent> {
  name?: string;
  match: (event: TRawEvent, context: ProtocolContext) => boolean;
  map: (input: {
    event: TRawEvent;
    context: ProtocolContext;
  }) => RuntimeCommand | RuntimeCommand[] | null | void;
}

/**
 * 原始事件协议的统一映射接口。
 */
export interface RuntimeProtocol<TRawPacket = unknown> {
  map(input: {
    packet: TRawPacket;
    context: ProtocolContext;
  }): RuntimeCommand | RuntimeCommand[] | null | void;
}

/**
 * assembler 执行时可用的上下文能力。
 */
export interface AssemblerContext {
  now(): number;
  makeId(prefix?: string): string;
}

/**
 * 负责把流式命令组装成稳定 block 的接口。
 */
export interface StreamAssembler {
  open(command: StreamOpenCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  delta(command: StreamDeltaCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  close(command: StreamCloseCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  abort?(command: StreamAbortCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void;
  reset?(): void;
}

/**
 * transport 消费时传入的上下文对象。
 */
export interface TransportContext {
  signal: AbortSignal;
}

/**
 * 原始数据源到 packet 流的适配器接口。
 */
export interface TransportAdapter<TSource = unknown, TRawPacket = unknown> {
  connect(source: TSource, context: TransportContext): AsyncIterable<TRawPacket>;
}

/**
 * bridge flush 调度函数的签名。
 */
export type FlushScheduler = (flush: () => void) => void | (() => void);

/**
 * bridge 当前错误所处的阶段枚举。
 */
export type BridgeStage = 'packet' | 'protocol' | 'stream' | 'flush' | 'consume';

/**
 * bridge 层抛出的增强错误对象。
 */
export interface BridgeError<TRawPacket = unknown> extends Error {
  stage: BridgeStage;
  packet?: TRawPacket;
  command?: RuntimeCommand;
  cause?: unknown;
}

/**
 * consume 流程支持的可选参数。
 */
export interface ConsumeOptions {
  signal?: AbortSignal;
}

/**
 * bridge 的即时运行状态。
 */
export interface BridgeStatus {
  phase: 'idle' | 'consuming' | 'closed' | 'errored';
  scheduled: boolean;
  pendingCommandCount: number;
  activeStreamCount: number;
  lastFlushAt?: number;
  lastError?: BridgeError;
}

/**
 * bridge 调试用快照。
 */
export interface BridgeSnapshot<TRawPacket = unknown> {
  status: BridgeStatus;
  rawPackets: TRawPacket[];
  mappedCommands: RuntimeCommand[][];
}

/**
 * bridge 生命周期钩子。
 */
export interface BridgeHooks<TRawPacket = unknown> {
  onPacket?: (packet: TRawPacket) => void;
  onMapped?: (commands: RuntimeCommand[], packet: TRawPacket) => void;
  onFlush?: (commands: RuntimeCommand[]) => void;
  onError?: (error: BridgeError<TRawPacket>) => void;
}

/**
 * 创建 bridge 时的配置项。
 */
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

/**
 * bridge 对外暴露的消费与调试接口。
 */
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

/**
 * 文本类 assembler 的基础配置。
 */
export interface TextAssemblerOptions {
  type?: string;
  draftRenderer?: string;
  stableRenderer?: string;
}
