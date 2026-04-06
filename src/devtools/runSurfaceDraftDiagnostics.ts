import type {
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock,
  SurfaceBlockState,
  SurfaceBlockStreamingDraftData
} from '../runtime/types';
import type {
  StreamingMarkdownDraftMode,
  StreamingMarkdownTailKind,
  StreamingMarkdownTailStability
} from '../runtime/streamingMarkdown';
import { isRunSurfaceDraftLikeBlock } from '../surface/messageActions';
import { resolveSurfaceBlockStreamingDraftData } from '../surface/draftMetadata';

/**
 * draft 诊断里可见的稳定化类型键。
 */
export type RunSurfaceDraftDiagnosticKind = StreamingMarkdownTailKind | 'unknown';

/**
 * draft 诊断里可见的稳定化策略键。
 */
export type RunSurfaceDraftDiagnosticStability = StreamingMarkdownTailStability | 'unknown';

/**
 * devtools 中直接展示的 draft DOM 属性快照。
 *
 * 这些字段和 `RunSurfaceBlock` 上真实渲染出来的 `data-*` 属性保持一致，
 * 方便用户对照页面元素和 overlay 面板。
 */
export interface RunSurfaceDraftDomAttributes {
  /** 当前 draft 对应的显示模式。 */
  'data-draft-mode'?: StreamingMarkdownDraftMode;
  /** 当前 draft 对应的结构类型。 */
  'data-draft-kind'?: StreamingMarkdownTailKind;
  /** 当前 draft 对应的稳定化策略。 */
  'data-draft-stability'?: StreamingMarkdownTailStability;
  /** 当前 draft 是否已经跨多行。 */
  'data-draft-multiline'?: 'true' | 'false';
}

/**
 * 对“为什么这段内容还没 stable”的一句话解释。
 */
export interface RunSurfaceDraftReason {
  /** 面板里更短的标题。 */
  title: string;
  /** 面板里更完整的解释。 */
  description: string;
}

/**
 * 单个 draft block 经整理后的诊断结果。
 */
export interface RunSurfaceDraftDiagnostic {
  /** 当前 block id。 */
  blockId: string;
  /** block 所在 slot。 */
  slot: string;
  /** 当前 renderer key。 */
  renderer: string;
  /** 运行态状态。 */
  state: SurfaceBlockState;
  /** 当前会话 id。 */
  conversationId: string | null;
  /** 当前轮次 id。 */
  turnId: string | null;
  /** 当前消息 id。 */
  messageId: string | null;
  /** 当前消息分组 id。 */
  groupId: string | null;
  /** 关联的 runtime node id。 */
  nodeId: string | null;
  /** 关联 node 的标题。 */
  nodeTitle: string | null;
  /** 关联 node 的状态。 */
  nodeStatus: string | null;
  /** 当前 draft 归一化后的显示模式。 */
  draftMode: StreamingMarkdownDraftMode;
  /** 当前 draft 显示模式的中文说明。 */
  draftModeLabel: string;
  /** 当前 draft 推断出的结构类型。 */
  draftKind: RunSurfaceDraftDiagnosticKind;
  /** 当前 draft 结构类型的中文说明。 */
  draftKindLabel: string;
  /** 当前 draft 采用的稳定化策略。 */
  draftStability: RunSurfaceDraftDiagnosticStability;
  /** 当前 draft 稳定化策略的中文说明。 */
  draftStabilityLabel: string;
  /** 当前 draft 是否已跨多行。 */
  multiline: boolean;
  /** 当前 draft 内容长度。 */
  contentLength: number;
  /** 当前 draft 内容摘要。 */
  contentPreview: string;
  /** 供 devtools 对照的 DOM `data-*` 属性快照。 */
  domAttributes: RunSurfaceDraftDomAttributes;
  /** 当前 draft 仍未 stable 的解释。 */
  reason: RunSurfaceDraftReason;
  /** 最近更新时间。 */
  updatedAt?: number;
}

/**
 * 当前整页 draft 诊断汇总。
 */
export interface RunSurfaceDraftDiagnosticsSummary {
  /** 当前 slot 下的总 block 数。 */
  totalBlockCount: number;
  /** 当前仍处于 draft-like 的 block 数。 */
  draftBlockCount: number;
  /** `text` 模式的 draft 数。 */
  textModeCount: number;
  /** `preview` 模式的 draft 数。 */
  previewModeCount: number;
  /** `hidden` 模式的 draft 数。 */
  hiddenModeCount: number;
  /** 已跨多行的 draft 数。 */
  multilineCount: number;
  /** 各种结构类型的计数。 */
  kindCounts: Partial<Record<RunSurfaceDraftDiagnosticKind, number>>;
  /** 各种稳定化策略的计数。 */
  stabilityCounts: Partial<Record<RunSurfaceDraftDiagnosticStability, number>>;
}

/**
 * 完整的 draft 诊断结果集合。
 */
