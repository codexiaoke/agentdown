import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import OnlineDemo from './components/OnlineDemo.vue';
import '../../../src/styles/theme.css';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('OnlineDemo', OnlineDemo);
  }
} satisfies Theme;
