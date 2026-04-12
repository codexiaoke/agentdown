import type { AgentdownAdapter } from '../../runtime/defineAdapter';
import { createFrameworkAdapter } from '../shared/adapterFactory';
import { createSpringAiProtocol } from './protocol';
import type {
  SpringAiAdapterOptions,
  SpringAiEvent
} from './types';

/**
 * 创建 Spring AI 官方 starter adapter。
 *
 * 这个入口会自动帮用户装配：
 * - Spring AI 官方事件协议
 * - markdown assembler
 * - 工具名组件 helper
 * - 事件到组件 helper
 */
export function createSpringAiAdapter<
  TSource = AsyncIterable<SpringAiEvent> | Iterable<SpringAiEvent>
>(options: SpringAiAdapterOptions<TSource> = {}): AgentdownAdapter<SpringAiEvent, TSource> {
  return createFrameworkAdapter<SpringAiEvent, TSource, NonNullable<SpringAiAdapterOptions<TSource>['protocolOptions']>, NonNullable<SpringAiAdapterOptions<TSource>['title']>, NonNullable<SpringAiAdapterOptions<TSource>['tools']> | undefined, NonNullable<SpringAiAdapterOptions<TSource>['events']> | undefined, SpringAiAdapterOptions<TSource>>({
    name: 'springai',
    options,
    createProtocol: createSpringAiProtocol
  });
}
