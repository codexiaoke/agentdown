<script setup lang="ts">
import {
  ComponentContext,
  GenericBinder,
  type ComponentApi,
  type SurfaceModel
} from '@a2ui/web_core/v0_9';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { A2UiChildReference, A2UiSecurityPolicy, A2UiVueCatalog } from '../types';

interface Props {
  surface: SurfaceModel<ComponentApi>;
  catalog: A2UiVueCatalog<ComponentApi>;
  componentId: string;
  basePath?: string;
  depth?: number;
  ancestors?: string[];
  revision?: number;
  securityPolicy: A2UiSecurityPolicy;
}

const props = withDefaults(defineProps<Props>(), {
  basePath: '/',
  depth: 0,
  ancestors: () => [],
  revision: 0
});

const resolvedProps = ref<Record<string, unknown>>({});
const bindingError = ref<string | null>(null);
let binder: GenericBinder<Record<string, unknown>> | null = null;
let binderSubscription: { unsubscribe: () => void } | null = null;

const componentModel = computed(() => {
  void props.revision;
  return props.surface.componentsModel.get(props.componentId);
});
const componentType = computed(() => componentModel.value?.type ?? '');
const renderer = computed(() => props.catalog.renderers[componentType.value]);
const isCycle = computed(() => props.ancestors.includes(props.componentId));
const exceedsDepth = computed(() => props.depth >= props.securityPolicy.maxDepth);
const nextAncestors = computed(() => [...props.ancestors, props.componentId]);

function disposeBinder() {
  binderSubscription?.unsubscribe();
  binderSubscription = null;
  binder?.dispose();
  binder = null;
}

function rebuildBinder() {
  disposeBinder();
  bindingError.value = null;

  const model = componentModel.value;
  if (!model || isCycle.value || exceedsDepth.value) {
    resolvedProps.value = {};
    return;
  }

  const api = props.catalog.protocol.components.get(model.type);
  if (!api) {
    bindingError.value = `Component is not registered: ${model.type}`;
    return;
  }

  try {
    const context = new ComponentContext(props.surface, props.componentId, props.basePath);
    binder = new GenericBinder<Record<string, unknown>>(context, api.schema);
    resolvedProps.value = { ...binder.snapshot };
    binderSubscription = binder.subscribe((nextProps) => {
      resolvedProps.value = { ...nextProps };
    });
  } catch (error) {
    bindingError.value = error instanceof Error ? error.message : String(error);
  }
}

watch(
  () => [props.surface, props.componentId, props.basePath, props.revision] as const,
  rebuildBinder,
  { immediate: true }
);

onBeforeUnmount(disposeBinder);

function normalizeChildReferences(value: unknown): A2UiChildReference[] {
  if (typeof value === 'string') {
    return [{ id: value, basePath: props.basePath }];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): A2UiChildReference[] => {
    if (typeof entry === 'string') {
      return [{ id: entry, basePath: props.basePath }];
    }
    if (entry && typeof entry === 'object' && 'id' in entry) {
      const candidate = entry as { id?: unknown; basePath?: unknown };
      if (typeof candidate.id === 'string') {
        return [{
          id: candidate.id,
          basePath: typeof candidate.basePath === 'string' ? candidate.basePath : props.basePath
        }];
      }
    }
    return [];
  });
}

const defaultChildren = computed(() => {
  if (componentType.value === 'Row' || componentType.value === 'Column' || componentType.value === 'List') {
    return normalizeChildReferences(resolvedProps.value.children);
  }
  if (componentType.value === 'Card' || componentType.value === 'Button') {
    return normalizeChildReferences(resolvedProps.value.child);
  }
  return [];
});

const tabs = computed(() => Array.isArray(resolvedProps.value.tabs)
  ? resolvedProps.value.tabs as Array<Record<string, unknown>>
  : []);
const modalTrigger = computed(() => normalizeChildReferences(resolvedProps.value.trigger));
const modalContent = computed(() => normalizeChildReferences(resolvedProps.value.content));
</script>

<template>
  <div v-if="isCycle" class="agentdown-a2ui-node-error" role="alert">
    A2UI component cycle detected at {{ componentId }}.
  </div>
  <div v-else-if="exceedsDepth" class="agentdown-a2ui-node-error" role="alert">
    A2UI component depth exceeds {{ securityPolicy.maxDepth }}.
  </div>
  <div v-else-if="bindingError" class="agentdown-a2ui-node-error" role="alert">
    {{ bindingError }}
  </div>
  <div v-else-if="!componentModel" class="agentdown-a2ui-node-error" role="alert">
    A2UI component not found: {{ componentId }}.
  </div>
  <component
    :is="renderer"
    v-else-if="renderer"
    :component-type="componentType"
    :component-id="componentId"
    :resolved-props="resolvedProps"
    :surface="surface"
    :security-policy="securityPolicy"
  >
    <A2UiNode
      v-for="child in defaultChildren"
      :key="`${child.id}:${child.basePath}`"
      :surface="surface"
      :catalog="catalog"
      :component-id="child.id"
      :base-path="child.basePath"
      :depth="depth + 1"
      :ancestors="nextAncestors"
      :revision="revision"
      :security-policy="securityPolicy"
    />

    <template v-for="(tab, index) in tabs" :key="index" #[`tab-${index}`]>
      <A2UiNode
        v-if="typeof tab.child === 'string'"
        :surface="surface"
        :catalog="catalog"
        :component-id="tab.child"
        :base-path="basePath"
        :depth="depth + 1"
        :ancestors="nextAncestors"
        :revision="revision"
        :security-policy="securityPolicy"
      />
    </template>

    <template #trigger>
      <A2UiNode
        v-for="child in modalTrigger"
        :key="`${child.id}:${child.basePath}`"
        :surface="surface"
        :catalog="catalog"
        :component-id="child.id"
        :base-path="child.basePath"
        :depth="depth + 1"
        :ancestors="nextAncestors"
        :revision="revision"
        :security-policy="securityPolicy"
      />
    </template>

    <template #content>
      <A2UiNode
        v-for="child in modalContent"
        :key="`${child.id}:${child.basePath}`"
        :surface="surface"
        :catalog="catalog"
        :component-id="child.id"
        :base-path="child.basePath"
        :depth="depth + 1"
        :ancestors="nextAncestors"
        :revision="revision"
        :security-policy="securityPolicy"
      />
    </template>
  </component>
  <div v-else class="agentdown-a2ui-node-error" role="alert">
    No Vue renderer registered for {{ componentType }}.
  </div>
</template>

<style scoped>
.agentdown-a2ui-node-error {
  padding: 0.65rem 0.75rem;
  border: 1px solid #fda29b;
  border-radius: 0.55rem;
  background: #fff1f0;
  color: #b42318;
  font-size: 0.82rem;
}
</style>