export interface RunSurfaceDraftDiagnosticsResult {
  /** 当前命中的所有 draft block。 */
  diagnostics: RunSurfaceDraftDiagnostic[];
  /** 汇总信息。 */
  summary: RunSurfaceDraftDiagnosticsSummary;
}

/**
 * 生成 draft 诊断时可选的过滤与展示参数。
 */
export interface ResolveRunSurfaceDraftDiagnosticsOptions {
  /** 只分析指定 slot。 */
  slot?: string;
  /** 文本摘要最长保留多少字符。 */
  previewChars?: number;
}

/**
 * 各种 draft 显示模式对应的中文标签。
 */
function resolveDraftModeLabel(mode: StreamingMarkdownDraftMode): string {
  switch (mode) {
    case 'preview':
      return '结构预览';
    case 'hidden':
      return '暂时隐藏';
    case 'text':
    default:
      return '原文草稿';
  }
}

/**
 * 各种 draft 结构类型对应的中文标签。
 */
function resolveDraftKindLabel(kind: RunSurfaceDraftDiagnosticKind): string {
  switch (kind) {
    case 'blank':
      return '空白尾部';
    case 'line':
      return '单行片段';
    case 'paragraph':
      return '段落';
    case 'blockquote':
      return '引用块';
    case 'list':
      return '列表';
    case 'table':
      return '表格';
    case 'fence':
      return '代码围栏';
    case 'math':
      return '数学块';
    case 'thought':
      return 'Thought 容器';
    case 'directive':
      return '指令块';
    case 'setext-heading':
      return 'Setext 标题';
    case 'html':
      return 'HTML 块';
    case 'unknown':
    default:
      return '未知结构';
  }
}

/**
 * 各种 draft 稳定化策略对应的中文标签。
 */
function resolveDraftStabilityLabel(stability: RunSurfaceDraftDiagnosticStability): string {
  switch (stability) {
    case 'line-stable':
      return '单行稳定';
    case 'separator-stable':
      return '分隔线稳定';
    case 'candidate-stable':
      return '候选稳定';
    case 'close-stable':
      return '闭合后稳定';
    case 'unknown':
    default:
      return '未声明';
  }
}

/**
 * 把 block 内容整理成适合 overlay 展示的单行摘要。
 */
function createDraftContentPreview(content: string | undefined, previewChars: number): string {
  const normalized = (content ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return '(当前还没有可见内容)';
  }

  return normalized.length > previewChars
    ? `${normalized.slice(0, previewChars)}...`
    : normalized;
}

/**
 * 安全读取 block 关联的 node。
 */
function resolveDraftNode(
  block: SurfaceBlock,
  nodesById: Map<string, RuntimeNode>
): RuntimeNode | undefined {
  if (!block.nodeId) {
    return undefined;
  }

  return nodesById.get(block.nodeId);
}

/**
 * 为当前 draft 生成一句“为什么还没 stable”的解释。
 */
export function resolveRunSurfaceDraftReason(
  data: SurfaceBlockStreamingDraftData
): RunSurfaceDraftReason {
  switch (data.streamingDraftKind) {
    case 'fence':
      return {
        title: '等待代码围栏闭合',
        description: '只有拿到完整的结束 fence 之后，代码块才会从 draft 提升成 stable。'
      };
    case 'table':
      if (data.streamingDraftStability === 'separator-stable') {
        return {
          title: '等待表头和分隔线完整',
          description: '表格至少要拿到完整表头与分隔线，assembler 才会把它提交成 stable block。'
        };
      }

      return {
        title: '等待表格边界明确',
        description: '当前表格可能还会继续追加行，尾部会先保留在 draft，避免半截表格直接闪出来。'
      };
    case 'html':
      return {
        title: '等待 HTML 结构闭合',
        description: '这段内容看起来像 block HTML，只有结构闭合后才会安全进入 stable。'
      };
    case 'math':
      return {
        title: '等待数学块闭合',
        description: '公式块需要成对的分隔符，未闭合前会先留在 draft。'
      };
    case 'thought':
      return {
        title: '等待 Thought 容器闭合',
        description: 'Thought 指令块还没有拿到完整结束标记，所以暂时保持在 draft。'
      };
    case 'directive':
      return {
        title: '等待指令块完整',
        description: '这段内容命中了 Agentdown 指令语法，assembler 会等结构完整后再提交。'
      };
    case 'setext-heading':
      return {
        title: '等待标题下划线完整',
        description: 'Setext 标题要等下划线边界明确后，才会从草稿提升成稳定标题块。'
      };
    case 'blockquote':
      return {
        title: '等待引用块边界明确',
        description: '引用内容可能还会继续增长，当前先留在 draft，避免块级结构过早拆分。'
      };
    case 'list':
      return {
        title: '等待列表边界明确',
        description: '列表项可能还会继续追加，assembler 会等边界更明确后再提交成 stable。'
      };
    case 'line':
      return {
        title: '等待当前行继续输出',
        description: '当前尾部更像一行尚未结束的片段，先按 draft 展示会更自然。'
      };
    case 'blank':
      return {
        title: '当前尾部只有空白',
        description: '可见内容已经提交，剩下的尾部只是空白或分隔中的占位，因此暂时不进入 stable。'
      };
    case 'paragraph':
      return {
        title: '等待段落边界明确',
        description: '这段内容还可能继续增长成完整段落，所以先保留在 draft。'
      };
    default:
      return {
        title: '等待结构稳定',
        description: '当前尾部还没有达到安全提交条件，assembler 会继续把它保留在 draft。'
      };
  }
}

