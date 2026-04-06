import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createAutoGenProtocol } from './protocol';
import type {
  AutoGenAdapterOptions,
  AutoGenEvent
} from './types';

/**
 * 创建 AutoGen 官方 starter adapter。
 */
export function createAutoGenAdapter<
  TSource = AsyncIterable<AutoGenEvent> | Iterable<AutoGenEvent>
>(options: AutoGenAdapterOptions<TSource> = {}): AgentdownAdapter<AutoGenEvent, TSource> {
  return createFrameworkAdapter<AutoGenEvent, TSource, NonNullable<AutoGenAdapterOptions<TSource>['protocolOptions']>, NonNullable<AutoGenAdapterOptions<TSource>['title']>, NonNullable<AutoGenAdapterOptions<TSource>['tools']> | undefined, NonNullable<AutoGenAdapterOptions<TSource>['events']> | undefined, AutoGenAdapterOptions<TSource>>({
    name: 'autogen',
    options,
    createProtocol: createAutoGenProtocol
  });
}
