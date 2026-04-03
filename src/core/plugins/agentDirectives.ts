import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { parseDirectiveProps } from './directiveProps';

const AGENT_DIRECTIVE = /^:::\s*(approval|artifact|timeline)(?:\s+(.*))?$/;

/** 注册 agent-native 单行指令。 */
export function agentDirectivesPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'agent_directives',
    (state, startLine, _endLine, silent) => {
      const lineStart = state.bMarks[startLine];
      const shift = state.tShift[startLine];
      const max = state.eMarks[startLine];

      if (lineStart === undefined || shift === undefined || max === undefined) {
        return false;
      }

      const start = lineStart + shift;
      const line = state.src.slice(start, max);
      const match = line.match(AGENT_DIRECTIVE);

      if (!match) {
        return false;
      }

      if (silent) {
        return true;
      }

      const directive = match[1];
      const token = state.push(`agent_${directive}_directive`, 'div', 0) as Token;
      token.block = true;
      token.meta = parseDirectiveProps(match[2]);
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    }
  );
}
