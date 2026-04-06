import { toolByName, type ToolNameComponentMap, type ToolNameRegistryResult, type ToolNameRegistrySharedOptions } from '../toolNameRegistry';
import type { AutoGenToolRendererContext } from './types';

/**
 * 从 AutoGen tool payload 上解析工具名。
 */
function resolveAutoGenToolName(context: AutoGenToolRendererContext): string | undefined {
  return typeof context.tool?.name === 'string' && context.tool.name.length > 0
    ? context.tool.name
    : undefined;
}

/**
 * 为 AutoGen 创建一组“按工具名渲染组件”的快捷配置。
 */
export function defineAutoGenToolComponents(
  definitions: ToolNameComponentMap,
  options: ToolNameRegistrySharedOptions = {}
): ToolNameRegistryResult<AutoGenToolRendererContext> {
  return toolByName<AutoGenToolRendererContext>(definitions, {
    ...options,
    resolveName: resolveAutoGenToolName
  });
}
