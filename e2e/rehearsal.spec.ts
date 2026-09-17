import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** 录入一个有正松弛的二元系统：#1 a→b(5)，#2 b→a(-2)，收紧 #1 的临界值为 2。 */
async function setupTwoNodeBatch(page: import('@playwright/test').Page) {
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('5');
  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill('b');
  await page.getByTestId('row-1-v').fill('a');
  await page.getByTestId('row-1-c').fill('-2');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
}

test('相容结论旁可对指定断言发起收紧预演', async ({ page }) => {
  await setupTwoNodeBatch(page);

  // 负环结论下没有预演入口；相容后每行出现“收紧预演”。
  await expect(page.getByTestId('row-0-rehearse')).toBeVisible();
  await page.getByTestId('row-0-rehearse').click();

  const panel = page.getByTestId('rehearsal-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('rehearsal-target')).toContainText('断言 #1');
  await expect(page.getByTestId('rehearsal-target')).toContainText('date(b) − date(a) ≤ 5');
  await expect(page.getByTestId('rehearsal-pending')).toBeVisible();
});

test('临界值处安全、前一单位越界：展示逐步累计矛盾链且禁止写回', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  const input = page.getByTestId('rehearsal-c');

  // 临界值 2：cNew = 2 安全（虽然 2 < 原值 5，属于合法收紧）。
  await input.fill('2');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('临界值为 2');
  await expect(page.getByTestId('rehearsal-writeback')).toBeVisible();

  // 再收紧一单位到 1：越界，矛盾链 = 拟议断言 #1(1) + 返回路径 #2(-2) = -1。
  await input.fill('1');
  await expect(page.getByTestId('rehearsal-violated')).toBeVisible();
  await expect(page.getByTestId('rehearsal-violated')).toContainText('临界值为 2');
  await expect(page.getByTestId('rehearsal-writeback')).toHaveCount(0);

  await expect(page.getByTestId('rehearsal-step-0')).toContainText('断言 #1');
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('date(b) − date(a) ≤ 1');
  await expect(page.getByTestId('rehearsal-step-0-sum')).toHaveText('累计和 = 1');

  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #2');
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('date(a) − date(b) ≤ -2');
  await expect(page.getByTestId('rehearsal-step-1-sum')).toHaveText('累计和 = -1');

  await expect(page.getByTestId('rehearsal-total')).toContainText('累计总和 = -1');
  await expect(page.getByTestId('rehearsal-total')).toContainText('总和小于零');

  // 改回安全值后写回按钮恢复。
  await input.fill('2');
  await expect(page.getByTestId('rehearsal-writeback')).toBeVisible();
});

test('安全预演一键写回该行、清除旧结论，写回后可再次考证', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('2');
  await page.getByTestId('rehearsal-writeback').click();

  // 录入表该行被写回，预演面板与相容旧结论同时消失。
  await expect(page.getByTestId('row-0-c')).toHaveValue('2');
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('result-consistent')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-void')).toHaveCount(0);

  // 写回后的再次考证：临界值处仍相容。
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();

  // 再收紧一单位（现在原值为 2）必检出同一负环，与预演结论一致。
  await page.getByTestId('row-0-c').fill('1');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-meta')).toContainText('[1, 2]');
  await expect(page.getByTestId('cycle-total')).toContainText('累计总和 = -1');
});

test('无返回路径标为无有限临界值，写回任意收紧值后仍相容', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('5');
  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill('b');
  await page.getByTestId('row-1-v').fill('c');
  await page.getByTestId('row-1-c').fill('1');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();

  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('-100000');
  await expect(page.getByTestId('rehearsal-unbounded')).toBeVisible();
  await expect(page.getByTestId('rehearsal-unbounded')).toContainText('无有限临界值');

  await page.getByTestId('rehearsal-writeback').click();
  await expect(page.getByTestId('row-0-c')).toHaveValue('-100000');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
});

