import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createLangChainProtocol } from './protocol';
import type {
  LangChainAdapterOptions,
  LangChainEvent
} from './types';

/**
 * 创建 LangChain 官方 starter adapter。
 *
 * 这个入口会自动帮用户装配：
 * - LangChain 官方事件协议
 * - markdown assembler
 * - 工具名组件 helper
 * - 事件到组件 helper
 */
export function createLangChainAdapter<
  TSource = AsyncIterable<LangChainEvent> | Iterable<LangChainEvent>
>(options: LangChainAdapterOptions<TSource> = {}): AgentdownAdapter<LangChainEvent, TSource> {
  return createFrameworkAdapter<LangChainEvent, TSource, NonNullable<LangChainAdapterOptions<TSource>['protocolOptions']>, NonNullable<LangChainAdapterOptions<TSource>['title']>, NonNullable<LangChainAdapterOptions<TSource>['tools']> | undefined, NonNullable<LangChainAdapterOptions<TSource>['events']> | undefined, LangChainAdapterOptions<TSource>>({
    name: 'langchain',
    options,
    createProtocol: createLangChainProtocol
  });
}
