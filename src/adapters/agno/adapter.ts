import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createAgnoProtocol } from './protocol';
import type {
  AgnoAdapterOptions,
  AgnoEvent
} from './types';

/**
 * 创建 Agno 官方 starter adapter。
 *
 * 这个入口会自动帮用户装配：
 * - Agno 官方事件协议
 * - markdown assembler
 * - 工具名组件 helper
 * - 事件到组件 helper
 */
export function createAgnoAdapter<
  TSource = AsyncIterable<AgnoEvent> | Iterable<AgnoEvent>
>(options: AgnoAdapterOptions<TSource> = {}): AgentdownAdapter<AgnoEvent, TSource> {
  return createFrameworkAdapter<AgnoEvent, TSource, NonNullable<AgnoAdapterOptions<TSource>['protocolOptions']>, NonNullable<AgnoAdapterOptions<TSource>['title']>, NonNullable<AgnoAdapterOptions<TSource>['tools']> | undefined, NonNullable<AgnoAdapterOptions<TSource>['events']> | undefined, AgnoAdapterOptions<TSource>>({
    name: 'agno',
    options,
    createProtocol: createAgnoProtocol
  });
}
