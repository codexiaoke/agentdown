<script setup lang="ts">
import type {
  A2uiClientAction,
  ComponentApi,
  Subscription,
  SurfaceModel
} from '@a2ui/web_core/v0_9';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { RuntimeIntent, SurfaceBlock } from '../../runtime/types';
import { defaultA2UiBasicCatalog } from '../catalog';
import { createA2UiProcessor, type A2UiProcessor } from '../processor';
import type {
  A2UiErrorContext,
  A2UiSecurityPolicy,
  A2UiSurfaceBlockData,
  A2UiVueCatalog
} from '../types';
import A2UiNode from './A2UiNode.vue';

interface Props {
  /** 独立使用时直接传入消息；RunSurface 模式下会从 block.data 读取。 */
  messages?: ReadonlyArray<unknown>;
  surfaceId?: string;
  rootId?: string;
  catalog?: A2UiVueCatalog<ComponentApi>;
  securityPolicy?: Partial<A2UiSecurityPolicy>;
  block?: SurfaceBlock<A2UiSurfaceBlockData>;
  emitIntent?: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

const props = withDefaults(defineProps<Props>(), {
  catalog: () => defaultA2UiBasicCatalog
});

const emit = defineEmits<{
  action: [action: A2uiClientAction];
  error: [context: A2UiErrorContext];
}>();

const controller = shallowRef<A2UiProcessor<ComponentApi> | null>(null);
const surface = shallowRef<SurfaceModel<ComponentApi> | null>(null);
const revision = ref(0);
const errorMessage = ref<string | null>(null);
let subscriptions: Subscription[] = [];

const blockData = computed<A2UiSurfaceBlockData | null>(() => {
  const data = props.block?.data;
  return data && typeof data === 'object' ? data : null;
});
const resolvedMessages = computed<ReadonlyArray<unknown>>(() => props.messages ?? blockData.value?.messages ?? []);
const resolvedSurfaceId = computed(() => props.surfaceId ?? blockData.value?.surfaceId ?? 'root');
const resolvedRootId = computed(() => props.rootId ?? blockData.value?.rootId ?? 'root');

function clearSubscriptions() {
  subscriptions.forEach((subscription) => subscription.unsubscribe());
  subscriptions = [];
}

function disposeController() {
  clearSubscriptions();
  controller.value?.dispose();
  controller.value = null;
  surface.value = null;
}

function reportError(context: A2UiErrorContext) {
  errorMessage.value = context.error instanceof Error ? context.error.message : String(context.error);
  emit('error', context);
}

function handleAction(action: A2uiClientAction) {
  emit('action', action);
  props.emitIntent?.({
    type: 'a2ui.action',
    blockId: props.block?.id ?? null,
    nodeId: props.block?.nodeId ?? null,
    payload: action
  });
}

function subscribeSurface(nextSurface: SurfaceModel<ComponentApi>) {
  clearSubscriptions();
  subscriptions.push(nextSurface.componentsModel.onCreated.subscribe((component) => {
    revision.value += 1;
    subscriptions.push(component.onUpdated.subscribe(() => {
      revision.value += 1;
    }));
  }));
  subscriptions.push(nextSurface.componentsModel.onDeleted.subscribe(() => {
    revision.value += 1;
  }));
  subscriptions.push(nextSurface.dataModel.subscribe('/', () => {
    revision.value += 1;
  }));

  for (const [, component] of nextSurface.componentsModel.entries) {
    subscriptions.push(component.onUpdated.subscribe(() => {
      revision.value += 1;
    }));
  }
}

function rebuild(messages: ReadonlyArray<unknown>) {
  disposeController();
  errorMessage.value = null;

  if (messages.length === 0) {
    return;
  }

  try {
    const nextController = createA2UiProcessor<ComponentApi>({
      catalogs: [props.catalog],
      ...(props.securityPolicy ? { policy: props.securityPolicy } : {}),
      onAction: handleAction
    });
    nextController.process(messages);
    const nextSurface = nextController.getSurface(resolvedSurfaceId.value);
    if (!nextSurface) {
      throw new Error(`A2UI surface not found: ${resolvedSurfaceId.value}.`);
    }

    controller.value = nextController;
    surface.value = nextSurface;
    subscribeSurface(nextSurface);
    revision.value += 1;
  } catch (error) {
    reportError({
      phase: 'processing',
      error,
      surfaceId: resolvedSurfaceId.value
    });
  }
}

watch(
  () => [resolvedMessages.value, resolvedSurfaceId.value, props.catalog, props.securityPolicy] as const,
  ([messages]) => rebuild(messages),
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
      v-else-if="surface"
      :surface="surface"
      :catalog="catalog"
      :component-id="resolvedRootId"
      base-path="/"
      :revision="revision"
      :security-policy="controller!.policy"
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
