import type { RuntimeData } from '../../runtime/types';
import type {
  AgnoEvent,
  AgnoRequirementPayload,
  AgnoToolExecutionPayload,
  AgnoToolPayload
} from './types';

/**
 * 从未知值中读取非空字符串。
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value
    : undefined;
}

/**
 * 从未知值中读取普通对象。
 */
function readRecord(value: unknown): RuntimeData | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RuntimeData
    : undefined;
}

/**
 * 从未知值中读取对象数组。
 */
function readRecordArray(value: unknown): RuntimeData[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const records = value
    .map((item) => readRecord(item))
    .filter((item): item is RuntimeData => item !== undefined);

  return records.length > 0
    ? records
    : undefined;
}

/**
 * 把 Agno 的事件名统一转换成 snake_case，兼容官方枚举和字符串写法。
 */
export function normalizeAgnoEventName(eventName: string): string {
  const trimmed = eventName.trim().replace(/^RunEvent\./, '');
  const dotted = trimmed.replace(/[.\-]/g, '_');

  if (dotted.includes('_')) {
    return dotted.toLowerCase();
  }

  return dotted
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 读取 Agno 事件里的 tool 对象。
 */
export function extractTool(packet: AgnoEvent): AgnoToolPayload | undefined {
  const tool = readRecord(packet.tool);
  return tool as AgnoToolPayload | undefined;
}

/**
 * 读取 Agno 事件根级的工具执行数组。
 */
export function extractTools(packet: AgnoEvent): AgnoToolExecutionPayload[] {
  return (readRecordArray(packet.tools) ?? []) as AgnoToolExecutionPayload[];
}

/**
 * 读取 Agno 事件里的 requirement 数组。
 */
export function extractRequirements(packet: AgnoEvent): AgnoRequirementPayload[] {
  return (readRecordArray(packet.requirements) ?? []) as AgnoRequirementPayload[];
}

/**
 * 读取 Agno run 的显式 id。
 */
export function extractExplicitRunId(packet: AgnoEvent): string | undefined {
  return readString(packet.run_id)
    ?? readString(packet.runId)
    ?? readString(packet.session_id)
    ?? readString(packet.sessionId);
}

/**
 * 读取 Agno run 的显示标题。
 */
export function extractRunTitle(packet: AgnoEvent): string | undefined {
  if (typeof packet.agent === 'string') {
    return readString(packet.agent);
  }

  const agent = readRecord(packet.agent);
  return readString(agent?.name)
    ?? readString(packet.agent_name)
    ?? readString(packet.name);
}

/**
 * 读取 Agno content 增量文本。
 */
export function extractContent(packet: AgnoEvent): string | undefined {
  return readString(packet.content)
    ?? readString(packet.delta)
    ?? readString(packet.text);
}

/**
 * 尝试把一个 JSON 字符串解析成结构化结果。
 */
function tryParseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * 尝试把 Python `repr` 风格的字典/数组字符串转换成 JSON。
 */
function normalizePythonLiteralString(value: string): string {
  return value
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content: string) => {
      const normalized = content
        .replace(/\\'/g, '\'')
        .replace(/\\\\/g, '\\');

      return JSON.stringify(normalized);
    });
}

/**
 * 尽量把工具结果字符串恢复成结构化对象，方便前端 renderer 直接消费。
 */
function normalizeToolResult(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }

  const directJson = tryParseJsonString(trimmed);

  if (directJson !== trimmed) {
    return directJson;
  }

  const normalizedPythonLiteral = normalizePythonLiteralString(trimmed);
  const parsedPythonLiteral = tryParseJsonString(normalizedPythonLiteral);

  return parsedPythonLiteral !== normalizedPythonLiteral
    ? parsedPythonLiteral
    : value;
}

/**
 * 读取工具名称。
 */
export function extractToolName(tool: AgnoToolPayload | undefined): string | undefined {
  if (!tool) {
    return undefined;
  }

  return readString(tool.tool_name)
    ?? readString(tool.name);
}

