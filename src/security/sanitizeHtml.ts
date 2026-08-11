import DOMPurify, { type Config, type DOMPurify as DOMPurifyInstance } from 'dompurify';
import type {
  MarkdownHtmlSanitizer,
  MarkdownHtmlSanitizerContext,
  MarkdownHtmlTrust
} from '../core/types';

const AGENTDOWN_HTML_SANITIZE_CONFIG: Config = Object.freeze({
  USE_PROFILES: {
    html: true
  },
  FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['style', 'srcdoc'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
  RETURN_TRUSTED_TYPE: false
});

let browserPurifier: DOMPurifyInstance | null = null;

/**
 * 懒创建浏览器 DOMPurify，避免 SSR 期间访问 window。
 */
function resolveBrowserPurifier(): DOMPurifyInstance | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (browserPurifier) {
    return browserPurifier;
  }

  browserPurifier = typeof DOMPurify.sanitize === 'function'
    ? DOMPurify
    : DOMPurify(window);

  return browserPurifier.isSupported ? browserPurifier : null;
}

/**
 * Agentdown 默认 HTML sanitizer。
 *
 * SSR 或浏览器不支持 DOMPurify 时返回空字符串，始终 fail closed。
 */
export const sanitizeAgentdownHtml: MarkdownHtmlSanitizer = (
  html: string,
  _context: MarkdownHtmlSanitizerContext
): string => {
  const purifier = resolveBrowserPurifier();

  if (!purifier) {
    return '';
  }

  return purifier.sanitize(html, AGENTDOWN_HTML_SANITIZE_CONFIG);
};

/**
 * 统一决定 HTML block 最终进入 v-html 的内容。
 * markdown-it 从安全 token 生成的 HTML 可直接 SSR；其他来源必须先净化。
 */
export function resolveAgentdownHtml(
  html: string,
  trust: MarkdownHtmlTrust,
  sanitizer: MarkdownHtmlSanitizer,
  canSanitize: boolean
): string {
  if (trust === 'generated') {
    return html;
  }

  if (!canSanitize) {
    return '';
  }

  return sanitizer(html, { trust });
}
