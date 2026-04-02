<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  title: string;
}

defineProps<Props>();

const expanded = ref(false);
</script>

<template>
  <section class="vpm-thought">
    <button
      type="button"
      class="vpm-thought-toggle"
      @click="expanded = !expanded"
    >
      <span>{{ title }}</span>
      <span>{{ expanded ? 'Hide' : 'Show' }}</span>
    </button>

    <transition name="vpm-thought-transition">
      <div
        v-if="expanded"
        class="vpm-thought-body"
      >
        <slot />
      </div>
    </transition>
  </section>
</template>
