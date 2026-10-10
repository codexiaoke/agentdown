import { createAgentSession, type AgentSessionOptions, type AgentSession, type AgentAdapter, type SessionArchive, type OperationHandle, type AgentViewSnapshot, type Interaction, type JsonValue, type JsonObject, type Artifact } from '@agentdown/core';
import { createReferenceAdapter } from '@agentdown/reference';
import { createBrowserReferenceAdapter } from './browser-adapter';

const configuredEndpointKey = 'agentdown-next:backend-endpoint';
const accessTokenPrefix = 'agentdown-next:backend-access-token:';
const tokenStorageKey = (endpoint: string) => `${accessTokenPrefix}${encodeURIComponent(endpoint)}`;
const environmentLive = import.meta.env.VITE_AGENT_MODE === 'live';
const staticBrowserDemo = import.meta.env.VITE_BROWSER_DEMO === 'true';

export function validateBackendEndpoint(input: string): string {
  const url = new URL(input.trim());
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('真实后端请使用 HTTPS；本机 localhost 或 loopback 可以使用 HTTP。');
  if (url.username || url.password || url.search || url.hash) throw new Error('后端 URL 不能包含用户名、密码、查询参数或片段。');
  return url.href.replace(/\/$/, '');
}

function readBackendConfiguration() {
  let endpoint = '';
  let token = '';
  let error = '';
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(configuredEndpointKey);
      if (stored) endpoint = validateBackendEndpoint(stored);
    } catch { error = '后端连接设置无法读取，请重新设置连接。'; }
  }
  const live = environmentLive || endpoint.length > 0;
  if (!endpoint && live && typeof window !== 'undefined') endpoint = new URL(`${import.meta.env.BASE_URL}api`, window.location.origin).href.replace(/\/$/, '');
  if (live && typeof window !== 'undefined') {
    try { token = window.sessionStorage.getItem(tokenStorageKey(endpoint)) ?? ''; }
    catch { error = '后端访问令牌无法读取，请重新设置连接。'; }
  }
  return { endpoint, token, live, error };
}

// Read once at module initialization; credentials stay outside Session and archives.
const runtimeBackend = readBackendConfiguration();
export const backendSettings = Object.freeze({ endpoint: runtimeBackend.endpoint, hasToken: runtimeBackend.token.length > 0, error: runtimeBackend.error });
export const realAgentMode = runtimeBackend.live;
export const browserDemo = staticBrowserDemo && !realAgentMode;
export const prototypeModeLabel = realAgentMode ? '真实 Agent' : '无模型演示';
export const prototypeFootnote = realAgentMode
  ? '真实模型由应用后端调用 · 浏览器只连接所配置的后端，内容以安全纯文本呈现。'
  : browserDemo ? '浏览器演示后端 · 无真实模型调用 · 演示数据保存在当前浏览器。'
    : '无模型参考后端 · 本阶段验证完整交互流程，内容以安全纯文本呈现。';

export function saveBackendConfiguration(endpoint: string, token: string): void {
  const checked = validateBackendEndpoint(endpoint);
  const checkedToken = token.trim();
  if (/[\r\n]/.test(checkedToken)) throw new Error('后端访问令牌格式无效。');
  window.localStorage.setItem(configuredEndpointKey, checked);
  if (checkedToken) window.sessionStorage.setItem(tokenStorageKey(checked), checkedToken);
  else window.sessionStorage.removeItem(tokenStorageKey(checked));
  if (runtimeBackend.endpoint && runtimeBackend.endpoint !== checked) window.sessionStorage.removeItem(tokenStorageKey(runtimeBackend.endpoint));
  runtimeBackend.token = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.assign(url.href);
}

export function resetBackendConfiguration(): void {
  window.localStorage.removeItem(configuredEndpointKey);
  window.sessionStorage.removeItem(tokenStorageKey(runtimeBackend.endpoint));
  runtimeBackend.token = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.assign(url.href);
}
export function frameworkHref(framework: 'vue' | 'react'): string {
  return `${import.meta.env.BASE_URL}${framework}.html`;
}
export function createPrototypeAdapter() {
  if (browserDemo) return createBrowserReferenceAdapter();
  return createReferenceAdapter({
    endpoint: realAgentMode ? runtimeBackend.endpoint : `${import.meta.env.BASE_URL}api`,
    ...(realAgentMode ? {
      id: 'agentdown-model-http', version: '1',
      headers: (): Record<string, string> => runtimeBackend.token ? { Authorization: `Bearer ${runtimeBackend.token}` } : {},
    } : {}),
  });
}

export const statusLabels: Readonly<Record<string, string>> = {
  idle: '尚未连接', connecting: '正在连接', connected: '已连接', reconnecting: '正在重连', disconnected: '连接已断开', error: '连接错误',
  pending: '等待开始', running: '正在执行', waiting: '等待人工决定', completed: '已完成', failed: '失败', cancelled: '已取消',
  queued: '等待投递', sending: '正在投递', delivered: '已送达', uncertain: '投递结果不确定', unknown: '尚未确认', accepted: '后端已接受', rejected: '后端已拒绝',
  submitting: '正在提交', awaitingConfirmation: '等待后端确认', resolved: '后端已确认', expired: '已过期',
  building: '正在生成', ready: '已就绪', removed: '已移除', streaming: '生成中', complete: '已完成',
};

