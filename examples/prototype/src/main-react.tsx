import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactApp } from './ReactApp';
import './style.css';

const target = document.getElementById('app');
if (!target) throw new Error('工作台挂载节点不存在。');
createRoot(target).render(<StrictMode><ReactApp /></StrictMode>);
