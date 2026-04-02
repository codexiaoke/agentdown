<script setup lang="ts">
import { computed } from 'vue';
import type { AguiComponentMap, AguiComponentRegistration } from '../core/types';

interface Props {
  name: string;
  componentProps: Record<string, unknown>;
  components: AguiComponentMap;
  minHeight: number;
}

const props = defineProps<Props>();

const registration = computed<AguiComponentRegistration | null>(() => {
  const candidate = props.components[props.name];

  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'object' && 'component' in candidate) {
    return candidate as AguiComponentRegistration;
  }

  return {
    component: candidate
  };
});
</script>

<template>
  <div
    class="vpm-agui"
    :style="{ minHeight: `${minHeight}px` }"
  >
    <component
      :is="registration?.component"
      v-if="registration"
      v-bind="componentProps"
    />

    <div
      v-else
      class="vpm-agui-missing"
    >
      Missing AGUI component: <code>{{ name }}</code>
    </div>
  </div>
</template>
