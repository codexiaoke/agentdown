import { toolByName, type ToolNameComponentMap, type ToolNameRegistryResult, type ToolNameRegistrySharedOptions } from '../toolNameRegistry';
import type { LangChainToolRendererContext } from './types';

/**
 * 从 LangChain tool payload 上解析工具名。
 */
function resolveLangChainToolName(context: LangChainToolRendererContext): string | undefined {
  return typeof context.tool?.name === 'string' && context.tool.name.length > 0
    ? context.tool.name
    : undefined;
}

/**
 * 为 LangChain 创建一组“按工具名渲染组件”的快捷配置。
 */
export function defineLangChainToolComponents(
  definitions: ToolNameComponentMap,
  options: ToolNameRegistrySharedOptions = {}
): ToolNameRegistryResult<LangChainToolRendererContext> {
  return toolByName<LangChainToolRendererContext>(definitions, {
    ...options,
    resolveName: resolveLangChainToolName
  });
}