/**
 * 读取 requirement 的稳定 id。
 */
export function extractRequirementId(requirement: AgnoRequirementPayload | undefined): string | undefined {
  if (!requirement) {
    return undefined;
  }

  const explicitRequirementId = readString(requirement.id);

  if (explicitRequirementId) {
    return explicitRequirementId;
  }

  const tool = extractRequirementTool(requirement);

  return readString(tool?.approval_id)
    ?? extractToolRawId(tool);
}

/**
 * 读取 requirement 关联的工具执行对象。
 */
export function extractRequirementTool(
  requirement: AgnoRequirementPayload | undefined
): AgnoToolExecutionPayload | undefined {
  if (!requirement) {
    return undefined;
  }

  return readRecord(requirement.tool_execution) as AgnoToolExecutionPayload | undefined;
}

/**
 * 判断 requirement 当前是否仍然在等待人工确认。
 */
export function isPendingConfirmationRequirement(
  requirement: AgnoRequirementPayload | undefined
): boolean {
  const tool = extractRequirementTool(requirement);

  if (!tool || tool.requires_confirmation !== true) {
    return false;
  }

  if (typeof requirement?.confirmation === 'boolean') {
    return false;
  }

  if (typeof tool.confirmed === 'boolean') {
    return false;
  }

  return true;
}

/**
 * 读取 confirmation requirement 当前应显示的 approval 状态。
 */
export function extractRequirementApprovalStatus(
  requirement: AgnoRequirementPayload | undefined
): 'pending' | 'approved' | 'rejected' {
  const tool = extractRequirementTool(requirement);

  if (requirement?.confirmation === true || tool?.confirmed === true) {
    return 'approved';
  }

  if (requirement?.confirmation === false || tool?.confirmed === false) {
    return 'rejected';
  }

  return 'pending';
}

/**
 * 为 requirement 生成一个更适合展示的标题。
 */
export function extractRequirementTitle(
  requirement: AgnoRequirementPayload | undefined
): string | undefined {
  const tool = extractRequirementTool(requirement);
  const toolName = extractToolName(tool);

  return toolName
    ? `确认执行 ${toolName}`
    : undefined;
}

/**
 * 为 requirement 生成一条可读的说明文案。
 */
export function extractRequirementMessage(
  requirement: AgnoRequirementPayload | undefined
): string | undefined {
  const tool = extractRequirementTool(requirement);
  const toolName = extractToolName(tool);
  const toolArgs = extractToolArgs(tool);

  if (!toolName) {
    return undefined;
  }

  if (toolArgs === undefined) {
    return `是否允许执行 ${toolName}？`;
  }

  if (typeof toolArgs === 'string') {
    return `是否允许执行 ${toolName}(${toolArgs})？`;
  }

  try {
    return `是否允许执行 ${toolName}(${JSON.stringify(toolArgs, null, 0)})？`;
  } catch {
    return `是否允许执行 ${toolName}？`;
  }
}

/**
 * 读取工具参数。
 */
export function extractToolArgs(tool: AgnoToolPayload | undefined): unknown {
  if (!tool) {
    return undefined;
  }

  return tool.tool_args ?? tool.arguments ?? tool.args ?? tool.input;
}

/**
 * 读取工具结果。
 */
export function extractToolResult(packet: AgnoEvent, tool: AgnoToolPayload | undefined): unknown {
  return normalizeToolResult(tool?.result ?? tool?.output ?? tool?.content ?? packet.result);
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: AgnoToolPayload | undefined): string | undefined {
  if (!tool) {
    return undefined;
  }

  return readString(tool.id)
    ?? readString(tool.tool_call_id);
}

/**
 * 读取错误消息。
 */
export function extractErrorMessage(packet: AgnoEvent): string {
  const directMessage = readString(packet.message)
    ?? readString(packet.reason);

  if (directMessage) {
    return directMessage;
  }

  if (typeof packet.error === 'string' && packet.error.length > 0) {
    return packet.error;
  }

  return 'Agno stream failed.';
}
