import type { Tool } from '@ag-ui/core';
import type { Component } from 'vue';
import type { RunSurfaceRendererContext, RunSurfaceRendererMap } from '../../surface/types';

const ANSWER_COMPONENT_RENDERER_PREFIX = 'answer-component.';
const MAX_COMPONENT_ARGUMENTS_BYTES = 64 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface AgentAnswerComponentDefinition {
  /** 前端实际渲染的 Vue 组件；Agent 只会看到 name、description 和 propsSchema。 */
  component: Component;
  /** 告诉 Agent 何时应该选择这个组件。 */
  description: string;
  /** 组件 props 的 JSON Schema，同时作为 AG-UI tool parameters 发送。 */
  propsSchema: Record<string, unknown>;
}

export type AgentAnswerComponentMap = Readonly<Record<string, AgentAnswerComponentDefinition>>;

export interface AgentAnswerComponentRegistry {
  /** 发送给 Agent 的标准 AG-UI tools，不包含任何 Vue 实现。 */
  tools: readonly Tool[];
  /** 注册到 RunSurface 的白名单 renderer。 */
  renderers: RunSurfaceRendererMap;
  resolveRenderer: (toolName: string | undefined) => string | undefined;
}

function validateComponentName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(name)) {
    throw new Error(`Invalid answer component name: ${name}.`);
  }
}

function validatePropsSchema(name: string, schema: Record<string, unknown>): void {
  if (schema.type !== 'object') {
    throw new Error(`Answer component ${name} propsSchema.type must be "object".`);
  }
}

function validatePropsValue(value: unknown, path = '$', depth = 0): void {
  if (depth > 12) {
    throw new Error(`Answer component props are nested too deeply at ${path}.`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    if (value.length > 16 * 1024) {
      throw new Error(`Answer component prop is too long at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) {
      throw new Error(`Answer component prop array is too large at ${path}.`);
    }
    value.forEach((item, index) => validatePropsValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Answer component props contain a forbidden key at ${path}.${key}.`);
      }
      validatePropsValue(item, `${path}.${key}`, depth + 1);
    }
    return;
  }
  throw new Error(`Answer component props contain a non-JSON value at ${path}.`);
}

/** 读取并限制 Agent 返回的组件 props；非法输入会安全降级为空对象。 */
export function parseAgentAnswerComponentProps(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return {};
  if (new TextEncoder().encode(value).byteLength > MAX_COMPONENT_ARGUMENTS_BYTES) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    validatePropsValue(parsed);
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rendererKey(name: string): string {
  return `${ANSWER_COMPONENT_RENDERER_PREFIX}${name}`;
}

function componentRendererProps(context: RunSurfaceRendererContext): Record<string, unknown> {
  const componentProps = parseAgentAnswerComponentProps(context.block.data.arguments);
  return {
    ...componentProps,
    answerComponentProps: componentProps,
    block: context.block,
    runtime: context.runtime,
    snapshot: context.snapshot,
    emitIntent: context.emitIntent,
    ...(context.node ? { node: context.node } : {})
  };
}

/**
 * 把前端组件白名单同时转换为：
 * - Agent 可选择的标准 AG-UI tools
 * - 浏览器可执行的 Vue renderer
 */
export function defineAgentAnswerComponents(
  components: AgentAnswerComponentMap
): AgentAnswerComponentRegistry {
  const tools: Tool[] = [];
  const renderers: RunSurfaceRendererMap = {};
  const names = new Set<string>();

  for (const [name, definition] of Object.entries(components)) {
    validateComponentName(name);
    validatePropsSchema(name, definition.propsSchema);
    const description = definition.description.trim();
    if (!description) {
      throw new Error(`Answer component ${name} requires a description.`);
    }

    names.add(name);
    tools.push({
      name,
      description,
      parameters: definition.propsSchema,
      metadata: { kind: 'frontend-answer-component' }
    });
    renderers[rendererKey(name)] = {
      component: definition.component,
      props: componentRendererProps
    };
  }

  return {
    tools,
    renderers,
    resolveRenderer(toolName) {
      return toolName && names.has(toolName) ? rendererKey(toolName) : undefined;
    }
  };
}
