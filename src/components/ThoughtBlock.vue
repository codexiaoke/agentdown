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
    class="agentdown-thought"
    :data-expanded="expanded ? 'true' : 'false'"
  >
    <button
      type="button"
      class="agentdown-thought-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="agentdown-thought-copy">
        <span
          class="agentdown-thought-marker"
          aria-hidden="true"
        />
        <span class="agentdown-thought-title">{{ title }}</span>
      </span>
      <span
        class="agentdown-thought-chevron"
        aria-hidden="true"
      />
    </button>

    <transition name="agentdown-thought-transition">
      <div
        v-if="expanded"
        class="agentdown-thought-body"
      >
        <slot />
      </div>
    </transition>
  </section>
</template>
