import { createAgentdown } from '../../src/config/createAgentdown';

export const browserAgentdown = createAgentdown({
  runtime: {
    limits: {
      maxNodes: 100,
      maxBlocks: 200
    }
  },
  markdown: {
    performance: {
      mode: 'window',
      virtualize: false
    }
  },
  surface: {
    performance: {
      groupWindow: false,
      lazyMount: false
    }
  }
});
