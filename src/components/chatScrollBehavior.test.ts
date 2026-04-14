import { describe, expect, it } from 'vitest';
import {
  CHAT_SCROLL_ATTACH_DISTANCE_PX,
  resolveChatScrollBottomDistance,
  resolveChatScrollFollowState
} from './chatScrollBehavior';

describe('chatScrollBehavior', () => {
  it('computes distance from the bottom edge', () => {
    expect(resolveChatScrollBottomDistance({
      scrollTop: 720,
      scrollHeight: 1200,
      clientHeight: 400
    })).toBe(80);
  });

  it('keeps follow mode enabled when already near bottom', () => {
    expect(resolveChatScrollFollowState({
      previousScrollTop: 900,
      scrollTop: 982,
      scrollHeight: 1400,
      clientHeight: 400,
      currentFollow: true
    })).toBe(true);
  });

  it('detaches immediately when the user scrolls upward a little', () => {
    expect(resolveChatScrollFollowState({
      previousScrollTop: 1000,
      scrollTop: 992,
      scrollHeight: 1400,
      clientHeight: 400,
      currentFollow: true
    })).toBe(false);
  });

  it('stays detached while the user is still away from bottom', () => {
    expect(resolveChatScrollFollowState({
      previousScrollTop: 640,
      scrollTop: 700,
      scrollHeight: 1600,
      clientHeight: 400,
      currentFollow: false
    })).toBe(false);
  });

  it('reattaches once the viewport returns close enough to bottom', () => {
    expect(resolveChatScrollFollowState({
      previousScrollTop: 900,
      scrollTop: 1400 - 400 - CHAT_SCROLL_ATTACH_DISTANCE_PX + 4,
      scrollHeight: 1400,
      clientHeight: 400,
      currentFollow: false
    })).toBe(true);
  });
});
