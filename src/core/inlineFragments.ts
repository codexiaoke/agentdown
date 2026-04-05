import type Token from 'markdown-it/lib/token.mjs';
import type { MarkdownInlineFragment } from './types';

/**
 * inline token 解析时维护的样式状态。
 */
interface InlineFragmentState {
  strongDepth: number;
  emDepth: number;
  delDepth: number;
  hrefStack: string[];
}

/**
 * 用于输出 fragment 前先拿到当前激活的样式标记。
 */
interface InlineFragmentMarks {
  strong?: boolean;
  em?: boolean;
  del?: boolean;
  href?: string;
}

/**
 * 复制当前样式栈对应的展示标记。
 */
function snapshotInlineMarks(state: InlineFragmentState): InlineFragmentMarks {
  const href = state.hrefStack.at(-1);

  return {
    ...(state.strongDepth > 0 ? { strong: true } : {}),
    ...(state.emDepth > 0 ? { em: true } : {}),
    ...(state.delDepth > 0 ? { del: true } : {}),
    ...(href ? { href } : {})
  };
}

/**
 * 判断两个 inline fragment 的样式是否一致，从而可以安全合并。
 */
function hasSameInlineMarks(
  left: Omit<MarkdownInlineFragment, 'id' | 'text'>,
  right: Omit<MarkdownInlineFragment, 'id' | 'text'>
): boolean {
  return (
    left.strong === right.strong
    && left.em === right.em
    && left.del === right.del
    && left.code === right.code
    && left.href === right.href
  );
}

/**
 * 向 fragment 列表里追加一段文本，并在样式一致时自动合并相邻片段。
 */
function appendInlineFragment(
  fragments: Omit<MarkdownInlineFragment, 'id'>[],
  text: string,
  marks: InlineFragmentMarks & { code?: boolean }
): void {
  if (text.length === 0) {
    return;
  }

  const nextFragment: Omit<MarkdownInlineFragment, 'id'> = {
    text,
    ...marks
  };
  const previousFragment = fragments.at(-1);

  if (previousFragment && hasSameInlineMarks(previousFragment, nextFragment)) {
    previousFragment.text += text;
    return;
  }

  fragments.push(nextFragment);
}

/**
 * 规范化 fragment id，保证外部消费时总能拿到稳定 key。
 */
function finalizeInlineFragments(
  fragments: Omit<MarkdownInlineFragment, 'id'>[]
): MarkdownInlineFragment[] {
  return fragments.map((fragment, index) => ({
    id: `inline-fragment-${index}`,
    ...fragment
  }));
}

/**
 * 把 markdown-it 的 inline children 收敛成可供 Agentdown 渲染的结构化 fragment。
 * 如果遇到图片、原生 inline HTML 等当前还不适合走 pretext 的 token，则返回 null 交给 HTML block 兜底。
 */
export function parseInlineFragments(children?: Token[] | null): MarkdownInlineFragment[] | null {
  if (!children) {
    return [];
  }

  const fragments: Omit<MarkdownInlineFragment, 'id'>[] = [];
  const state: InlineFragmentState = {
    strongDepth: 0,
    emDepth: 0,
    delDepth: 0,
    hrefStack: []
  };

  for (const child of children) {
    switch (child.type) {
      case 'text':
        appendInlineFragment(fragments, child.content, snapshotInlineMarks(state));
        break;

      case 'softbreak':
      case 'hardbreak':
        appendInlineFragment(fragments, '\n', snapshotInlineMarks(state));
        break;

      case 'strong_open':
        state.strongDepth += 1;
        break;

      case 'strong_close':
        state.strongDepth = Math.max(0, state.strongDepth - 1);
        break;

      case 'em_open':
        state.emDepth += 1;
        break;

      case 'em_close':
        state.emDepth = Math.max(0, state.emDepth - 1);
        break;

      case 's_open':
      case 'del_open':
        state.delDepth += 1;
        break;

      case 's_close':
      case 'del_close':
        state.delDepth = Math.max(0, state.delDepth - 1);
        break;

      case 'link_open':
        state.hrefStack.push(child.attrGet('href') ?? '');
        break;

      case 'link_close':
        state.hrefStack.pop();
        break;

      case 'code_inline':
        appendInlineFragment(fragments, child.content, {
          ...snapshotInlineMarks(state),
          code: true
        });
        break;

      default:
        return null;
    }
  }

  return finalizeInlineFragments(fragments);
}

/**
 * 判断一组 inline fragment 是否仍然只是“纯文本”。
 */
export function isPlainInlineFragments(fragments: MarkdownInlineFragment[]): boolean {
  return fragments.every((fragment) => {
    return !fragment.strong && !fragment.em && !fragment.del && !fragment.code && !fragment.href;
  });
}

/**
 * 把 fragment 列表重新拼回完整文本。
 */
export function inlineFragmentsToText(fragments: MarkdownInlineFragment[]): string {
  return fragments.map((fragment) => fragment.text).join('');
}

/**
 * 按字符范围切出一段新的 inline fragment 列表，供长文本 slab 等场景复用。
 */
export function sliceInlineFragments(
  fragments: MarkdownInlineFragment[] | undefined,
  start: number,
  end: number
): MarkdownInlineFragment[] | undefined {
  if (!fragments || start >= end) {
    return undefined;
  }

  const sliced: Omit<MarkdownInlineFragment, 'id'>[] = [];
  let cursor = 0;

  for (const fragment of fragments) {
    const fragmentStart = cursor;
    const fragmentEnd = cursor + fragment.text.length;
    const overlapStart = Math.max(start, fragmentStart);
    const overlapEnd = Math.min(end, fragmentEnd);

    if (overlapStart < overlapEnd) {
      appendInlineFragment(
        sliced,
        fragment.text.slice(overlapStart - fragmentStart, overlapEnd - fragmentStart),
        {
          ...(fragment.strong ? { strong: true } : {}),
          ...(fragment.em ? { em: true } : {}),
          ...(fragment.del ? { del: true } : {}),
          ...(fragment.code ? { code: true } : {}),
          ...(fragment.href ? { href: fragment.href } : {})
        }
      );
    }

    cursor = fragmentEnd;
  }

  return sliced.length > 0 ? finalizeInlineFragments(sliced) : undefined;
}
