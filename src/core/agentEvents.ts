import type { AguiNodeKind, AguiRuntimeEvent } from './types';

/** Agentdown 当前内置支持并推荐使用的核心事件名。 */
export type CoreAguiEventType =
  | 'run.started'
  | 'run.finished'
  | 'user.message.created'
  | 'agent.assigned'
  | 'agent.started'
  | 'agent.thinking'
  | 'agent.blocked'
  | 'agent.finished'
  | 'team.finished'
  | 'tool.started'
  | 'tool.finished'
  | 'artifact.created'
  | 'approval.requested'
  | 'approval.resolved'
  | 'handoff.created'
  | 'node.error';

/** 所有核心事件共享的基础字段。 */
export interface CoreEventInput {
  /** 当前事件作用的节点 id。 */
  nodeId: string;
  /** 当前事件声明的父节点 id。 */
  parentId?: string;
  /** 当前事件的展示标题。 */
  title?: string;
  /** 当前事件的展示文案。 */
  message?: string;
  /** 当前事件携带的扩展信息。 */
  meta?: Record<string, unknown>;
  /** 指定事件时间，未提供时由 runtime 自动补齐。 */
  at?: number;
}

/** 带节点 kind 的事件输入。 */
export interface KindEventInput extends CoreEventInput {
  /** 节点种类，如 leader、agent、tool。 */
  kind?: AguiNodeKind;
}

/** 工具事件使用的输入。 */
export interface ToolEventInput extends CoreEventInput {
  /** 对应工具名。 */
  toolName: string;
}

/** artifact 事件使用的输入。 */
export interface ArtifactEventInput extends CoreEventInput {
  /** artifact 唯一标识。 */
  artifactId: string;
  /** artifact 种类，如 file、diff、report。 */
  artifactKind: 'file' | 'diff' | 'report' | 'image' | 'json' | 'table';
  /** artifact 标签。 */
  label?: string;
  /** artifact 链接或文件地址。 */
  href?: string;
}

/** approval 事件使用的输入。 */
export interface ApprovalEventInput extends CoreEventInput {
  /** 审批项唯一标识。 */
  approvalId: string;
  /** 审批状态。 */
  decision?: 'approved' | 'rejected' | 'changes_requested';
}

/** handoff 事件使用的输入。 */
export interface HandoffEventInput extends CoreEventInput {
  /** 交接目标，如团队、agent、human。 */
  target: string;
}

/** run.started 事件。 */
export interface RunStartedEvent extends AguiRuntimeEvent {
  type: 'run.started';
}

/** run.finished 事件。 */
export interface RunFinishedEvent extends AguiRuntimeEvent {
  type: 'run.finished';
}

/** user.message.created 事件。 */
export interface UserMessageCreatedEvent extends AguiRuntimeEvent {
  type: 'user.message.created';
}

/** agent.assigned 事件。 */
export interface AgentAssignedEvent extends AguiRuntimeEvent {
  type: 'agent.assigned';
}

/** agent.started 事件。 */
export interface AgentStartedEvent extends AguiRuntimeEvent {
  type: 'agent.started';
}

/** agent.thinking 事件。 */
export interface AgentThinkingEvent extends AguiRuntimeEvent {
  type: 'agent.thinking';
}

/** agent.blocked 事件。 */
export interface AgentBlockedEvent extends AguiRuntimeEvent {
  type: 'agent.blocked';
}

/** agent.finished 事件。 */
export interface AgentFinishedEvent extends AguiRuntimeEvent {
  type: 'agent.finished';
}

/** team.finished 事件。 */
export interface TeamFinishedEvent extends AguiRuntimeEvent {
  type: 'team.finished';
}

/** tool.started 事件。 */
export interface ToolStartedEvent extends AguiRuntimeEvent {
  type: 'tool.started';
}

/** tool.finished 事件。 */
export interface ToolFinishedEvent extends AguiRuntimeEvent {
  type: 'tool.finished';
}

/** artifact.created 事件。 */
export interface ArtifactCreatedEvent extends AguiRuntimeEvent {
  type: 'artifact.created';
  /** artifact 唯一标识。 */
  artifactId: string;
  /** artifact 种类。 */
  artifactKind: ArtifactEventInput['artifactKind'];
  /** artifact 标签。 */
  label?: string;
  /** artifact 地址。 */
  href?: string;
}

/** approval.requested 事件。 */
export interface ApprovalRequestedEvent extends AguiRuntimeEvent {
  type: 'approval.requested';
  /** 审批项唯一标识。 */
  approvalId: string;
}

/** approval.resolved 事件。 */
export interface ApprovalResolvedEvent extends AguiRuntimeEvent {
  type: 'approval.resolved';
  /** 审批项唯一标识。 */
  approvalId: string;
  /** 审批结果。 */
  decision?: ApprovalEventInput['decision'];
}

