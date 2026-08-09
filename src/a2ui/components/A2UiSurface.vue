<script setup lang="ts">
import type {
  ComponentApi,
  SurfaceModel
} from '@a2ui/web_core/v0_9';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { RuntimeData, RuntimeIntent, SurfaceBlock } from '../../runtime/types';
import { defaultA2UiBasicCatalog } from '../catalog';
import {
  createA2UiSurfaceController,
  type A2UiSurfaceController
} from '../surfaceController';
import type {
  A2UiActionState,
  A2UiActionStateMap,
  A2UiClientEnvelope,
  A2UiErrorContext,
  A2UiSecurityPolicy,
  A2UiSurfaceBlockData,
  A2UiVersion,
  A2UiVueCatalog
} from '../types';
import A2UiNode from './A2UiNode.vue';

interface Props {
  /** 独立使用时直接传入消息；RunSurface 模式下会从 block.data 读取。 */
  messages?: ReadonlyArray<unknown>;
  surfaceId?: string;
  rootId?: string;
  catalogs?: ReadonlyArray<A2UiVueCatalog<ComponentApi>>;
  version?: A2UiVersion;
  includeInlineCatalogs?: boolean;
  securityPolicy?: Partial<A2UiSecurityPolicy>;
  block?: SurfaceBlock<A2UiSurfaceBlockData>;
  emitIntent?: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
  /**
   * 可等待的 transport 回调。与 `@client-message` 不同，它的 Promise 会直接驱动
   * action pending / success / error 生命周期。
   */
  sendClientMessage?: (envelope: A2UiClientEnvelope) => void | Promise<void>;
  /** 恢复连接或宿主执行互斥操作时统一禁止 Surface action。 */
  interactionDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  catalogs: () => [defaultA2UiBasicCatalog],
  version: 'v0.9.1'
});

const emit = defineEmits<{
  clientMessage: [envelope: A2UiClientEnvelope];
  actionStateChange: [state: A2UiActionState, states: A2UiActionStateMap];
  error: [context: A2UiErrorContext];
}>();

const controller = shallowRef<A2UiSurfaceController<ComponentApi> | null>(null);
const surface = shallowRef<SurfaceModel<ComponentApi> | null>(null);
const revision = ref(0);
const errorMessage = ref<string | null>(null);
const actionStates = shallowRef<A2UiActionStateMap>({});

const blockData = computed<A2UiSurfaceBlockData | null>(() => {
  const data = props.block?.data;
  return data && typeof data === 'object' ? data : null;
});
const resolvedMessages = computed<ReadonlyArray<unknown>>(() => props.messages ?? blockData.value?.messages ?? []);
const resolvedSurfaceId = computed(() => props.surfaceId ?? blockData.value?.surfaceId ?? 'root');
const resolvedRootId = computed(() => props.rootId ?? blockData.value?.rootId ?? 'root');
const resolvedCatalog = computed(() => props.catalogs.find(
  (catalog) => catalog.id === surface.value?.catalog.id
));

function disposeController() {
  controller.value?.dispose();
  controller.value = null;
  surface.value = null;
  actionStates.value = {};
}

function reportError(context: A2UiErrorContext) {
  errorMessage.value = context.error instanceof Error ? context.error.message : String(context.error);
  emit('error', context);
  if (context.phase === 'validation' || context.phase === 'processing') {
    const activeController = controller.value;
    if (activeController) {
      void handleClientMessage(activeController.createClientEnvelope({
        version: activeController.version,
        error: {
          code: 'CLIENT_PROCESSING_ERROR',
          surfaceId: context.surfaceId ?? resolvedSurfaceId.value,
          message: errorMessage.value
        }
      })).catch(() => undefined);
    }
  }
}

async function handleClientMessage(envelope: A2UiClientEnvelope): Promise<void> {
  emit('clientMessage', envelope);
  props.emitIntent?.({
    type: 'a2ui.client-message',
    blockId: props.block?.id ?? null,
    nodeId: props.block?.nodeId ?? null,
    payload: envelope as unknown as RuntimeData
  });
  await props.sendClientMessage?.(envelope);
}

function rebuildController() {
  disposeController();
  errorMessage.value = null;

  try {
    const nextController = createA2UiSurfaceController<ComponentApi>({
      surfaceId: resolvedSurfaceId.value,
      catalogs: props.catalogs,
      version: props.version,
      includeInlineCatalogs: props.includeInlineCatalogs,
      ...(props.securityPolicy ? { policy: props.securityPolicy } : {}),
      onChange(nextSurface) {
        surface.value = nextSurface ?? null;
        revision.value += 1;
      },
      onClientMessage: handleClientMessage,
      onActionStateChange(state, states) {
        actionStates.value = states;
        emit('actionStateChange', state, states);
      }
    });
    controller.value = nextController;
    nextController.sync(resolvedMessages.value);
  } catch (error) {
    reportError({
      phase: 'processing',
      error,
      surfaceId: resolvedSurfaceId.value
    });
  }
}

watch(
  () => [
    resolvedSurfaceId.value,
    props.catalogs,
    props.version,
    props.includeInlineCatalogs,
    props.securityPolicy
  ] as const,
  rebuildController,
  { immediate: true }
);

watch(
  resolvedMessages,
  (messages) => {
    errorMessage.value = null;
    try {
      controller.value?.sync(messages);
    } catch (error) {
      reportError({
        phase: 'processing',
        error,
        surfaceId: resolvedSurfaceId.value
      });
    }
  },
  { immediate: true, deep: true }
);

onBeforeUnmount(disposeController);
</script>

<template>
  <section
    class="agentdown-a2ui-surface"
    :data-a2ui-surface-id="resolvedSurfaceId"
    aria-live="polite"
  >
    <div v-if="errorMessage" class="agentdown-a2ui-surface__error" role="alert">
      <strong>A2UI surface rejected</strong>
      <span>{{ errorMessage }}</span>
    </div>
    <A2UiNode
      v-else-if="surface && resolvedCatalog"
      :surface="surface"
      :catalog="resolvedCatalog"
      :component-id="resolvedRootId"
      base-path="/"
      :revision="revision"
      :security-policy="controller!.policy"
      :action-states="actionStates"
      :retry-action="controller!.retryAction"
      :interaction-disabled="interactionDisabled"
    />
  </section>
</template>

<style scoped>
.agentdown-a2ui-surface {
  width: min(100%, 44rem);
  min-width: 0;
  padding: 0.2rem 0;
  color: var(--agentdown-text, #172033);
  font-family: var(--agentdown-font-family, inherit);
}
.agentdown-a2ui-surface__error {
  display: grid;
  gap: 0.25rem;
  padding: 0.8rem;
  border: 1px solid #fda29b;
  border-radius: 0.7rem;
  background: #fff1f0;
  color: #b42318;
}
</style>
