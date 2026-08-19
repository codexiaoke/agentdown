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
  <article class="weather-card" aria-label="天气卡片">
    <header>
      <div>
        <span>当前天气</span>
        <h3>{{ city }}</h3>
      </div>
      <strong>{{ temperature }}°</strong>
    </header>

    <p>{{ condition }}</p>

    <dl>
      <div><dt>湿度</dt><dd>{{ humidity }}%</dd></div>
      <div><dt>风速</dt><dd>{{ windSpeed }} m/s</dd></div>
    </dl>
  </article>
</template>

<style scoped>
.weather-card {
  width: min(100%, 420px);
  border: 1px solid rgba(56, 189, 248, 0.24);
  border-radius: 24px;
  padding: 1.15rem;
  background: linear-gradient(145deg, #ecfeff 0%, #f0f9ff 55%, #eff6ff 100%);
  box-shadow: 0 14px 38px rgba(14, 116, 144, 0.1);
  color: #0f172a;
  box-sizing: border-box;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

header div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

header span,
dt {
  color: #64748b;
  font-size: 0.76rem;
}

h3,
p,
dl,
dd {
  margin: 0;
}

h3 {
  font-size: 1.25rem;
}

header > strong {
  font-size: 2.65rem;
  font-weight: 720;
  letter-spacing: -0.06em;
}

p {
  margin-top: 0.8rem;
  color: #0369a1;
  font-size: 1rem;
  font-weight: 650;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 1rem;
}

dl div {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  border-radius: 16px;
  padding: 0.7rem 0.8rem;
  background: rgba(255, 255, 255, 0.65);
}

dd {
  font-weight: 680;
}
</style>
