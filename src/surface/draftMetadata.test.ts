import { describe, expect, it } from 'vitest';
import { resolveSurfaceBlockStreamingDraftData } from './draftMetadata';

describe('resolveSurfaceBlockStreamingDraftData', () => {
  it('returns an empty object for non-record values', () => {
    expect(resolveSurfaceBlockStreamingDraftData(null)).toEqual({});
    expect(resolveSurfaceBlockStreamingDraftData('draft')).toEqual({});
    expect(resolveSurfaceBlockStreamingDraftData([])).toEqual({});
  });

  it('keeps only supported draft metadata fields', () => {
    expect(resolveSurfaceBlockStreamingDraftData({
      streamingDraftMode: 'preview',
      streamingDraftKind: 'html',
      streamingDraftStability: 'close-stable',
      streamingDraftMultiline: true,
      extra: 'ignored'
    })).toEqual({
      streamingDraftMode: 'preview',
      streamingDraftKind: 'html',
      streamingDraftStability: 'close-stable',
      streamingDraftMultiline: true
    });
  });

  it('drops unsupported enum values', () => {
    expect(resolveSurfaceBlockStreamingDraftData({
      streamingDraftMode: 'unknown',
      streamingDraftKind: 'weird',
      streamingDraftStability: 'unstable',
      streamingDraftMultiline: 'true'
    })).toEqual({});
  });
});
