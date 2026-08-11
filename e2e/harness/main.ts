import { createApp } from 'vue';
import App from './App.vue';
import '../../src/styles/theme.css';
import { browserAgentdown } from './agentdown';

createApp(App).use(browserAgentdown.plugin).mount('#app');
