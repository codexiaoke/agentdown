import type { AgentActions, AgentSession } from './types.js';

/** Framework bindings share command names; all state transitions belong to the Session. */
export function createAgentActions(session: AgentSession): AgentActions {
  return Object.freeze({
    send: (input, parentExecutionId) => session.dispatch({ type: 'send', input, ...(parentExecutionId === undefined ? {} : { parentExecutionId }) }),
    respond: (interactionId, response) => session.dispatch({ type: 'respond', interactionId, response }),
    regenerate: (turnId, fromExecutionId) => session.dispatch({ type: 'regenerate', turnId, ...(fromExecutionId === undefined ? {} : { fromExecutionId }) }),
    cancel: (executionId) => session.dispatch({ type: 'cancelExecution', executionId }),
    disconnect: (executionId) => session.dispatch({ type: 'disconnect', ...(executionId === undefined ? {} : { executionId }) }),
    resume: (executionId) => session.dispatch({ type: 'resume', executionId }),
    retryOperation: (operationId) => session.dispatch({ type: 'retryOperation', operationId }),
    surfaceAction: (surfaceId, action) => session.dispatch({ type: 'surfaceAction', surfaceId, action }),
    updateAgentState: (update) => session.dispatch({ type: 'updateAgentState', update }),
    dispatch: (action) => session.dispatch(action),
  } satisfies AgentActions);
}