/** handoff.created 事件。 */
export interface HandoffCreatedEvent extends AguiRuntimeEvent {
  type: 'handoff.created';
  /** 交接目标。 */
  target: string;
}

/** node.error 事件。 */
export interface NodeErrorEvent extends AguiRuntimeEvent {
  type: 'node.error';
}

/** Agentdown 官方核心事件联合类型。 */
export type CoreAguiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | UserMessageCreatedEvent
  | AgentAssignedEvent
  | AgentStartedEvent
  | AgentThinkingEvent
  | AgentBlockedEvent
  | AgentFinishedEvent
  | TeamFinishedEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | ArtifactCreatedEvent
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent
  | HandoffCreatedEvent
  | NodeErrorEvent;

/** 统一创建带 type 的核心事件对象。 */
function createCoreEvent<TEvent extends AguiRuntimeEvent>(event: TEvent): TEvent {
  return event;
}

/** 创建 run.started 事件。 */
export function runStarted(input: CoreEventInput): RunStartedEvent {
  return createCoreEvent<RunStartedEvent>({
    type: 'run.started',
    ...input
  });
}

/** 创建 run.finished 事件。 */
export function runFinished(input: CoreEventInput): RunFinishedEvent {
  return createCoreEvent<RunFinishedEvent>({
    type: 'run.finished',
    ...input
  });
}

/** 创建 user.message.created 事件。 */
export function userMessageCreated(input: CoreEventInput): UserMessageCreatedEvent {
  return createCoreEvent<UserMessageCreatedEvent>({
    type: 'user.message.created',
    ...input
  });
}

/** 创建 agent.assigned 事件。 */
export function agentAssigned(input: KindEventInput): AgentAssignedEvent {
  return createCoreEvent<AgentAssignedEvent>({
    type: 'agent.assigned',
    ...input
  });
}

/** 创建 agent.started 事件。 */
export function agentStarted(input: KindEventInput): AgentStartedEvent {
  return createCoreEvent<AgentStartedEvent>({
    type: 'agent.started',
    ...input
  });
}

/** 创建 agent.thinking 事件。 */
export function agentThinking(input: KindEventInput): AgentThinkingEvent {
  return createCoreEvent<AgentThinkingEvent>({
    type: 'agent.thinking',
    ...input
  });
}

/** 创建 agent.blocked 事件。 */
export function agentBlocked(input: KindEventInput): AgentBlockedEvent {
  return createCoreEvent<AgentBlockedEvent>({
    type: 'agent.blocked',
    ...input
  });
}

/** 创建 agent.finished 事件。 */
export function agentFinished(input: KindEventInput): AgentFinishedEvent {
  return createCoreEvent<AgentFinishedEvent>({
    type: 'agent.finished',
    ...input
  });
}

/** 创建 team.finished 事件。 */
export function teamFinished(input: KindEventInput): TeamFinishedEvent {
  return createCoreEvent<TeamFinishedEvent>({
    type: 'team.finished',
    ...input
  });
}

/** 创建 tool.started 事件。 */
export function toolStarted(input: ToolEventInput): ToolStartedEvent {
  return createCoreEvent<ToolStartedEvent>({
    type: 'tool.started',
    ...input
  });
}

/** 创建 tool.finished 事件。 */
export function toolFinished(input: ToolEventInput): ToolFinishedEvent {
  return createCoreEvent<ToolFinishedEvent>({
    type: 'tool.finished',
    ...input
  });
}

/** 创建 artifact.created 事件。 */
export function artifactCreated(input: ArtifactEventInput): ArtifactCreatedEvent {
  return createCoreEvent<ArtifactCreatedEvent>({
    type: 'artifact.created',
    ...input
  });
}

/** 创建 approval.requested 事件。 */
export function approvalRequested(input: ApprovalEventInput): ApprovalRequestedEvent {
  const { decision: _ignoredDecision, ...rest } = input;

  return createCoreEvent<ApprovalRequestedEvent>({
    type: 'approval.requested',
    ...rest
  });
}

/** 创建 approval.resolved 事件。 */
export function approvalResolved(input: ApprovalEventInput): ApprovalResolvedEvent {
  return createCoreEvent<ApprovalResolvedEvent>({
    type: 'approval.resolved',
    ...input
  });
}

/** 创建 handoff.created 事件。 */
export function handoffCreated(input: HandoffEventInput): HandoffCreatedEvent {
  return createCoreEvent<HandoffCreatedEvent>({
    type: 'handoff.created',
    ...input
  });
}

/** 创建 node.error 事件。 */
export function nodeError(input: KindEventInput): NodeErrorEvent {
  return createCoreEvent<NodeErrorEvent>({
    type: 'node.error',
    ...input
  });
}
