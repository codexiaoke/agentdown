import type {
  MarkdownInlineFragment,
  MarkdownTextBlock
} from './types';

/**
 * 流式 draft 行内解析时维护的样式状态。
 *
 * 这里故意只覆盖最常见、最稳定的几类语义：
 * - `**strong**` / `__strong__`
 * - `~~del~~`
 * - `` `code` ``
 *
 * 这样可以在流式过程中尽早给出可读预览，同时避免把普通文本里的单个 `*`
 * 误判成斜体，导致用户看到更奇怪的闪动。
 */
interface StreamingInlineState {
  strong: boolean;
  del: boolean;
  code: boolean;
}

/**
 * 当前片段应该带上的展示标记。
 */
interface StreamingInlineMarks {
  strong?: boolean;
  del?: boolean;
  code?: boolean;
}

/**
 * 把当前状态复制成可直接挂到 fragment 上的标记对象。
 */
function snapshotStreamingMarks(state: StreamingInlineState): StreamingInlineMarks {
  return {
    ...(state.strong ? { strong: true } : {}),
    ...(state.del ? { del: true } : {}),
    ...(state.code ? { code: true } : {})
  };
}

/**
 * 判断两个 fragment 是否有相同的样式标记，便于合并相邻文本。
 */
function hasSameStreamingMarks(
  left: Omit<MarkdownInlineFragment, 'id' | 'text'>,
  right: Omit<MarkdownInlineFragment, 'id' | 'text'>
): boolean {
  return (
    left.strong === right.strong
    && left.del === right.del
    && left.code === right.code
  );
}

/**
 * 追加一段文本，并尽量与上一个同样式 fragment 合并。
 */
function appendStreamingFragment(
  fragments: Omit<MarkdownInlineFragment, 'id'>[],
  text: string,
  marks: StreamingInlineMarks
): void {
  if (text.length === 0) {
    return;
  }

  const nextFragment: Omit<MarkdownInlineFragment, 'id'> = {
    text,
    ...marks
  };
  const previousFragment = fragments.at(-1);

  if (previousFragment && hasSameStreamingMarks(previousFragment, nextFragment)) {
    previousFragment.text += text;
    return;
  }

  fragments.push(nextFragment);
}

/**
 * 为输出 fragment 生成稳定 id。
 */
function finalizeStreamingFragments(
  fragments: Omit<MarkdownInlineFragment, 'id'>[]
): MarkdownInlineFragment[] {
  return fragments.map((fragment, index) => ({
    id: `streaming-inline-fragment-${index}`,
    ...fragment
  }));
}

/**
 * 判断结果里是否真的包含富文本语义。
 */
function hasRichStreamingMarks(fragments: MarkdownInlineFragment[]): boolean {
  return fragments.some((fragment) => fragment.strong || fragment.del || fragment.code);
}

/**
 * 以“容错预览”的方式解析一段正在流式到来的行内 markdown。
 *
 * 与稳定态 `parseMarkdown()` 不同，这里允许未闭合的起始标记立即生效：
 * 例如 `**天气状况：` 在第二个 `*` 出来之后，后续文本就会先按粗体显示。
 */
export function parseStreamingInlineFragments(source: string): MarkdownInlineFragment[] {
  const fragments: Omit<MarkdownInlineFragment, 'id'>[] = [];
  const state: StreamingInlineState = {
    strong: false,
    del: false,
    code: false
  };

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    const pair = `${current ?? ''}${next ?? ''}`;

    if (!current) {
      continue;
    }

    if (current === '\\' && next) {
      appendStreamingFragment(fragments, next, snapshotStreamingMarks(state));
      index += 1;
      continue;
    }

    if (state.code) {
      if (current === '`') {
        state.code = false;
        continue;
      }

      appendStreamingFragment(fragments, current, snapshotStreamingMarks(state));
      continue;
    }

    if (pair === '**' || pair === '__') {
      state.strong = !state.strong;
      index += 1;
      continue;
    }

    if (pair === '~~') {
      state.del = !state.del;
      index += 1;
      continue;
    }

    if (current === '`') {
      state.code = true;
      continue;
    }

    appendStreamingFragment(fragments, current, snapshotStreamingMarks(state));
  }

  return finalizeStreamingFragments(fragments);
}

/**
 * 把 text-mode 的 markdown draft 转成一个可直接渲染的 text block。
 */
export function createStreamingMarkdownTextBlock(
  source: string,
  id: string
): MarkdownTextBlock {
  const fragments = parseStreamingInlineFragments(source);
  const text = fragments.map((fragment) => fragment.text).join('');

  return {
    id,
    kind: 'text',
    tag: 'p',
    text,
    ...(hasRichStreamingMarks(fragments) ? { fragments } : {})
  };
}
