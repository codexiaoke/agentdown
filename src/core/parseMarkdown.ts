import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownEngine } from './createMarkdownEngine';
import {
  inlineFragmentsToText,
  isPlainInlineFragments,
  parseInlineFragments
} from './inlineFragments';
import type {
  AguiComponentMap,
  MarkdownAguiBlock,
  MarkdownApprovalBlock,
  MarkdownApprovalStatus,
  MarkdownArtifactBlock,
  MarkdownArtifactKind,
  MarkdownBlock,
  MarkdownCodeBlock,
  MarkdownEnginePlugin,
  MarkdownHeadingTag,
  MarkdownHtmlBlock,
  MarkdownMathBlock,
  MarkdownMermaidBlock,
  MarkdownTextBlock,
  MarkdownThoughtBlock,
  ParseMarkdownOptions
} from './types';

/** 为 block 生成稳定但轻量的 id。 */
function createBlockId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

/** 读取 AGUI 组件注册里的最小高度配置。 */
function getAguiMinHeight(components: AguiComponentMap | undefined, name: string): number {
  const registration = components?.[name];

  if (!registration || typeof registration !== 'object' || !('component' in registration)) {
    return 88;
  }

  return registration.minHeight ?? 88;
}

function readMetaValue(meta: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = meta?.[key];

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readStringMeta(meta: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  const value = readMetaValue(meta, ...keys);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumberMeta(meta: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  const value = readMetaValue(meta, ...keys);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeApprovalStatus(value: unknown): MarkdownApprovalStatus | undefined {
  if (value === 'approved' || value === 'rejected' || value === 'changes_requested' || value === 'pending') {
    return value;
  }

  return undefined;
}

function normalizeArtifactKind(value: unknown): MarkdownArtifactKind | undefined {
  if (value === 'file' || value === 'diff' || value === 'report' || value === 'image' || value === 'json' || value === 'table') {
    return value;
  }

  return undefined;
}

/** 在 token 流里找到当前 open token 对应的 close 位置。 */
function findMatchingClose(tokens: Token[], startIndex: number): number {
  const openToken = tokens[startIndex];

  if (!openToken) {
    return startIndex;
  }

  const openType = openToken.type;
  const closeType = openType.replace(/_open$/, '_close');
  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const currentToken = tokens[index];

    if (!currentToken) {
      continue;
    }

    if (currentToken.type === openType) {
      depth += 1;
    }

    if (currentToken.type === closeType) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return startIndex;
}

/** 把一段 token 直接回退渲染成 HTML block。 */
function renderHtmlBlock(
  mdPlugins: MarkdownEnginePlugin[],
  tokens: Token[],
  startIndex: number,
  endIndex: number,
  id: string,
  allowUnsafeHtml: boolean
): MarkdownHtmlBlock {
  const md = createMarkdownEngine(mdPlugins, {
    allowUnsafeHtml
  });

  return {
    id,
    kind: 'html',
    html: md.renderer.render(tokens.slice(startIndex, endIndex + 1), md.options, {})
  };
}

/** 把单个 token 包装成 HTML block，适合 hr 这类自闭合结构。 */
function renderSingleHtmlToken(
  mdPlugins: MarkdownEnginePlugin[],
  token: Token,
  index: number,
  allowUnsafeHtml: boolean
): MarkdownHtmlBlock {
  return renderHtmlBlock(mdPlugins, [token], 0, 0, createBlockId('html', index), allowUnsafeHtml);
}

/** 优先把段落和标题解析成 text block，不满足条件时回退为 HTML。 */
function parseTextLikeBlock(
  token: Token,
  inlineToken: Token | undefined,
  index: number,
  mdPlugins: MarkdownEnginePlugin[],
  tokens: Token[],
  allowUnsafeHtml: boolean
): MarkdownTextBlock | MarkdownHtmlBlock {
  const tag = token.tag as MarkdownHeadingTag;
  const inlineFragments = inlineToken?.type === 'inline'
    ? parseInlineFragments(inlineToken.children)
    : null;

  // 常见 inline rich text 也优先走 pretext；更复杂的 inline 结构再回退成 HTML。
  if (inlineToken?.type === 'inline' && inlineFragments !== null) {
    const text = inlineFragmentsToText(inlineFragments);

    return {
      id: createBlockId(tag, index),
      kind: 'text',
      tag,
      text,
      ...(isPlainInlineFragments(inlineFragments) ? {} : { fragments: inlineFragments })
    };
  }

  const closeIndex = findMatchingClose(tokens, index);
  return renderHtmlBlock(mdPlugins, tokens, index, closeIndex, createBlockId('html', index), allowUnsafeHtml);
}

/** 把 markdown-it token 流压缩成更适合 Vue 渲染的 block 列表。 */
function parseTokens(
  tokens: Token[],
  options: ParseMarkdownOptions,
  plugins: MarkdownEnginePlugin[]
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      const block = parseTextLikeBlock(
        token,
        tokens[index + 1],
        index,
        plugins,
        tokens,
        options.allowUnsafeHtml ?? false
      );
      blocks.push(block);
      index = findMatchingClose(tokens, index);
      continue;
    }

    if (token.type === 'fence') {
      const language = token.info.split(/\s+/)[0] ?? '';

      if (language === 'mermaid') {
        const block: MarkdownMermaidBlock = {
          id: createBlockId('mermaid', index),
          kind: 'mermaid',
          code: token.content,
          meta: token.info
        };
        blocks.push(block);
        continue;
      }

      const block: MarkdownCodeBlock = {
        id: createBlockId('code', index),
        kind: 'code',
        code: token.content,
        language,
        meta: token.info
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'code_block') {
      const block: MarkdownCodeBlock = {
        id: createBlockId('code', index),
        kind: 'code',
        code: token.content,
        language: '',
        meta: ''
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'math_block') {
      const block: MarkdownMathBlock = {
        id: createBlockId('math', index),
        kind: 'math',
        expression: token.content,
        displayMode: true
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'hr') {
      blocks.push(renderSingleHtmlToken(plugins, token, index, options.allowUnsafeHtml ?? false));
      continue;
    }

    if (token.type === 'agui_component') {
      const name = (token.meta?.name as string | undefined) ?? 'UnknownComponent';
      const block: MarkdownAguiBlock = {
        id: createBlockId('agui', index),
        kind: 'agui',
        name,
        props: (token.meta?.props as Record<string, unknown> | undefined) ?? {},
        minHeight: getAguiMinHeight(options.aguiComponents, name)
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'agent_artifact_directive') {
      const meta = (token.meta as Record<string, unknown> | undefined) ?? {};
      const refId = readStringMeta(meta, 'ref', 'nodeId');
      const message = readStringMeta(meta, 'message', 'description');
      const artifactId = readStringMeta(meta, 'artifactId', 'artifact-id', 'id');
      const label = readStringMeta(meta, 'label');
      const href = readStringMeta(meta, 'href', 'url');
      const block: MarkdownArtifactBlock = {
        id: createBlockId('artifact', index),
        kind: 'artifact',
        title: readStringMeta(meta, 'title') ?? readStringMeta(meta, 'label') ?? 'Artifact',
        artifactKind: normalizeArtifactKind(readMetaValue(meta, 'artifactKind', 'artifact-kind', 'kind')) ?? 'report',
        ...(refId ? { refId } : {}),
        ...(message ? { message } : {}),
        ...(artifactId ? { artifactId } : {}),
        ...(label ? { label } : {}),
        ...(href ? { href } : {})
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'agent_approval_directive') {
      const meta = (token.meta as Record<string, unknown> | undefined) ?? {};
      const refId = readStringMeta(meta, 'ref', 'nodeId');
      const message = readStringMeta(meta, 'message', 'description');
      const approvalId = readStringMeta(meta, 'approvalId', 'approval-id', 'id');
      const status = normalizeApprovalStatus(readMetaValue(meta, 'status', 'decision'));
      const block: MarkdownApprovalBlock = {
        id: createBlockId('approval', index),
        kind: 'approval',
        title: readStringMeta(meta, 'title') ?? 'Approval',
        ...(refId ? { refId } : {}),
        ...(message ? { message } : {}),
        ...(approvalId ? { approvalId } : {}),
        ...(status ? { status } : {})
      };
      blocks.push(block);
      continue;
    }

    if (token.type === 'agent_timeline_directive') {
      const meta = (token.meta as Record<string, unknown> | undefined) ?? {};
      const refId = readStringMeta(meta, 'ref', 'nodeId');
      const emptyText = readStringMeta(meta, 'emptyText', 'empty-text');
      blocks.push({
        id: createBlockId('timeline', index),
        kind: 'timeline',
        title: readStringMeta(meta, 'title') ?? 'Timeline',
        limit: readNumberMeta(meta, 'limit') ?? 8,
        ...(refId ? { refId } : {}),
        ...(emptyText ? { emptyText } : {})
      });
      continue;
    }

    if (token.type === 'container_thought_open') {
      const closeIndex = findMatchingClose(tokens, index);
      // thought 内部继续复用同一套 block 解析，保证嵌套行为一致。
      const nestedBlocks = parseTokens(tokens.slice(index + 1, closeIndex), options, plugins);
      const block: MarkdownThoughtBlock = {
        id: createBlockId('thought', index),
        kind: 'thought',
        title: options.thoughtTitle ?? 'Thought Process',
        blocks: nestedBlocks
      };
      blocks.push(block);
      index = closeIndex;
      continue;
    }

    if (
      token.type.endsWith('_open') &&
      token.type !== 'paragraph_open' &&
      token.type !== 'heading_open' &&
      token.type !== 'container_thought_open'
    ) {
      // 列表、表格、引用等复杂块先统一兜底成 HTML，后面再逐步细化布局树。
      const closeIndex = findMatchingClose(tokens, index);
      blocks.push(renderHtmlBlock(
        plugins,
        tokens,
        index,
        closeIndex,
        createBlockId('html', index),
        options.allowUnsafeHtml ?? false
      ));
      index = closeIndex;
      continue;
    }

    if (token.type === 'html_block') {
      blocks.push({
        id: createBlockId('html', index),
        kind: 'html',
        html: token.content
      });
    }
  }

  return blocks;
}

/** 对外暴露的 markdown 解析入口。 */
export function parseMarkdown(source: string, options: ParseMarkdownOptions = {}): MarkdownBlock[] {
  const plugins = options.plugins ?? [];
  const md = createMarkdownEngine(
    plugins,
    options.allowUnsafeHtml !== undefined
      ? {
          allowUnsafeHtml: options.allowUnsafeHtml
        }
      : {}
  );
  const tokens = md.parse(source, {});

  // 这里把 markdown-it token 流压成更适合 Vue 渲染的 block 结构。
  return parseTokens(tokens, options, plugins);
}
