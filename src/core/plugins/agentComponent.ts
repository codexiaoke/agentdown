import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { parseDirectiveProps } from './directiveProps';

const COMPONENT_DIRECTIVE = /^:::\s*vue-component\s+([A-Za-z][\w-]*)(?:\s+(.*))?$/;

/** 注册 :::vue-component 指令，把它转成受控组件 token。 */
export function agentComponentPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'agent_component',
    /** 识别单行组件指令，并写入组件名与 props。 */
    (state, startLine, _endLine, silent) => {
      const lineStart = state.bMarks[startLine];
      const shift = state.tShift[startLine];
      const max = state.eMarks[startLine];

      if (lineStart === undefined || shift === undefined || max === undefined) {
        return false;
      }

      const start = lineStart + shift;
      const line = state.src.slice(start, max);
      const match = line.match(COMPONENT_DIRECTIVE);

      if (!match) {
        return false;
      }

      if (silent) {
        return true;
      }

      // 自定义指令在解析阶段就转成独立 token，渲染层只关心组件名和 props。
      const token = state.push('agent_component', 'div', 0) as Token;
      token.block = true;
      token.meta = {
        name: match[1],
        props: parseDirectiveProps(match[2])
      };
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    }
  );
}
