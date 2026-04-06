import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createCrewAIProtocol } from './protocol';
import type {
  CrewAIAdapterOptions,
  CrewAIEvent
} from './types';

/**
 * 创建 CrewAI 官方 starter adapter。
 */
export function createCrewAIAdapter<
  TSource = AsyncIterable<CrewAIEvent> | Iterable<CrewAIEvent>
>(options: CrewAIAdapterOptions<TSource> = {}): AgentdownAdapter<CrewAIEvent, TSource> {
  return createFrameworkAdapter<CrewAIEvent, TSource, NonNullable<CrewAIAdapterOptions<TSource>['protocolOptions']>, NonNullable<CrewAIAdapterOptions<TSource>['title']>, NonNullable<CrewAIAdapterOptions<TSource>['tools']> | undefined, NonNullable<CrewAIAdapterOptions<TSource>['events']> | undefined, CrewAIAdapterOptions<TSource>>({
    name: 'crewai',
    options,
    createProtocol: createCrewAIProtocol
  });
}