/**
 * 把单个 draft-like block 收敛成 devtools 可直接展示的诊断条目。
 */
export function resolveRunSurfaceDraftDiagnostic(
  block: SurfaceBlock,
  nodesById: Map<string, RuntimeNode>,
  previewChars = 96
): RunSurfaceDraftDiagnostic | null {
  if (!isRunSurfaceDraftLikeBlock(block)) {
    return null;
  }

  const data = resolveSurfaceBlockStreamingDraftData(block.data);
  const node = resolveDraftNode(block, nodesById);
  const draftMode = data.streamingDraftMode ?? 'text';
  const draftKind = data.streamingDraftKind ?? 'unknown';
  const draftStability = data.streamingDraftStability ?? 'unknown';
  const multiline = data.streamingDraftMultiline ?? false;

  return {
    blockId: block.id,
    slot: block.slot,
    renderer: block.renderer,
    state: block.state,
    conversationId: block.conversationId ?? null,
    turnId: block.turnId ?? null,
    messageId: block.messageId ?? null,
    groupId: block.groupId ?? null,
    nodeId: block.nodeId ?? null,
    nodeTitle: node?.title ?? null,
    nodeStatus: node?.status ?? null,
    draftMode,
    draftModeLabel: resolveDraftModeLabel(draftMode),
    draftKind,
    draftKindLabel: resolveDraftKindLabel(draftKind),
    draftStability,
    draftStabilityLabel: resolveDraftStabilityLabel(draftStability),
    multiline,
    contentLength: typeof block.content === 'string' ? block.content.length : 0,
    contentPreview: createDraftContentPreview(block.content, previewChars),
    domAttributes: {
      'data-draft-mode': draftMode,
      ...(data.streamingDraftKind !== undefined
        ? {
            'data-draft-kind': data.streamingDraftKind
          }
        : {}),
      ...(data.streamingDraftStability !== undefined
        ? {
            'data-draft-stability': data.streamingDraftStability
          }
        : {}),
      ...(data.streamingDraftMultiline !== undefined
        ? {
            'data-draft-multiline': String(data.streamingDraftMultiline) as 'true' | 'false'
          }
        : {})
    },
    reason: resolveRunSurfaceDraftReason(data),
    ...(block.updatedAt !== undefined
      ? {
          updatedAt: block.updatedAt
        }
      : {})
  };
}

/**
 * 对计数表里的某个键执行 +1。
 */
function incrementCount<TKey extends string>(
  target: Partial<Record<TKey, number>>,
  key: TKey
): void {
  target[key] = (target[key] ?? 0) + 1;
}

/**
 * 从 runtime snapshot 中提取一份完整的 draft 诊断结果。
 */
export function resolveRunSurfaceDraftDiagnostics(
  snapshot: RuntimeSnapshot,
  options: ResolveRunSurfaceDraftDiagnosticsOptions = {}
): RunSurfaceDraftDiagnosticsResult {
  const slot = options.slot;
  const previewChars = Math.max(48, options.previewChars ?? 96);
  const blocks = slot
    ? snapshot.blocks.filter((block) => block.slot === slot)
    : snapshot.blocks;
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const diagnostics = blocks
    .map((block) => resolveRunSurfaceDraftDiagnostic(block, nodesById, previewChars))
    .filter((value): value is RunSurfaceDraftDiagnostic => value !== null);

  const summary: RunSurfaceDraftDiagnosticsSummary = {
    totalBlockCount: blocks.length,
    draftBlockCount: diagnostics.length,
    textModeCount: 0,
    previewModeCount: 0,
    hiddenModeCount: 0,
    multilineCount: 0,
    kindCounts: {},
    stabilityCounts: {}
  };

  for (const diagnostic of diagnostics) {
    switch (diagnostic.draftMode) {
      case 'preview':
        summary.previewModeCount += 1;
        break;
      case 'hidden':
        summary.hiddenModeCount += 1;
        break;
      case 'text':
      default:
        summary.textModeCount += 1;
        break;
    }

    if (diagnostic.multiline) {
      summary.multilineCount += 1;
    }

    incrementCount(summary.kindCounts, diagnostic.draftKind);
    incrementCount(summary.stabilityCounts, diagnostic.draftStability);
  }

  return {
    diagnostics,
    summary
  };
}
