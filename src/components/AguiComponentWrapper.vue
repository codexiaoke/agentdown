<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, watch } from 'vue';
import { AGUI_NODE_CONTEXT_KEY, type AguiNodeContext } from '../composables/useAguiNode';
import { AGUI_RUNTIME_KEY } from '../core/aguiRuntime';
import type { AguiBinding, AguiComponentMap, AguiComponentRegistration, AguiRuntime } from '../core/types';

const refUsageCounts = new WeakMap<AguiRuntime, Map<string, number>>();
const warnedDuplicateRefs = new WeakMap<AguiRuntime, Set<string>>();

function getRuntimeRefCounts(runtime: AguiRuntime) {
  const existing = refUsageCounts.get(runtime);

  if (existing) {
    return existing;
  }

  const created = new Map<string, number>();
  refUsageCounts.set(runtime, created);
  return created;
}

function getWarnedDuplicateSet(runtime: AguiRuntime) {
  const existing = warnedDuplicateRefs.get(runtime);

  if (existing) {
    return existing;
  }

  const created = new Set<string>();
  warnedDuplicateRefs.set(runtime, created);
  return created;
}

interface Props {
  name: string;
  componentProps: Record<string, unknown>;
  components: AguiComponentMap;
  minHeight: number;
}

const props = defineProps<Props>();
const runtime = inject(AGUI_RUNTIME_KEY, null);

const registration = computed<AguiComponentRegistration | null>(() => {
  const candidate = props.components[props.name];

  if (!candidate) {
    return null;
  }

  // 兼容简写和完整注册对象两种写法，降低使用门槛。
  if (typeof candidate === 'object' && 'component' in candidate) {
    return candidate as AguiComponentRegistration;
  }

  return {
    component: candidate
  };
});

const aguiRefId = computed(() => {
  const candidate = props.componentProps.ref;

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
});

const aguiBinding = computed<AguiBinding | null>(() => {
  if (!runtime || !aguiRefId.value) {
    return null;
  }

  return runtime.binding(aguiRefId.value);
});

const aguiState = computed(() => aguiBinding.value?.stateRef.value ?? null);
const aguiChildren = computed(() => aguiBinding.value?.childrenRef.value ?? []);
const aguiEvents = computed(() => aguiBinding.value?.eventsRef.value ?? []);

const aguiContext: AguiNodeContext = {
  id: aguiRefId,
  runtime,
  binding: aguiBinding,
  state: aguiState,
  children: aguiChildren,
  events: aguiEvents
};

const forwardedProps = computed(() => {
  const nextProps = {
    ...props.componentProps
  };

  // 运行态 ref 由 wrapper 接管，避免和组件本身的 props 混在一起。
  delete nextProps.ref;
  return nextProps;
});

provide(AGUI_NODE_CONTEXT_KEY, aguiContext);

let trackedRefId: string | null = null;

function unregisterRef(refId: string | null) {
  if (!runtime || !refId) {
    return;
  }

  const counts = refUsageCounts.get(runtime);
  const nextCount = (counts?.get(refId) ?? 0) - 1;

  if (!counts) {
    return;
  }

  if (nextCount > 0) {
    counts.set(refId, nextCount);
    return;
  }

  counts.delete(refId);
}

function registerRef(refId: string | null) {
  if (!runtime || !refId) {
    return;
  }

  const counts = getRuntimeRefCounts(runtime);
  const nextCount = (counts.get(refId) ?? 0) + 1;
  counts.set(refId, nextCount);

  if (import.meta.env.DEV && nextCount > 1) {
    const warnedRefs = getWarnedDuplicateSet(runtime);

    if (!warnedRefs.has(refId)) {
      warnedRefs.add(refId);
      console.warn(
        `[Agentdown] Duplicate AGUI ref "${refId}" detected. Components using the same ref share one runtime binding. ` +
          'Use unique refs unless shared state is intentional.'
      );
    }
  }
}

watch(
  aguiRefId,
  (nextRefId) => {
    if (trackedRefId === nextRefId) {
      return;
    }

    unregisterRef(trackedRefId);
    registerRef(nextRefId);
    trackedRefId = nextRefId;
  },
  {
    immediate: true
  }
);

onBeforeUnmount(() => {
  unregisterRef(trackedRefId);
});
</script>

<template>
  <div
    class="agentdown-agui"
    :style="{ minHeight: `${minHeight}px` }"
  >
    <Transition
      name="agentdown-agui-transition"
      appear
      mode="out-in"
    >
      <div
        :key="registration ? name : `missing-${name}`"
        class="agentdown-agui-content"
      >
        <component
          :is="registration?.component"
          v-if="registration"
          v-bind="forwardedProps"
          :agui="aguiBinding"
          :agui-ref-id="aguiRefId"
          :agui-state="aguiState"
          :agui-children="aguiChildren"
          :agui-events="aguiEvents"
          :agui-runtime="runtime"
        />

        <div
          v-else
          class="agentdown-agui-missing"
        >
          Missing AGUI component: <code>{{ name }}</code>
        </div>
      </div>
    </Transition>
  </div>
</template>
