import { describe, expect, it } from 'vitest';
import { mergeAgentdownThemes, resolveAgentdownThemeCssVars } from './theme';

describe('agentdown theme config', () => {
  it('deep merges semantic tokens and component tokens', () => {
    expect(mergeAgentdownThemes(
      {
        tokens: {
          color: {
            text: '#111111'
          }
        },
        components: {
          thought: {
            titleColor: '#888888'
          }
        }
      },
      {
        tokens: {
          color: {
            muted: '#999999'
          }
        },
        components: {
          tool: {
            successColor: '#00aa00'
          }
        }
      }
    )).toEqual({
      tokens: {
        color: {
          text: '#111111',
          muted: '#999999'
        }
      },
      components: {
        thought: {
          titleColor: '#888888'
        },
        tool: {
          successColor: '#00aa00'
        }
      }
    });
  });

  it('maps theme tokens into agentdown css vars', () => {
    expect(resolveAgentdownThemeCssVars({
      tokens: {
        color: {
          text: '#101010'
        },
        layout: {
          radius: '20px'
        }
      },
      components: {
        thought: {
          titleColor: '#aaaaaa',
          lineColor: '#dddddd'
        },
        tool: {
          surfaceBackground: '#fafafa',
          dangerColor: '#cc0000'
        }
      },
      cssVars: {
        '--agentdown-custom-demo': '#f0f0f0'
      }
    })).toMatchObject({
      '--agentdown-text-color': '#101010',
      '--agentdown-radius': '20px',
      '--agentdown-thought-title-color': '#aaaaaa',
      '--agentdown-thought-line-color': '#dddddd',
      '--agentdown-tool-surface-bg': '#fafafa',
      '--agentdown-tool-status-danger-color': '#cc0000',
      '--agentdown-custom-demo': '#f0f0f0'
    });
  });
});
