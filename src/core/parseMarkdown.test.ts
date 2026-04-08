import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
  it('keeps common inline markdown inside text blocks as structured fragments', () => {
    const [block] = parseMarkdown('这是一段 **加粗**、*强调*、~~删除线~~、[链接](https://example.com) 和 `代码`。');

    expect(block?.kind).toBe('text');
    if (block?.kind !== 'text') {
      return;
    }

    expect(block.text).toContain('加粗');
    expect(block.fragments?.some((fragment) => fragment.strong)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.em)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.del)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.href === 'https://example.com')).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.code)).toBe(true);
  });

  it('falls back to html block when inline content includes unsupported image tokens', () => {
    const [block] = parseMarkdown('这一段里有图片 ![alt](https://example.com/demo.png)');

    expect(block?.kind).toBe('html');
  });

  it('parses attachment, branch and handoff directives into structured blocks', () => {
    const blocks = parseMarkdown([
      ':::attachment title="需求文档" attachment-id="file:spec" kind="file" label="spec.pdf" size-text="2.4 MB"',
      ':::branch title="修订分支" branch-id="branch:rev-2" source-run-id="run:main" target-run-id="run:rev-2" status="running"',
      ':::handoff title="交接人工审核" handoff-id="handoff:review" target-type="human" assignee="审核同学" status="pending"'
    ].join('\n'));

    expect(blocks[0]).toMatchObject({
      kind: 'attachment',
      title: '需求文档',
      attachmentId: 'file:spec',
      attachmentKind: 'file',
      label: 'spec.pdf',
      sizeText: '2.4 MB'
    });
    expect(blocks[1]).toMatchObject({
      kind: 'branch',
      branchId: 'branch:rev-2',
      sourceRunId: 'run:main',
      targetRunId: 'run:rev-2',
      status: 'running'
    });
    expect(blocks[2]).toMatchObject({
      kind: 'handoff',
      handoffId: 'handoff:review',
      targetType: 'human',
      assignee: '审核同学',
      status: 'pending'
    });
  });
});
