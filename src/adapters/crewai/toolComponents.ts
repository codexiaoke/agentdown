import { createToolNameRegistry, type ToolNameComponentMap, type ToolNameRegistryResult, type ToolNameRegistrySharedOptions } from '../toolNameRegistry';
import type { CrewAIToolRendererContext } from './types';

/**
 * 从 CrewAI tool payload 上解析工具名。
 */
function resolveCrewAIToolName(context: CrewAIToolRendererContext): string | undefined {
  return typeof context.tool?.name === 'string' && context.tool.name.length > 0
    ? context.tool.name
    : undefined;
}

/**
 * 为 CrewAI 创建一组“按工具名渲染组件”的快捷配置。
 */
export function defineCrewAIToolComponents(
  definitions: ToolNameComponentMap,
  options: ToolNameRegistrySharedOptions = {}
): ToolNameRegistryResult<CrewAIToolRendererContext> {
  return createToolNameRegistry<CrewAIToolRendererContext>({
    ...options,
    definitions,
    resolveName: resolveCrewAIToolName
  });
}
