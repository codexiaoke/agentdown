export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };
export type ExecutionStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type EntityStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export type OperationStatus = 'queued' | 'sending' | 'delivered' | 'uncertain' | 'failed';
export type AcceptanceStatus = 'unknown' | 'accepted' | 'rejected';
export interface ResourceReference { readonly uri: string; readonly filename?: string; readonly mime?: string; readonly size?: number }
export interface UserInput { readonly text: string; readonly attachments?: readonly ResourceReference[] }
export type InteractionResponse = JsonValue;
export interface ActionError { readonly code: 'unsupported' | 'invalidInput' | 'conflict' | 'expired' | 'disposed' | 'transport'; readonly message: string }
export type AgentAction =
  | { readonly type: 'send'; readonly input: UserInput; readonly parentExecutionId?: string }
  | { readonly type: 'respond'; readonly interactionId: string; readonly response: InteractionResponse }
  | { readonly type: 'regenerate'; readonly turnId: string; readonly fromExecutionId?: string }
  | { readonly type: 'cancelExecution'; readonly executionId: string }
  | { readonly type: 'disconnect'; readonly executionId?: string }
  | { readonly type: 'resume'; readonly executionId: string }
  | { readonly type: 'retryOperation'; readonly operationId: string }
  | { readonly type: 'surfaceAction'; readonly surfaceId: string; readonly action: JsonValue }
  | { readonly type: 'updateAgentState'; readonly update: JsonValue };
export type BackendAction = Exclude<AgentAction, { type: 'retryOperation' | 'disconnect' }>;
export type DeliveryOutcome =
  | { readonly status: 'delivered'; readonly confirmation: 'transport' | 'backend'; readonly remoteId?: string }
  | { readonly status: 'uncertain'; readonly reason: string }
  | { readonly status: 'failed'; readonly error: ActionError; readonly retryable: boolean };
export interface OperationHandle { readonly operationId: string; readonly attemptId: string; readonly delivery: Promise<DeliveryOutcome> }
export interface Turn { readonly id: string; readonly input: UserInput; readonly inputMessageId: string; readonly executionIds: readonly string[]; readonly parentExecutionId?: string }
export interface Execution { readonly id: string; readonly turnId: string; readonly status: ExecutionStatus; readonly runIds: readonly string[]; readonly previousExecutionId?: string; readonly error?: string }
export interface Run { readonly id: string; readonly executionId: string; readonly status: EntityStatus; readonly title?: string; readonly parentRunId?: string }
export interface Message { readonly id: string; readonly turnId: string; readonly executionId: string; readonly runId?: string; readonly role: 'user' | 'assistant' | 'system' | 'tool'; readonly text: string; readonly status: 'streaming' | 'complete' | 'failed'; readonly createdAt: number }
export interface Step { readonly id: string; readonly executionId: string; readonly runId?: string; readonly title: string; readonly status: EntityStatus; readonly parentStepId?: string }
export interface ToolCall { readonly id: string; readonly executionId: string; readonly runId?: string; readonly name: string; readonly status: EntityStatus; readonly input?: JsonValue; readonly output?: JsonValue }
export interface Interaction { readonly id: string; readonly executionId: string; readonly runId?: string; readonly toolCallId?: string; readonly kind: 'approval' | 'input' | 'form' | 'handoff'; readonly prompt: string; readonly revision: number; readonly status: 'pending' | 'submitting' | 'awaitingConfirmation' | 'resolved' | 'expired' | 'failed'; readonly responseSchema?: JsonObject; readonly operationId?: string; readonly response?: InteractionResponse }
export interface Artifact { readonly id: string; readonly executionId: string; readonly title: string; readonly kind: string; readonly revision: number; readonly status: 'building' | 'ready' | 'failed' | 'removed'; readonly content?: JsonValue; readonly resource?: ResourceReference }
export interface Operation { readonly id: string; readonly action: AgentAction; readonly executionId?: string; readonly turnId?: string; readonly interactionRevision?: number; readonly attemptId: string; readonly attemptCount: number; readonly status: OperationStatus; readonly acceptance: AcceptanceStatus; readonly createdAt: number; readonly error?: ActionError; readonly retryable?: boolean; readonly remoteId?: string }
export interface Connection { readonly streamId: string; readonly executionId: string; readonly epoch: number; readonly status: ConnectionStatus; readonly cursor?: string; readonly error?: string }
export interface AgentCapabilities { readonly maxConcurrentExecutions?: number; readonly respond?: boolean; readonly regenerate?: boolean; readonly cancelExecution?: boolean; readonly resume?: boolean; readonly operationIdempotency?: boolean; readonly operationQuery?: boolean; readonly surfaceAction?: boolean; readonly updateAgentState?: boolean }
export interface SessionSnapshot {
  readonly revision: number; readonly conversationId: string; readonly mode: 'live' | 'replay'; readonly disposed: boolean;
  readonly capabilities: AgentCapabilities;
  readonly turns: Readonly<Record<string, Turn>>; readonly executions: Readonly<Record<string, Execution>>;
  readonly runs: Readonly<Record<string, Run>>; readonly messages: Readonly<Record<string, Message>>;
  readonly steps: Readonly<Record<string, Step>>; readonly tools: Readonly<Record<string, ToolCall>>;
  readonly interactions: Readonly<Record<string, Interaction>>; readonly artifacts: Readonly<Record<string, Artifact>>;
  readonly operations: Readonly<Record<string, Operation>>; readonly connections: Readonly<Record<string, Connection>>;
  readonly messageOrder: readonly string[];
}
export interface SessionArchive { readonly schemaVersion: 1; readonly conversationId: string; readonly adapter: { readonly id: string; readonly version: string }; readonly snapshot: SessionSnapshot; readonly dedupe: Readonly<Record<string, readonly string[]>>; readonly cursors: Readonly<Record<string, string>> }
export interface AgentViewSnapshot {
  readonly revision: number; readonly conversationId: string; readonly mode: 'live' | 'replay'; readonly disposed: boolean;
  readonly messages: readonly Message[]; readonly executions: readonly Execution[]; readonly activeExecutions: readonly Execution[];
  readonly runs: readonly Run[]; readonly steps: readonly Step[]; readonly tools: readonly ToolCall[];
  readonly pendingInteractions: readonly Interaction[]; readonly interactions: readonly Interaction[]; readonly artifacts: readonly Artifact[];
  readonly operations: readonly Operation[]; readonly connections: readonly Connection[];
  readonly canSend: boolean; readonly canResume: boolean; readonly canCancel: boolean;
}
export type DomainEvent =
  | { readonly type: 'execution.updated'; readonly status: ExecutionStatus; readonly error?: string }
  | { readonly type: 'run.upsert'; readonly run: Run }
  | { readonly type: 'message.upsert'; readonly message: Message }
  | { readonly type: 'message.delta'; readonly messageId: string; readonly delta: string }
  | { readonly type: 'message.completed'; readonly messageId: string }
  | { readonly type: 'step.upsert'; readonly step: Step }
  | { readonly type: 'tool.upsert'; readonly tool: ToolCall }
  | { readonly type: 'interaction.upsert'; readonly interaction: Interaction }
  | { readonly type: 'artifact.upsert'; readonly artifact: Artifact }
  | { readonly type: 'operation.accepted'; readonly operationId: string; readonly remoteId?: string }
  | { readonly type: 'operation.rejected'; readonly operationId: string; readonly error: ActionError }
  | { readonly type: 'interaction.resolved'; readonly interactionId: string; readonly response: InteractionResponse; readonly revision: number };
