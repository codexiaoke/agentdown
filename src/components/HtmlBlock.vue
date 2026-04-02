<script setup lang="ts">
interface Props {
  html: string;
}

defineProps<Props>();
</script>

<template>
  <div
    class="vpm-html-block"
    v-html="html"
  />
</template>
