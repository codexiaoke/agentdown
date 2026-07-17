<script setup lang="ts">
import { computed } from 'vue';
import type { AgentComponentRegistration, AgentComponentRegistry } from '../core/types';

interface Props {
  name: string;
  componentProps: Record<string, unknown>;
  components: AgentComponentRegistry;
  minHeight: number;
}

const props = defineProps<Props>();

const registration = computed<AgentComponentRegistration | null>(() => {
  const candidate = props.components[props.name];

  if (!candidate) {
    return null;
  }

  // 兼容简写和完整注册对象两种写法，降低使用门槛。
  if (typeof candidate === 'object' && 'component' in candidate) {
    return candidate as AgentComponentRegistration;
  }

  return {
    component: candidate
  };
});

const forwardedProps = computed(() => {
  return {
    ...props.componentProps
  };
});
</script>

<template>
  <div
    class="agentdown-component"
    :style="{ minHeight: `${minHeight}px` }"
  >
    <Transition
      name="agentdown-component-transition"
      appear
      mode="out-in"
    >
      <div
        :key="registration ? name : `missing-${name}`"
        class="agentdown-component-content"
      >
        <component
          :is="registration?.component"
          v-if="registration"
          v-bind="forwardedProps"
        />

        <div
          v-else
          class="agentdown-component-missing"
        >
          Missing registered component: <code>{{ name }}</code>
        </div>
      </div>
    </Transition>
  </div>
</template>
