import {
  A2uiMessageSchema,
  MessageProcessor,
  type A2uiClientAction,
  type A2uiClientCapabilities,
  type A2uiClientDataModel,
  type A2uiClientError,
  type A2uiMessage,
  type CapabilitiesOptions,
  type ComponentApi,
  type SurfaceModel
} from '@a2ui/web_core/v0_9';
import type { Subscription } from '@a2ui/web_core/v0_9';
import {
  DEFAULT_A2UI_SECURITY_POLICY,
  type A2UiSecurityPolicy,
  type A2UiVersion,
  type A2UiVueCatalog
} from './types';

export interface CreateA2UiProcessorOptions<T extends ComponentApi = ComponentApi> {
  catalogs: ReadonlyArray<A2UiVueCatalog<T>>;
  /** 客户端能力和回传消息使用的协议版本，默认使用当前稳定补丁版 v0.9.1。 */
  version?: A2UiVersion;
  policy?: Partial<A2UiSecurityPolicy>;
  onAction?: (action: A2uiClientAction) => void | Promise<void>;
  onError?: (error: A2uiClientError) => void | Promise<void>;
}

export interface A2UiProcessor<T extends ComponentApi = ComponentApi> {
  readonly processor: MessageProcessor<T>;
  readonly policy: A2UiSecurityPolicy;
  readonly version: A2UiVersion;
  process: (messageOrMessages: unknown | ReadonlyArray<unknown>) => A2uiMessage[];
  getSurface: (surfaceId: string) => SurfaceModel<T> | undefined;
  getClientCapabilities: (options?: CapabilitiesOptions) => A2uiClientCapabilities;
  getClientDataModel: (version?: A2UiVersion) => A2uiClientDataModel | undefined;
  dispose: () => void;
}

function resolvePolicy(overrides: Partial<A2UiSecurityPolicy> | undefined): A2UiSecurityPolicy {
  return {
    ...DEFAULT_A2UI_SECURITY_POLICY,
    ...overrides,
    allowedUrlProtocols: overrides?.allowedUrlProtocols
      ?? DEFAULT_A2UI_SECURITY_POLICY.allowedUrlProtocols
  };
}

function assertBoundedStrings(value: unknown, policy: A2UiSecurityPolicy, path = '$'): void {
  if (typeof value === 'string') {
    if (value.length > policy.maxStringLength) {
      throw new Error(`A2UI string at ${path} exceeds ${policy.maxStringLength} characters.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertBoundedStrings(entry, policy, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error(`A2UI object contains forbidden key at ${path}.${key}.`);
      }
      assertBoundedStrings(entry, policy, `${path}.${key}`);
    }
  }
}

function validateMessage<T extends ComponentApi>(
  input: unknown,
  catalogs: ReadonlyArray<A2UiVueCatalog<T>>,
  policy: A2UiSecurityPolicy
): A2uiMessage {
  const serialized = JSON.stringify(input);
  if (serialized === undefined) {
    throw new Error('A2UI messages must be JSON-serializable values.');
  }
  const messageBytes = new TextEncoder().encode(serialized).byteLength;
  if (messageBytes > policy.maxMessageBytes) {
    throw new Error(`A2UI message exceeds ${policy.maxMessageBytes} bytes.`);
  }

  const isolatedInput = JSON.parse(serialized) as unknown;
  assertBoundedStrings(isolatedInput, policy);

  const parsed = A2uiMessageSchema.parse(isolatedInput) as A2uiMessage;

  if ('createSurface' in parsed) {
    const catalog = catalogs.find((candidate) => candidate.id === parsed.createSurface.catalogId);
    if (!catalog) {
      throw new Error(`A2UI catalog is not allowed: ${parsed.createSurface.catalogId}.`);
    }
  }

  if ('updateComponents' in parsed) {
    if (parsed.updateComponents.components.length > policy.maxComponents) {
      throw new Error(`A2UI update exceeds ${policy.maxComponents} components.`);
    }

    for (const component of parsed.updateComponents.components) {
      if (component.component) {
        const known = catalogs.some((catalog) => catalog.protocol.components.has(component.component));
        if (!known) {
          throw new Error(`A2UI component is not registered: ${component.component}.`);
        }
      }
    }
  }

  return parsed;
}

function countSurfaceComponents<T extends ComponentApi>(surface: SurfaceModel<T>): number {
  return Array.from(surface.componentsModel.entries).length;
}

function assertSurfaceCapacity<T extends ComponentApi>(
  processor: MessageProcessor<T>,
  message: A2uiMessage,
  policy: A2UiSecurityPolicy
): void {
  if (!('updateComponents' in message)) {
    return;
  }

  const surface = processor.model.getSurface(message.updateComponents.surfaceId);
  if (!surface) {
    return;
  }

  const ids = new Set(Array.from(surface.componentsModel.entries, ([id]) => id));
  for (const component of message.updateComponents.components) {
    if (typeof component.id === 'string') {
      ids.add(component.id);
    }
  }

  if (ids.size > policy.maxComponents) {
    throw new Error(`A2UI surface exceeds ${policy.maxComponents} components.`);
  }
}

/**
 * 基于官方 MessageProcessor 创建带 Catalog allowlist 和资源限制的 A2UI 状态处理器。
 */
export function createA2UiProcessor<T extends ComponentApi = ComponentApi>(
  options: CreateA2UiProcessorOptions<T>
): A2UiProcessor<T> {
  if (options.catalogs.length === 0) {
    throw new Error('At least one A2UI catalog is required.');
  }

  const policy = resolvePolicy(options.policy);
  const version = options.version ?? 'v0.9.1';
  const processor = new MessageProcessor<T>(
    options.catalogs.map((catalog) => catalog.protocol),
    options.onAction,
    { version }
  );
  const subscriptions: Subscription[] = [];

  subscriptions.push(processor.onSurfaceCreated((surface) => {
    if (countSurfaceComponents(surface) > policy.maxComponents) {
      throw new Error(`A2UI surface exceeds ${policy.maxComponents} components.`);
    }
    if (options.onError) {
      subscriptions.push(surface.onError.subscribe(options.onError));
    }
  }));

  return {
    processor,
    policy,
    version,
    process(messageOrMessages) {
      const inputs = Array.isArray(messageOrMessages) ? messageOrMessages : [messageOrMessages];
      if (inputs.length > policy.maxMessages) {
        throw new Error(`A2UI batch exceeds ${policy.maxMessages} messages.`);
      }

      const messages = inputs.map((message) => validateMessage(message, options.catalogs, policy));
      for (const message of messages) {
        assertSurfaceCapacity(processor, message, policy);
        processor.processMessages([message]);
      }

      return messages;
    },
    getSurface(surfaceId) {
      return processor.model.getSurface(surfaceId);
    },
    getClientCapabilities(capabilitiesOptions) {
      return processor.getClientCapabilities(capabilitiesOptions);
    },
    getClientDataModel(dataVersion) {
      return processor.getClientDataModel(dataVersion);
    },
    dispose() {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      processor.model.dispose();
    }
  };
}
