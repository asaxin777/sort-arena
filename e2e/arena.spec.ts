import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function setRange(locator: Locator, value: number) {
  await locator.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(locator).toHaveValue(String(value));
}

async function loadCustom(page: Page, text = '3, 2, 1') {
  await page.getByRole('button', { name: '自訂陣列' }).click();
  await page.locator('#custom-array').fill(text);
  await page.getByRole('button', { name: '載入陣列' }).click();
  await expect(page.locator('#custom-array')).toHaveCount(0);
}

async function barHeights(page: Page, index: number) {
  return page.locator('.bar-chart').nth(index).locator('rect').evaluateAll(
    elements => elements.map(element => element.getAttribute('height')),
  );
}

interface ExportedResult {
  initialArray: number[];
  seed: string;
  algorithms: { algorithm: string; comparisons: number; swaps: number; steps: number; sortedArray: number[] }[];
}

async function exportedResult(page: Page): Promise<ExportedResult> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出結果 JSON' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^sort-arena-.+\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as ExportedResult;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('初始雙側資料一致，音效預設關閉，單步需要先暫停', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '讓演算法，跑給你看。' })).toBeVisible();
  expect(await barHeights(page, 0)).toEqual(await barHeights(page, 1));
  expect(await barHeights(page, 0)).toHaveLength(30);
  await expect(page.getByTestId('quick-steps')).toHaveText('0');
  await expect(page.getByTestId('bubble-steps')).toHaveText('0');
  await expect(page.getByRole('button', { name: '單步', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '排序音效' })).toHaveAttribute('aria-pressed', 'false');
});

