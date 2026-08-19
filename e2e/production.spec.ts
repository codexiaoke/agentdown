import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/harness/');
});

test('sanitizes raw HTML in a real browser', async ({ page }) => {
  const security = page.getByTestId('html-security');
  await expect(security.locator('.agentdown-root')).toHaveAttribute('data-agentdown-render-mode', 'window');
  await expect(security.getByText('原始 HTML 安全内容')).toBeVisible();
  await expect(security.locator('#raw-safe')).not.toHaveAttribute('onclick');
  await expect(security.locator('#raw-safe')).not.toHaveAttribute('style');
  await expect(security.locator('#raw-image')).not.toHaveAttribute('onerror');
  await expect(security.locator('#raw-frame')).toHaveCount(0);
  await expect(security.locator('script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __agentdownXss?: boolean }).__agentdownXss)).toBeUndefined();
});

test('streams runtime commands without navigation or browser errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const originalUrl = page.url();
  await expect(page.getByTestId('runtime-stream').locator('.agentdown-run-surface'))
    .toHaveAttribute('data-agentdown-group-window', 'false');
  await expect(page.getByTestId('runtime-stream').locator('.agentdown-run-surface'))
    .toHaveAttribute('data-agentdown-lazy-mount', 'false');

  await page.getByRole('button', { name: '开始流式输出' }).click();

  await expect(page.getByRole('heading', { name: '真实浏览器流式输出' })).toBeVisible();
  await expect(page.getByTestId('runtime-stream')).toContainText('Chrome、Firefox、WebKit');
  await expect(page.getByTestId('runtime-stream')).toContainText('全部收到消息');
  await expect(page).toHaveURL(originalUrl);
  expect(pageErrors).toEqual([]);
});

test('supports A2UI forms, keyboard tabs, modal focus and client actions', async ({ page }) => {
  const surface = page.getByTestId('a2ui-surface');
  await expect(surface.getByRole('heading', { name: '生产级 A2UI 表单' })).toBeVisible();
  await expect(surface.locator('strong')).toContainText('基础 Markdown');
  await expect(surface.locator('code')).toContainText('代码');

  await surface.getByRole('textbox', { name: '计划名称' }).fill('浏览器验收计划');
  await surface.getByRole('checkbox', { name: '启用每日提醒' }).check();
  await surface.getByRole('searchbox', { name: '阅读主题筛选' }).fill('产品');
  await expect(surface.getByText('工程', { exact: true })).toHaveCount(0);
  await surface.getByRole('checkbox', { name: '产品' }).check();
  await surface.getByRole('slider', { name: /每日分钟数/ }).fill('45');
  await surface.getByLabel('开始日期').fill('2026-09-01');

  const firstTab = surface.getByRole('tab', { name: '第一页' });
  const secondTab = surface.getByRole('tab', { name: '第二页' });
  await firstTab.focus();
  await firstTab.press('ArrowRight');
  await expect(secondTab).toBeFocused();
  await expect(secondTab).toHaveAttribute('aria-selected', 'true');
  await expect(surface.getByRole('tabpanel')).toContainText('第二页内容');

  const modalTrigger = surface.getByRole('button', { name: '查看说明' });
  await modalTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'Dialog' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(modalTrigger).toBeFocused();

  const submitButton = surface.getByRole('button', { name: '提交计划' });
  const pendingUi = await submitButton.evaluate(async (element) => {
    (element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      disabled: (element as HTMLButtonElement).disabled,
      busy: element.getAttribute('aria-busy')
    };
  });
  expect(pendingUi).toEqual({ disabled: true, busy: 'true' });
  await expect(page.getByTestId('action-state-history')).toContainText('sending');
  await expect(page.getByTestId('client-envelope')).toContainText('plan_submitted');
  await expect(page.getByTestId('client-envelope')).toContainText('浏览器验收计划');
  await expect(page.getByTestId('client-envelope')).toContainText('product');
  await expect(page.getByTestId('client-envelope')).toContainText('45');
  await expect(page.getByTestId('client-envelope')).toContainText('2026-09-01');

  await expect(surface.getByRole('heading', { name: '✓ 已提交' })).toBeVisible();
  await expect(surface).toContainText('计划名称：浏览器验收计划');
  await expect(surface).toContainText('每日时长：45 分钟');
  await expect(surface.getByRole('button', { name: '提交计划' })).toHaveCount(0);

  await surface.getByRole('button', { name: '修改计划' }).click();
  await expect(surface.getByRole('heading', { name: '生产级 A2UI 表单' })).toBeVisible();
  await expect(surface.getByRole('textbox', { name: '计划名称' })).toHaveValue('浏览器验收计划');
  await expect(surface.getByRole('checkbox', { name: '启用每日提醒' })).toBeChecked();
  await expect(surface.getByRole('slider', { name: /每日分钟数/ })).toHaveValue('45');
  await expect(surface.getByLabel('开始日期')).toHaveValue('2026-09-01');
});

test('renders a read-only A2UI result without inventing actions', async ({ page }) => {
  const weather = page.getByTestId('readonly-weather');

  await expect(weather.getByRole('heading', { name: '深圳' })).toBeVisible();
  await expect(weather).toContainText('26°C · 多云');
  await expect(weather).toContainText('湿度 72%');
  await expect(weather).toContainText('风速 3.2 m/s');
  await expect(weather.getByRole('button')).toHaveCount(0);
  await expect(weather.getByRole('textbox')).toHaveCount(0);
});

test('shows a waiting animation before streaming assistant text incrementally', async ({ page }) => {
  const unified = page.getByTestId('unified-chat');

  await unified.getByRole('button', { name: '统一流：文本' }).click();
  await expect(unified.getByRole('status', { name: '正在思考' })).toBeVisible();
  await expect(unified).toContainText('这是不需要任何 UI');
  expect(await unified.textContent()).not.toContain('这是不需要任何 UI 组件的普通文本回答。');
  await expect(unified).toContainText('这是不需要任何 UI 组件的普通文本回答。');
  await expect(unified.getByRole('status', { name: '正在思考' })).toHaveCount(0);
});

test('uses one chat session for text, frontend components, and dynamic A2UI', async ({ page }) => {
  const unified = page.getByTestId('unified-chat');

  await unified.getByRole('button', { name: '统一流：文本' }).click();
  await expect(unified).toContainText('这是不需要任何 UI 组件的普通文本回答。');
  await expect(unified.getByTestId('unified-weather-card')).toHaveCount(0);

  await unified.getByRole('button', { name: '统一流：天气组件' }).click();
  await expect(unified.getByTestId('unified-weather-card')).toContainText('深圳 26°C');
  await expect(unified.getByTestId('unified-weather-card')).toContainText('湿度 72%');

  await unified.getByRole('button', { name: '统一流：动态 A2UI' }).click();
  await expect(unified.getByRole('heading', { name: '动态读书计划' })).toBeVisible();
  await expect(unified.getByRole('textbox', { name: '书名' }))
    .toHaveValue('Designing Data-Intensive Applications');
  await expect(unified.getByRole('slider', { name: /每日分钟数/ })).toHaveValue('30');
  const assistantMessage = unified.locator(
    '.agentdown-run-surface-group[data-role="assistant"]'
  );
  await expect(assistantMessage).toHaveCount(1);
  await expect(assistantMessage.locator('.agentdown-run-surface-message-actions')).toHaveCount(1);
  await expect(unified.getByTestId('unified-thread-ids'))
    .toHaveText('e2e:unified-chat,e2e:unified-chat,e2e:unified-chat');
});
