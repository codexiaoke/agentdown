import { describe, expect, it } from 'vitest';
import { applyAgUiJsonPatch } from './jsonPatch';

describe('applyAgUiJsonPatch', () => {
  it('supports RFC 6902 add, replace, copy, move, test and remove', () => {
    const original = { profile: { name: 'Ada', tags: ['agent'] }, selected: null };
    const result = applyAgUiJsonPatch(original, [
      { op: 'add', path: '/profile/tags/-', value: 'vue' },
      { op: 'replace', path: '/profile/name', value: 'Grace' },
      { op: 'copy', from: '/profile/name', path: '/selected' },
      { op: 'move', from: '/profile/tags/0', path: '/profile/tags/1' },
      { op: 'test', path: '/selected', value: 'Grace' },
      { op: 'remove', path: '/profile/tags/0' }
    ]);

    expect(result).toEqual({
      profile: { name: 'Grace', tags: ['agent'] },
      selected: 'Grace'
    });
    expect(original).toEqual({ profile: { name: 'Ada', tags: ['agent'] }, selected: null });
  });

  it('rejects prototype pollution and failed tests', () => {
    expect(() => applyAgUiJsonPatch({}, [
      { op: 'add', path: '/__proto__/admin', value: true }
    ])).toThrow('Forbidden JSON Pointer segment');

    expect(() => applyAgUiJsonPatch({ ok: true }, [
      { op: 'test', path: '/ok', value: false }
    ])).toThrow('test failed');
  });
});
