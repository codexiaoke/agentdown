import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownEngine } from './createMarkdownEngine';
import type {
  AguiComponentMap,
  MarkdownAguiBlock,
  MarkdownBlock,
  MarkdownCodeBlock,
  MarkdownEnginePlugin,
  MarkdownHeadingTag,
  MarkdownHtmlBlock,
  MarkdownMathBlock,
  MarkdownTextBlock,
  MarkdownThoughtBlock,
  ParseMarkdownOptions
} from './types';

function createBlockId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function getAguiMinHeight(components: AguiComponentMap | undefined, name: string): number {
  const registration = components?.[name];

  if (!registration || typeof registration !== 'object' || !('component' in registration)) {
    return 88;
  }

  return registration.minHeight ?? 88;
}

function isPlainInlineToken(token: Token): boolean {
  return token.type === 'text' || token.type === 'softbreak' || token.type === 'hardbreak';
}

function normalizeInlineText(children: Token[] = []): string {
  return children
    .map((child) => {
      if (child.type === 'softbreak' || child.type === 'hardbreak') {
        return '\n';
      }

      return child.content;
    })
    .join('');
}

function isPlainInline(children: Token[] = []): boolean {
  return children.every(isPlainInlineToken);
}

function findMatchingClose(tokens: Token[], startIndex: number): number {
  const openType = tokens[startIndex].type;
  const closeType = openType.replace(/_open$/, '_close');
  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    if (tokens[index].type === openType) {
      depth += 1;
    }

    if (tokens[index].type === closeType) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return startIndex;
}

function renderHtmlBlock(
  mdPlugins: MarkdownEnginePlugin[],
  tokens: Token[],
  startIndex: number,
  endIndex: number,
  id: string
): MarkdownHtmlBlock {
  const md = createMarkdownEngine(mdPlugins);

  return {
    id,
    kind: 'html',
    html: md.renderer.render(tokens.slice(startIndex, endIndex + 1), md.options, {})
  };
}

function parseTextLikeBlock(
  token: Token,
  inlineToken: Token | undefined,
  index: number,
  mdPlugins: MarkdownEnginePlugin[],
  tokens: Token[]
): MarkdownTextBlock | MarkdownHtmlBlock {
  const tag = token.tag as MarkdownHeadingTag;

  if (inlineToken?.type === 'inline' && isPlainInline(inlineToken.children)) {
    return {
      id: createBlockId(tag, index),
      kind: 'text',
      tag,
      text: normalizeInlineText(inlineToken.children)
    };
  }

  const closeIndex = findMatchingClose(tokens, index);
  return renderHtmlBlock(mdPlugins, tokens, index, closeIndex, createBlockId('html', index));
}

function parseTokens(
  tokens: Token[],
  options: ParseMarkdownOptions,
  plugins: MarkdownEnginePlugin[]
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      const block = parseTextLikeBlock(token, tokens[index + 1], index, plugins, tokens);
      blocks.push(block);
      index = findMatchingClose(tokens, index);
      continue;
    }

    if (token.type === 'fence') {
      const block: MarkdownCodeBlock = {
        id: createBlockId('code', index),
        kind: 'code',
        code: token.content,
        language: token.info.split(/\s+/)[0] ?? '',
        meta: token.info
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

    if (token.type === 'container_thought_open') {
      const closeIndex = findMatchingClose(tokens, index);
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
      const closeIndex = findMatchingClose(tokens, index);
      blocks.push(renderHtmlBlock(plugins, tokens, index, closeIndex, createBlockId('html', index)));
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

export function parseMarkdown(source: string, options: ParseMarkdownOptions = {}): MarkdownBlock[] {
  const plugins = options.plugins ?? [];
  const md = createMarkdownEngine(plugins);
  const tokens = md.parse(source, {});

  return parseTokens(tokens, options, plugins);
}
