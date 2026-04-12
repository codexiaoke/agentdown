import { toolByName, type ToolNameComponentMap, type ToolNameRegistryResult, type ToolNameRegistrySharedOptions } from '../toolNameRegistry';
import type { SpringAiToolRendererContext } from './types';

/**
 * 从 Spring AI tool payload 上解析最常见的工具名字段。
 */
function resolveSpringAiToolName(context: SpringAiToolRendererContext): string | undefined {
  const tool = context.tool;

  if (typeof tool?.tool_name === 'string' && tool.tool_name.length > 0) {
    return tool.tool_name;
  }

  return typeof tool?.name === 'string' && tool.name.length > 0
    ? tool.name
    : undefined;
}

/**
 * 为 Spring AI 创建一组“按工具名渲染组件”的快捷配置。
 */
export function defineSpringAiToolComponents(
  definitions: ToolNameComponentMap,
  options: ToolNameRegistrySharedOptions = {}
): ToolNameRegistryResult<SpringAiToolRendererContext> {
  return toolByName<SpringAiToolRendererContext>(definitions, {
    ...options,
    resolveName: resolveSpringAiToolName
  });
}