test('零权回路不进入返回证明链：边数最少的唯一链', async ({ page }) => {
  // #1 s→a(5) 为修订目标；#2 a→s(-2) 是权重 -2 的一步返回；
  // #3 a→b(0)、#4 b→a(0) 组成零权回路，绕行总权重仍为 -2 但边数更多，须落选。
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('s');
  await page.getByTestId('row-0-v').fill('a');
  await page.getByTestId('row-0-c').fill('5');
  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill('a');
  await page.getByTestId('row-1-v').fill('s');
  await page.getByTestId('row-1-c').fill('-2');
  await page.getByTestId('row-2-id').fill('3');
  await page.getByTestId('row-2-u').fill('a');
  await page.getByTestId('row-2-v').fill('b');
  await page.getByTestId('row-2-c').fill('0');
  await page.getByTestId('add-row').click();
  await page.getByTestId('row-3-id').fill('4');
  await page.getByTestId('row-3-u').fill('b');
  await page.getByTestId('row-3-v').fill('a');
  await page.getByTestId('row-3-c').fill('0');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();

  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('1'); // threshold = 2，1 越界
  await expect(page.getByTestId('rehearsal-violated')).toBeVisible();
  await expect(page.getByTestId('rehearsal-violated')).toContainText('1 条边');
  await expect(page.getByTestId('rehearsal-violated')).toContainText('总权重 -2');
  // 矛盾链只有拟议断言 + 1 条返回边，零权回路的 #3、#4 不出现。
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('断言 #1');
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #2');
  await expect(page.getByTestId(/rehearsal-step-[2-9]/)).toHaveCount(0);
});

test('平行返回边按编号序列确定性取舍', async ({ page }) => {
  // #1 a→b(5) 为修订目标；b→a 有平行边 #2(-2) 与 #4(0)，最短唯一取 #2。
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('5');
  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill('b');
  await page.getByTestId('row-1-v').fill('a');
  await page.getByTestId('row-1-c').fill('-2');
  await page.getByTestId('row-2-id').fill('4');
  await page.getByTestId('row-2-u').fill('b');
  await page.getByTestId('row-2-v').fill('a');
  await page.getByTestId('row-2-c').fill('0');
  await page.getByTestId('compute-button').click();

  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('1');
  await expect(page.getByTestId('rehearsal-violated')).toBeVisible();
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #2');
  await expect(page.getByTestId('rehearsal-step-1-sum')).toHaveText('累计和 = -1');
});

test('非法拟议值就地反馈且无写回入口', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  const input = page.getByTestId('rehearsal-c');

  await input.fill('abc');
  await expect(page.getByTestId('rehearsal-invalid')).toContainText('须为整数');
  await expect(page.getByTestId('rehearsal-writeback')).toHaveCount(0);

  await input.fill('5'); // 等于原值：允许预演，结论仍为安全
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();

  await input.fill('6'); // 大于原值（放宽）：拒绝
  await expect(page.getByTestId('rehearsal-invalid')).toContainText('不大于原值 5');

  await input.fill('-100001');
  await expect(page.getByTestId('rehearsal-invalid')).toContainText('-100000 至 100000');

  // 清空后回到待输入提示，不保留过期判定。
  await input.fill('');
  await expect(page.getByTestId('rehearsal-pending')).toBeVisible();
  await expect(page.getByTestId('rehearsal-invalid')).toHaveCount(0);
});

test('预演进行中录入变化立即作废预演并就地反馈', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('1');
  await expect(page.getByTestId('rehearsal-violated')).toBeVisible();

  // 修改任意录入（含与目标无关的行）立即作废。
  await page.getByTestId('row-1-c').fill('0');
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-void')).toBeVisible();
  await expect(page.getByTestId('rehearsal-void')).toContainText('录入内容已变化');
  // 旧相容结论也同时清除。
  await expect(page.getByTestId('result-consistent')).toHaveCount(0);

  // 重新考证后旧作废反馈消失，可再次发起预演。
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
  await expect(page.getByTestId('rehearsal-void')).toHaveCount(0);
});

test('删除预演目标行立即作废预演并给出删除反馈', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();

  await page.getByTestId('row-0-remove').click();
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-void')).toContainText('目标行已被删除');
});

test('取消预演不留任何反馈', async ({ page }) => {
  await setupTwoNodeBatch(page);
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('1');
  await expect(page.getByTestId('rehearsal-violated')).toBeVisible();

  await page.getByTestId('rehearsal-cancel').click();
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-void')).toHaveCount(0);
  // 相容结论保持不变。
  await expect(page.getByTestId('result-consistent')).toBeVisible();
});
