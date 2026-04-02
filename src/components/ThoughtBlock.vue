<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  title: string;
}

defineProps<Props>();

const expanded = ref(false);
</script>

<template>
  <section
    class="vpm-thought"
    :data-expanded="expanded ? 'true' : 'false'"
  >
    <button
      type="button"
      class="vpm-thought-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="vpm-thought-copy">
        <span
          class="vpm-thought-marker"
          aria-hidden="true"
        />
        <span class="vpm-thought-title">{{ title }}</span>
      </span>
      <span
        class="vpm-thought-chevron"
        aria-hidden="true"
      />
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
