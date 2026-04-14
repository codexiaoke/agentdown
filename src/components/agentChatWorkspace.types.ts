import type { Ref } from 'vue';

export interface AgentChatWorkspaceExposed {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scheduleScrollToBottom: (behavior?: ScrollBehavior) => void;
  scheduleInitialBottomSync: () => void;
  followBottom: Ref<boolean>;
  showScrollToBottom: Ref<boolean>;
  scrollToBottomHasUnread: Ref<boolean>;
}
