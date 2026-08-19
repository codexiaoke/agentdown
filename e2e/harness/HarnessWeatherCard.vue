<script setup lang="ts">
defineProps<{
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}>();
</script>

<template>
  <article data-testid="unified-weather-card">
    <h3>{{ city }} {{ temperature }}°C</h3>
    <p>{{ condition }} · 湿度 {{ humidity }}% · 风速 {{ windSpeed }} m/s</p>
  </article>
</template>
