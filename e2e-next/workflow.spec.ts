import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const started = new Map<string, { executionId: string; turnId: string; conversationId: string }>();
test.beforeEach(async ({ page }) => {
  started.clear();
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().includes('/api/operations')) return;
    const operation = request.postDataJSON();
    if (operation?.action?.type === 'send') started.set(operation.executionId, operation);
  });
});
test.afterEach(async ({ request }) => {
  // Failed browser assertions must not leave reference tasks consuming capacity.
  for (const operation of started.values()) {
    await request.post('/api/operations', {
      data: { ...operation, operationId: `cleanup-${randomUUID()}`, attemptId: `cleanup-${randomUUID()}`, action: { type: 'cancelExecution', executionId: operation.executionId } },
      timeout: 3000,
    });
  }
});

for (const framework of ['vue', 'react']) {
  test(`${framework}: approvals survive refresh, complete and replay without requests`, async ({ page }) => {
    const requests: { url: string; method: string }[] = [];
    const errors: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push({ url: request.url(), method: request.method() });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/${framework}.html`);
    await expect(page.getByTestId('send-task')).toBeEnabled();
    expect(requests).toHaveLength(0);
    await page.getByTestId('task-input').fill(`${framework} complete workflow`);
    await page.getByTestId('send-task').click();
    await expect(page.getByTestId('pending-count')).toHaveText('2 项待确认');
    await expect(page.getByTestId('execution-status')).toHaveText('等待人工决定');
    const ids = await page.locator('[data-testid^="interaction-"][class*="interaction-card"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')));
    await page.getByTestId('disconnect').click();
    await expect(page.getByTestId('connection-status')).toHaveText('连接已断开');
    await expect(page.getByTestId('execution-status')).toHaveText('等待人工决定');
    await Promise.all([page.waitForNavigation(), page.getByTestId('save-reload').click()]);
    await expect(page.getByTestId('pending-count')).toHaveText('2 项待确认');
    expect(await page.locator('[data-testid^="interaction-"][class*="interaction-card"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))).toEqual(ids);
    await expect(page.getByTestId('connection-status')).toHaveText('连接已断开');
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(1);
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('connection-status')).toHaveText('已连接');
    await page.locator('[data-testid^="approve-"]').first().click();
    await expect(page.getByTestId('pending-count')).toHaveText('1 项待确认');
    await page.locator('[data-testid^="reject-"]').first().click();
    await expect(page.getByTestId('execution-status')).toHaveText('已完成');
    await expect(page.locator('[data-testid^="artifact-"][class="artifact-card"]')).toHaveCount(1);
    await expect(page.getByTestId('artifacts')).toContainText('save_report');
    await expect(page.getByTestId('artifacts')).toContainText('publish_summary');
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(3);
    const count = requests.length;
    await Promise.all([page.waitForNavigation(), page.getByTestId('replay').click()]);
    await expect(page.getByTestId('replay-mode')).toBeVisible();
    await expect(page.getByTestId('send-task')).toBeDisabled();
    await expect(page.getByTestId('resume')).toBeDisabled();
    await expect(page.getByTestId('execution-status')).toHaveText('已完成');
    expect(requests).toHaveLength(count);
    expect(errors).toEqual([]);
  });

  test(`${framework}: lost acknowledgement retries the same operation without another POST`, async ({ page }) => {
    const posts: string[] = [];
    const lookups: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/operations')) {
        if (request.method() === 'POST') posts.push(request.postData()!);
        else lookups.push(request.url());
      }
    });
    await page.goto(`/${framework}.html`);
    await page.getByTestId('send-task').click();
    await expect(page.getByTestId('pending-count')).toHaveText('2 项待确认');
    await expect(page.getByTestId('execution-status')).toHaveText('等待人工决定');
    await page.getByTestId('disconnect').click();
    await expect(page.getByTestId('connection-status')).toHaveText('连接已断开');
    await page.getByTestId('simulate-lost-ack').click();
    await page.locator('[data-testid^="approve-"]').first().click();
    await expect(page.getByTestId('uncertain-operation')).toBeVisible();
    const operationId = JSON.parse(posts[1]!).operationId;
    await page.getByTestId(`retry-${operationId}`).click();
    await expect(page.getByTestId('uncertain-operation')).toHaveCount(0);
    await expect(page.getByTestId('pending-count')).toHaveText('1 项待确认');
    expect(posts).toHaveLength(2);
    expect(lookups.some(url => url.endsWith(`/operations/${operationId}`))).toBe(true);
    await page.locator('[data-testid^="reject-"]').first().click();
    await expect(page.getByTestId('execution-status')).toHaveText('已完成');
    expect(posts).toHaveLength(3);
  });
}
