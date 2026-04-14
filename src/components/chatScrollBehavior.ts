export const CHAT_SCROLL_ATTACH_DISTANCE_PX = 24;
export const CHAT_SCROLL_DETACH_DELTA_PX = 1;

export interface ChatScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ResolveChatScrollFollowInput extends ChatScrollMetrics {
  previousScrollTop: number;
  currentFollow: boolean;
  attachDistance?: number;
  detachDelta?: number;
}

export function resolveChatScrollBottomDistance(metrics: ChatScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function resolveChatScrollFollowState(input: ResolveChatScrollFollowInput): boolean {
  const attachDistance = input.attachDistance ?? CHAT_SCROLL_ATTACH_DISTANCE_PX;
  const detachDelta = input.detachDelta ?? CHAT_SCROLL_DETACH_DELTA_PX;
  const distance = resolveChatScrollBottomDistance(input);

  if (input.scrollTop < input.previousScrollTop - detachDelta) {
    return false;
  }

  if (distance <= attachDistance) {
    return true;
  }

  return input.currentFollow;
}