test('自訂資料驗證、暫停凍結、單步、完成、匯出與靜音回放', async ({ page }) => {
  await page.getByRole('button', { name: '自訂陣列' }).click();
  await page.locator('#custom-array').fill('1,,3');
  await page.getByRole('button', { name: '載入陣列' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#custom-array')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#custom-array').fill('3, 2, 1');
  await page.getByRole('button', { name: '載入陣列' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await barHeights(page, 0)).toEqual(await barHeights(page, 1));

  await setRange(page.getByLabel('播放速度'), 1);
  await page.getByRole('button', { name: '開始競賽' }).click();
  await expect(page.getByRole('button', { name: '套用資料' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自訂陣列' })).toBeDisabled();
  await page.getByRole('button', { name: '暫停競賽' }).click();
  const beforeQuick = Number(await page.getByTestId('quick-steps').textContent());
  const beforeBubble = Number(await page.getByTestId('bubble-steps').textContent());
  const pausedHeights = await barHeights(page, 1);
  await page.waitForTimeout(1_100); // Longer than one 1 Hz playback interval.
  await expect(page.getByTestId('quick-steps')).toHaveText(String(beforeQuick));
  await expect(page.getByTestId('bubble-steps')).toHaveText(String(beforeBubble));
  expect(await barHeights(page, 1)).toEqual(pausedHeights);
  await page.getByRole('button', { name: '單步', exact: true }).click();
  await expect(page.getByTestId('quick-steps')).toHaveText(String(beforeQuick + 1));
  await expect(page.getByTestId('bubble-steps')).toHaveText(String(beforeBubble + 1));
  // The clicked button keeps focus: ArrowRight must still step both lanes.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('quick-steps')).toHaveText(String(beforeQuick + 2));
  await expect(page.getByTestId('bubble-steps')).toHaveText(String(beforeBubble + 2));
  // A range input owns its arrow keys and must not step the race.
  await page.getByLabel('播放速度').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('quick-steps')).toHaveText(String(beforeQuick + 2));
  await expect(page.getByTestId('bubble-steps')).toHaveText(String(beforeBubble + 2));

  await setRange(page.getByLabel('播放速度'), 60);
  await page.getByRole('button', { name: '繼續競賽' }).click();
  const resultPanel = page.getByRole('region', { name: '競賽結果' });
  await expect(resultPanel).toBeVisible();
  await expect(page.getByTestId('bubble-comparisons')).toHaveText('3');
  await expect(page.getByTestId('bubble-swaps')).toHaveText('3');
  await expect(page.getByTestId('bubble-steps')).toHaveText('6');
  await expect(page.locator('.bar-chart > title').nth(0)).toHaveText('Quick Sort：1, 2, 3');
  await expect(page.locator('.bar-chart > title').nth(1)).toHaveText('Bubble Sort：1, 2, 3');

  const original = await exportedResult(page);
  expect(original.initialArray).toEqual([3, 2, 1]);
  expect(original.algorithms[1]).toMatchObject({ comparisons: 3, swaps: 3, steps: 6, sortedArray: [1, 2, 3] });
  const replay = page.getByLabel('排序回放進度');
  const max = Number(await replay.getAttribute('max'));
  await setRange(replay, 0);
  await expect(page.getByTestId('bubble-steps')).toHaveText('0');
  await expect(page.locator('.bar-chart > title').nth(1)).toHaveText('Bubble Sort：3, 2, 1');
  expect(await exportedResult(page)).toEqual(original);
  await setRange(replay, max);
  await expect(page.getByTestId('bubble-steps')).toHaveText('6');
  await expect(page.locator('.bar-chart > title').nth(1)).toHaveText('Bubble Sort：1, 2, 3');
  await page.getByRole('button', { name: '重設同一份資料' }).click();
  await expect(resultPanel).toHaveCount(0);
  await expect(page.getByTestId('quick-steps')).toHaveText('0');
  await expect(page.getByTestId('bubble-steps')).toHaveText('0');
  await expect(page.locator('.bar-chart > title').nth(1)).toHaveText('Bubble Sort：3, 2, 1');
});

test('相同 seed 可重現資料，隨機換題會產生新 seed', async ({ page }) => {
  const seed = page.getByLabel('隨機種子 Seed');
  await seed.fill('reproducible-experiment');
  await page.getByRole('button', { name: '套用資料' }).click();
  const first = await barHeights(page, 0);
  await page.getByRole('button', { name: '隨機換一組資料' }).click();
  await expect(seed).not.toHaveValue('reproducible-experiment');
  await seed.fill('reproducible-experiment');
  await page.getByRole('button', { name: '套用資料' }).click();
  expect(await barHeights(page, 0)).toEqual(first);
  expect(await barHeights(page, 1)).toEqual(first);
});

test('已排序資料讓 Bubble Sort 以 n−1 次比較、零交換提早完成', async ({ page }) => {
  await page.getByLabel('資料分布').selectOption('sorted');
  await setRange(page.getByLabel('元素數量', { exact: true }), 10);
  await page.getByRole('button', { name: '套用資料' }).click();
  await page.getByRole('button', { name: 'Bubble Sort', exact: true }).click();
  await page.getByLabel('預測理由').fill('資料已經排序，第一輪不會交換。');
  await setRange(page.getByLabel('播放速度'), 60);
  await page.getByRole('button', { name: '開始競賽' }).click();
  await expect(page.getByRole('region', { name: '競賽結果' })).toBeVisible();
  await expect(page.getByTestId('bubble-comparisons')).toHaveText('9');
  await expect(page.getByTestId('bubble-swaps')).toHaveText('0');
  await expect(page.getByRole('heading', { name: /Bubble Sort 勝出/ })).toBeVisible();
  await expect(page.getByText(/預測命中！/)).toBeVisible();
  await expect(page.getByText('你的預測理由：資料已經排序，第一輪不會交換。')).toBeVisible();

  // A replay changes the displayed operations, never the recorded finish times.
  const finishTimes = await page.locator('.lane .time').allTextContents();
  expect(finishTimes.every(time => parseFloat(time) > 0)).toBe(true);
  const replay = page.getByLabel('排序回放進度');
  const max = Number(await replay.getAttribute('max'));
  await setRange(replay, 0);
  await expect(page.locator('.lane .time')).toHaveText(finishTimes);
  await setRange(replay, max);
  await expect(page.locator('.lane .time')).toHaveText(finishTimes);
});

test('暫停保留未滿一秒的進度，繼續時延用同一個播放節拍', async ({ page }) => {
  // Freeze browser time so this regression cannot depend on worker/CI latency.
  await page.clock.install({ time: new Date('2026-10-30T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
  await page.reload();
  await loadCustom(page);
  await setRange(page.getByLabel('播放速度'), 1);
  await page.getByRole('button', { name: '開始競賽' }).click();
  await page.clock.runFor(600);
  await expect(page.getByTestId('quick-steps')).toHaveText('0');
  await expect(page.getByTestId('bubble-steps')).toHaveText('0');
  await page.getByRole('button', { name: '暫停競賽' }).click();
  const pausedTimes = await page.locator('.lane .time').allTextContents();
  expect(pausedTimes.every(time => parseFloat(time) >= 0.5)).toBe(true);
  await page.clock.runFor(1_000);
  await expect(page.locator('.lane .time')).toHaveText(pausedTimes);
  await expect(page.getByTestId('quick-steps')).toHaveText('0');
  await expect(page.getByTestId('bubble-steps')).toHaveText('0');
  await page.getByRole('button', { name: '繼續競賽' }).click();
  await page.clock.runFor(700);
  await expect(page.getByTestId('quick-steps')).toHaveText('1');
  await expect(page.getByTestId('bubble-steps')).toHaveText('1');
  const resumedTimes = await page.locator('.lane .time').allTextContents();
  expect(resumedTimes.every(time => parseFloat(time) >= 1)).toBe(true);
});

test('快捷鍵對話框限制 Tab 焦點，Escape 關閉後回到開啟按鈕', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '鍵盤快捷鍵說明' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '鍵盤快捷鍵' });
  await expect(dialog).toBeVisible();
  const close = page.getByRole('button', { name: '關閉快捷鍵說明' });
  await expect(close).toBeFocused();
  for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('使用者可以開啟音效、調整音量和來源，再靜音而不中斷操作', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await loadCustom(page);
  await setRange(page.getByLabel('音量', { exact: true }), 12);
  await page.getByLabel('聲音來源', { exact: true }).selectOption('quick');
  const sound = page.getByRole('button', { name: '排序音效' });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '開始競賽' }).click();
  await expect(page.getByRole('region', { name: '競賽結果' })).toBeVisible();
  await page.getByLabel('聲音來源', { exact: true }).selectOption('both');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '重設同一份資料' }).click();
  await expect(page.getByRole('button', { name: '開始競賽' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('390px 手機版沒有橫向溢出且核心控制可操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '雙演算法競技場' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await loadCustom(page);
  await setRange(page.getByLabel('播放速度'), 60);
  await page.getByRole('button', { name: '開始競賽' }).click();
  await expect(page.getByRole('region', { name: '競賽結果' })).toBeVisible();
  await page.getByRole('button', { name: '學習筆記', exact: true }).click();
  await expect(page.getByRole('heading', { name: '從一步交換，理解一個演算法。' })).toBeVisible();
  const learningDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(learningDimensions.document).toBeLessThanOrEqual(learningDimensions.viewport);
});
