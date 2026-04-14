import { describe, expect, it } from 'vitest';
import {
  buildAgentChatInputValue,
  buildAgentChatRequestText,
  createAgentChatComposerSendPayload,
  createAgentChatPendingAttachment,
  formatAgentChatFileSize,
  hasAgentChatAppendedConversationContent,
  inferAgentChatAttachmentKind
} from './agentChat';

describe('agentChat helpers', () => {
  it('formats file sizes across ranges', () => {
    expect(formatAgentChatFileSize(512)).toBe('512 B');
    expect(formatAgentChatFileSize(1536)).toBe('2 KB');
    expect(formatAgentChatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('infers attachment kinds from mime type and file extension', () => {
    expect(inferAgentChatAttachmentKind({
      name: 'photo.png',
      type: 'image/png'
    })).toBe('image');

    expect(inferAgentChatAttachmentKind({
      name: 'voice.mp3',
      type: 'audio/mpeg'
    })).toBe('audio');

    expect(inferAgentChatAttachmentKind({
      name: 'payload.json',
      type: ''
    })).toBe('json');
  });

  it('builds plain string input when there are no attachments', () => {
    expect(buildAgentChatInputValue('  你好，北京天气  ', [])).toBe('你好，北京天气');
  });

  it('builds structured input with attachment blocks and request text', () => {
    const input = buildAgentChatInputValue('帮我分析一下', [
      {
        id: 'upload-1',
        fileId: 'file-1',
        name: 'report.pdf',
        size: 1024,
        sizeText: '1 KB',
        mimeType: 'application/pdf',
        attachmentKind: 'file',
        href: 'https://example.com/report.pdf',
        localObjectUrl: 'blob:report'
      }
    ]);

    expect(typeof input).toBe('object');
    expect(input).toMatchObject({
      text: '帮我分析一下',
      requestText: '帮我分析一下\n\n已上传文件：report.pdf',
      blocks: [
        {
          kind: 'attachment',
          attachmentId: 'file-1',
          attachmentKind: 'file',
          href: 'https://example.com/report.pdf'
        }
      ]
    });
  });

  it('builds upload-only request text', () => {
    expect(buildAgentChatRequestText('', [
      {
        name: 'weather.png'
      }
    ])).toBe('请先查看我上传的文件：weather.png');
  });

  it('falls back to the local object url for image previews', () => {
    const attachment = createAgentChatPendingAttachment({
      file: {
        name: 'preview.png',
        size: 2048,
        type: 'image/png'
      },
      localObjectUrl: 'blob:preview',
      result: {
        fileId: 'file-preview'
      }
    });

    expect(attachment).toMatchObject({
      fileId: 'file-preview',
      href: 'blob:preview',
      previewSrc: 'blob:preview',
      attachmentKind: 'image'
    });
  });

  it('creates send payloads with trimmed text and original attachments', () => {
    const attachment = createAgentChatPendingAttachment({
      file: {
        name: 'data.json',
        size: 4096,
        type: 'application/json'
      },
      localObjectUrl: 'blob:data',
      result: {
        fileId: 'file-data',
        href: 'https://example.com/data.json'
      }
    });

    expect(createAgentChatComposerSendPayload('  帮我看一下  ', [attachment])).toMatchObject({
      text: '帮我看一下',
      requestText: '帮我看一下\n\n已上传文件：data.json',
      attachments: [
        {
          fileId: 'file-data'
        }
      ]
    });
  });

  it('detects when new assistant conversation content appears after resume', () => {
    expect(hasAgentChatAppendedConversationContent([
      {
        id: 'block:baseline:approval',
        slot: 'main',
        type: 'approval',
        renderer: 'approval',
        state: 'settled',
        data: {}
      },
      {
        id: 'block:new:draft',
        slot: 'main',
        type: 'markdown',
        renderer: 'markdown.draft',
        state: 'draft',
        data: {}
      }
    ], ['block:baseline:approval'])).toBe(true);
  });

  it('ignores tool and approval changes when checking resume progress', () => {
    expect(hasAgentChatAppendedConversationContent([
      {
        id: 'block:baseline:approval',
        slot: 'main',
        type: 'approval',
        renderer: 'approval',
        state: 'settled',
        data: {}
      },
      {
        id: 'block:new:tool',
        slot: 'main',
        type: 'tool',
        renderer: 'tool',
        state: 'stable',
        data: {}
      }
    ], ['block:baseline:approval'])).toBe(false);
  });

  it('ignores user blocks when checking resume progress', () => {
    expect(hasAgentChatAppendedConversationContent([
      {
        id: 'block:baseline:approval',
        slot: 'main',
        type: 'approval',
        renderer: 'approval',
        state: 'settled',
        data: {}
      },
      {
        id: 'block:new:user',
        slot: 'main',
        type: 'markdown',
        renderer: 'markdown',
        state: 'settled',
        data: {
          role: 'user'
        }
      }
    ], ['block:baseline:approval'])).toBe(false);
  });
});
