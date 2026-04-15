import type { InjectionKey } from 'vue';
import type { FileCardPreviewContentKind, FileCardPreviewMode, FileCardPreviewTarget } from './fileCardPreview';

export interface AgentChatFilePreviewState {
  title: string;
  subtitle: string;
  mode: FileCardPreviewMode;
  contentKind: FileCardPreviewContentKind;
  src: string;
  text: string;
  loading: boolean;
  error: string;
  externalHref: string;
}

export interface AgentChatFilePreviewRequest {
  title: string;
  subtitle?: string;
  target: FileCardPreviewTarget;
}

export interface AgentChatFilePreviewController {
  canPreviewInPanel: () => boolean;
  openPreview: (request: AgentChatFilePreviewRequest) => Promise<boolean>;
  closePreview: () => void;
}

export const agentChatFilePreviewKey: InjectionKey<AgentChatFilePreviewController> = Symbol(
  'agentdown-agent-chat-file-preview'
);