export interface EventEnvelope { readonly streamId: string; readonly executionId: string; readonly eventId?: string; readonly cursor?: string; readonly event: DomainEvent }
export interface SessionContext { readonly conversationId: string; readonly snapshot: SessionSnapshot }
export interface AdapterContext extends SessionContext { readonly signal: AbortSignal }
export interface AdapterOperation { readonly operationId: string; readonly attemptId: string; readonly conversationId: string; readonly action: BackendAction; readonly executionId: string; readonly turnId: string; readonly interactionRevision?: number; readonly cursor?: string; readonly cursors: Readonly<Record<string, string>> }
export interface EventSubscription { readonly streamId: string; readonly executionId: string; readonly cursor?: string; readonly data?: JsonValue }
export interface AdapterReceipt { readonly confirmation: 'transport' | 'backend'; readonly remoteId?: string; readonly subscription?: EventSubscription }
export interface AgentAdapter {
  readonly id: string; readonly version: string;
  readonly capabilities: AgentCapabilities | ((context: SessionContext) => AgentCapabilities);
  execute(operation: AdapterOperation, context: AdapterContext): Promise<AdapterReceipt>;
  events(subscription: EventSubscription, context: AdapterContext): AsyncIterable<EventEnvelope>;
}
export interface AgentSessionOptions { readonly conversationId: string; readonly adapter: AgentAdapter; readonly initialSnapshot?: SessionArchive; readonly mode?: 'live' | 'replay'; readonly clock?: () => number; readonly createId?: (kind: 'operation' | 'attempt' | 'turn' | 'execution' | 'message') => string }
export type CreateAgentSessionOptions = AgentSessionOptions;
export interface AgentSession { readonly conversationId: string; getSnapshot(): SessionSnapshot; subscribe(listener: () => void): () => void; dispatch(action: AgentAction): OperationHandle; exportSnapshot(): SessionArchive; dispose(): void }
export interface AgentActions {
  send(input: UserInput, parentExecutionId?: string): OperationHandle;
  respond(interactionId: string, response: InteractionResponse): OperationHandle;
  regenerate(turnId: string, fromExecutionId?: string): OperationHandle;
  cancel(executionId: string): OperationHandle;
  disconnect(executionId?: string): OperationHandle;
  resume(executionId: string): OperationHandle;
  retryOperation(operationId: string): OperationHandle;
  surfaceAction(surfaceId: string, action: JsonValue): OperationHandle;
  updateAgentState(update: JsonValue): OperationHandle;
  dispatch(action: AgentAction): OperationHandle;
}
