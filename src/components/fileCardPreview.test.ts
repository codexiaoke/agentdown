import { describe, expect, it } from 'vitest';
import { resolveFileCardPreviewTarget } from './fileCardPreview';

describe('fileCardPreview', () => {
  it('resolves image preview from previewSrc', () => {
    expect(resolveFileCardPreviewTarget({
      kind: 'image',
      previewSrc: 'data:image/png;base64,abc',
      title: 'demo.png'
    })).toMatchObject({
      mode: 'image',
      src: 'data:image/png;base64,abc'
    });
  });

  it('resolves pdf preview into iframe mode', () => {
    expect(resolveFileCardPreviewTarget({
      kind: 'file',
      href: 'https://example.com/demo.pdf',
      mimeType: 'application/pdf',
      title: 'demo.pdf'
    })).toMatchObject({
      mode: 'iframe',
      src: 'https://example.com/demo.pdf'
    });
  });

  it('resolves json preview into text mode', () => {
    expect(resolveFileCardPreviewTarget({
      kind: 'json',
      href: 'data:application/json,{}',
      mimeType: 'application/json',
      title: 'demo.json'
    })).toMatchObject({
      mode: 'text',
      src: 'data:application/json,{}'
    });
  });

  it('falls back to external only for unknown binaries', () => {
    expect(resolveFileCardPreviewTarget({
      kind: 'file',
      href: 'https://example.com/archive.zip',
      title: 'archive.zip'
    })).toMatchObject({
      mode: null,
      externalHref: 'https://example.com/archive.zip'
    });
  });
});