export function label(status: string): string { return statusLabels[status] ?? status; }
export function text(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

export function toolTitle(name: string): string {
  return ({ save_report: realAgentMode ? '保存报告' : '保存演示报告', publish_summary: '公开报告摘要' } as Readonly<Record<string, string>>)[name] ?? name;
}

export function toolOutput(value: JsonValue | undefined): string {
  if (isObject(value) && typeof value.approved === 'boolean') return value.approved ? '批准已确认，操作已完成。' : '拒绝已确认，操作已跳过。';
  return text(value);
}

export interface ReportView {
  summary: string;
  input: string;
  decisions: readonly { action: string; decision: string }[];
}

export function artifactReport(artifact: Artifact): ReportView | null {
  const content = artifact.content;
  if (artifact.kind !== 'report' || !isObject(content) || typeof content.summary !== 'string') return null;
  const decisions = Array.isArray(content.decisions) ? content.decisions : [];
  return {
    summary: content.summary,
    input: typeof content.input === 'string' ? content.input : '',
    decisions: decisions.filter(isObject).map(item => ({
      action: typeof item.action === 'string' ? toolTitle(item.action) : '操作',
      decision: item.approved === true ? '批准' : item.approved === false ? '拒绝' : '尚未确认',
    })),
  };
}

export function interactionConfirmation(interaction: Interaction): string {
  if (interaction.status !== 'resolved') return label(interaction.status);
  const response = interaction.response;
  if (response !== null && typeof response === 'object' && !Array.isArray(response)) {
    if ('approved' in response && response.approved === true) return '后端已确认批准';
    if ('approved' in response && response.approved === false) return '后端已确认拒绝';
  }
  return '后端已确认';
}

export function currentExecution(view: AgentViewSnapshot) { return view.executions[view.executions.length - 1]; }
export function currentConnection(view: AgentViewSnapshot) {
  const execution = currentExecution(view);
  const connections = view.connections.filter(connection => connection.executionId === execution?.id);
  return connections[connections.length - 1];
}

export function uncertainOperations(view: AgentViewSnapshot) {
  return view.operations.filter(operation => operation.status === 'uncertain' && operation.acceptance === 'unknown');
}

function backendScope(): string { return encodeURIComponent(runtimeBackend.endpoint); }
export function archiveKey(framework: 'vue' | 'react') {
  return realAgentMode ? `agentdown-next:${framework}:live:${backendScope()}:archive` : `agentdown-next:${framework}:${browserDemo ? 'browser:' : ''}archive`;
}

function conversationId(framework: 'vue' | 'react'): string {
  if (!realAgentMode) return `demo-${framework}`;
  const fresh = () => `agent-${framework}-${globalThis.crypto.randomUUID()}`;
  if (typeof window === 'undefined') return fresh();
  const key = `agentdown-next:${framework}:live:${backendScope()}:conversation`;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored && /^agent-(vue|react)-[a-zA-Z0-9-]+$/.test(stored)) return stored;
    const created = fresh();
    window.localStorage.setItem(key, created);
    return created;
  } catch { return fresh(); }
}

export function initialOptions(framework: 'vue' | 'react', adapter: AgentAdapter): { options: AgentSessionOptions; error: string } {
  const mode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'replay' ? 'replay' : 'live';
  const options: AgentSessionOptions = { conversationId: conversationId(framework), adapter, mode };
  if (typeof window === 'undefined') return { options, error: '' };
  try {
    const raw = window.localStorage.getItem(archiveKey(framework));
    if (!raw) return { options, error: mode === 'replay' ? '没有已保存的会话，可以返回实时模式开始任务。' : backendSettings.error };
    const candidate: unknown = JSON.parse(raw);
    if (!candidate || typeof candidate !== 'object' || !('schemaVersion' in candidate) || candidate.schemaVersion !== 1 || !('conversationId' in candidate) || candidate.conversationId !== options.conversationId) {
      throw new Error('存档格式或会话身份不匹配。');
    }
    // The constructor validates the complete core archive. This passive probe
    // opens no connection and protects both framework mounts from corrupt data.
    const initialSnapshot = candidate as SessionArchive;
    const probe = createAgentSession({ ...options, initialSnapshot });
    probe.dispose();
    return { options: { ...options, initialSnapshot }, error: '' };
  } catch {
    return { options, error: '保存的会话无法读取，已打开空白工作台。浏览器存档可能损坏或不可用。' };
  }
}

export function saveAndNavigate(session: AgentSession, framework: 'vue' | 'react', mode: 'live' | 'replay'): void {
  const archive = session.exportSnapshot();
  const serialized = JSON.stringify(archive);
  window.localStorage.setItem(archiveKey(framework), serialized);
  if (window.localStorage.getItem(archiveKey(framework)) !== serialized) throw new Error('会话保存失败，请检查浏览器存储。');
  const url = new URL(window.location.href);
  if (mode === 'replay') url.searchParams.set('mode', 'replay');
  else url.searchParams.delete('mode');
  window.location.assign(url.href);
}

export function returnToLive(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.assign(url.href);
}

export function reportDelivery(handle: OperationHandle, onError: (message: string) => void): void {
  void handle.delivery.then(outcome => {
    if (outcome.status === 'failed') onError(outcome.error.message);
  }, () => onError('操作投递失败，请检查连接状态。'));
}
