import type {
  AgentdownConfig,
  AgentdownDiagnostic,
  AgentdownDiagnosticsConfig
} from './types';

export type AgentdownDiagnosticInput = Omit<AgentdownDiagnostic, 'timestamp'> & {
  timestamp?: number;
};

/** 把未知异常压缩成适合日志与遥测传输的稳定字段。 */
export function describeAgentdownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {})
    };
  }

  return {
    message: String(error)
  };
}

/**
 * 向当前配置的全部诊断处理器广播事件。
 *
 * 诊断永远是旁路能力：关闭诊断或某个 handler 抛错都不会改变产品运行结果。
 */
export function reportAgentdownDiagnostic(
  config: Pick<AgentdownConfig, 'diagnostics'> | undefined,
  input: AgentdownDiagnosticInput
): AgentdownDiagnostic {
  const diagnostic: AgentdownDiagnostic = Object.freeze({
    ...input,
    timestamp: input.timestamp ?? Date.now()
  });
  const diagnostics: AgentdownDiagnosticsConfig | undefined = config?.diagnostics;

  if (diagnostics?.enabled === false) {
    return diagnostic;
  }

  for (const handler of diagnostics?.handlers ?? []) {
    try {
      handler(diagnostic);
    } catch (error) {
      globalThis.console?.error?.('[Agentdown] diagnostic handler failed.', error);
    }
  }

  return diagnostic;
}
