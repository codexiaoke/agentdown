import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createAgUiProtocol } from './protocol';
import type { AgUiAdapterOptions, AgUiEvent, AgUiProtocolOptions } from './types';

/** 创建只处理 AG-UI 标准事件的 adapter。应用扩展由独立协议按需组合。 */
export function createAgUiAdapter<
  TSource = AsyncIterable<AgUiEvent> | Iterable<AgUiEvent>
>(options: AgUiAdapterOptions<TSource> = {}): AgentdownAdapter<AgUiEvent, TSource> {
  return createFrameworkAdapter<
    AgUiEvent,
    TSource,
    AgUiProtocolOptions,
    AgUiProtocolOptions['defaultRunTitle'],
    undefined,
    undefined,
    AgUiAdapterOptions<TSource>
  >({
    name: 'ag-ui',
    options,
    createProtocol: createAgUiProtocol
  });
}
