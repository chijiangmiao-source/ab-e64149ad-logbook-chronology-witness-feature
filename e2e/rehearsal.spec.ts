import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** 从第 0 行起逐行填写（字段按 testid 定位）。 */
async function fillRows(
  page: import('@playwright/test').Page,
  rows: { id: string; u: string; v: string; c: string }[],
): Promise<void> {
  for (let i = 3; i < rows.length; i++) {
    await page.getByTestId('add-row').click();
  }
  for (let i = 0; i < rows.length; i++) {
    await page.getByTestId(`row-${i}-id`).fill(rows[i].id);
    await page.getByTestId(`row-${i}-u`).fill(rows[i].u);
    await page.getByTestId(`row-${i}-v`).fill(rows[i].v);
    await page.getByTestId(`row-${i}-c`).fill(rows[i].c);
  }
}

test('预演入口仅在相容结论后出现；负环批次不提供收紧预演', async ({ page }) => {
  await page.getByTestId('load-negative').click();
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('row-0-rehearse')).toHaveCount(0);
});

test('临界值两侧各一单位：c′=τ 安全、c′=τ-1 越界并给出逐步累计矛盾链', async ({ page }) => {
  // #1 a→b(5)、#2 b→a(-3)：环权 2 相容；排除 #1 后返回路径仅 #2，权 -3，τ=3。
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();

  await page.getByTestId('row-0-rehearse').click();
  await expect(page.getByTestId('rehearsal-panel')).toBeVisible();
  await expect(page.getByTestId('rehearsal-target')).toContainText('目标断言 #1');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('1 条边');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('总权重 -3');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('τ = 3');

  // 临界值 τ=3：闭环权和恰为 0，判安全。
  await page.getByTestId('rehearsal-c').fill('3');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();
  await expect(page.getByTestId('rehearsal-safe')).toContainText('恰为临界值');
  await expect(page.getByTestId('rehearsal-violation')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-write')).toBeVisible();

  // 临界值上方一单位仍安全。
  await page.getByTestId('rehearsal-c').fill('4');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();

  // 临界值下方一单位越界：拟议断言 #1(c=2) + 返回 #2(-3) = -1，禁止写回。
  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();
  await expect(page.getByTestId('rehearsal-write')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('拟议断言');
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('断言 #1');
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('date(b) − date(a) ≤ 2');
  await expect(page.getByTestId('rehearsal-step-0-sum')).toHaveText('累计和 = 2');
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #2');
  await expect(page.getByTestId('rehearsal-step-1-sum')).toHaveText('累计和 = -1');
  await expect(page.getByTestId('rehearsal-total')).toContainText('累计总和 = -1');
});

test('安全预演一键写回该行、清除旧结论，并支持写回后再次考证', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
  await page.getByTestId('row-0-rehearse').click();

  // 写回一个安全但非临界的值 c′=4（τ=3）。
  await page.getByTestId('rehearsal-c').fill('4');
  await page.getByTestId('rehearsal-write').click();

  // 录入表被更新，预演面板与旧相容结论均消失，出现就地反馈。
  await expect(page.getByTestId('row-0-c')).toHaveValue('4');
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('result-consistent')).toHaveCount(0);
  await expect(page.getByTestId('write-notice')).toBeVisible();
  await expect(page.getByTestId('write-notice')).toContainText('第 1 行');
  await expect(page.getByTestId('write-notice')).toContainText('c = 4');

  // 写回后再次考证：c=4 仍 ≥ τ=3，仍相容。
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();

  // 再次预演：以写回后的新原值 4 为准，τ 仍为 3；越过临界仍正确报矛盾。
  await page.getByTestId('row-0-rehearse').click();
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('τ = 3');
  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();
  await expect(page.getByTestId('rehearsal-total')).toContainText('累计总和 = -1');
});

test('无返回路径时明确标注无有限临界值，收紧到任意值都安全', async ({ page }) => {
  // 单向链 a→b→c：排除 #1 后 b 无法回到 a。
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'c', c: '4' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();

  await expect(page.getByTestId('rehearsal-unbounded')).toBeVisible();
  await expect(page.getByTestId('rehearsal-unbounded')).toContainText('无有限临界值');
  await expect(page.getByTestId('rehearsal-threshold')).toHaveCount(0);

  await page.getByTestId('rehearsal-c').fill('-100000');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();
  await expect(page.getByTestId('rehearsal-safe')).toContainText('任意收紧');
  await expect(page.getByTestId('rehearsal-write')).toBeVisible();
});

test('零权回路不干扰最小返回路径：仍取简单、边数最少者', async ({ page }) => {
  // #5 a→b(10)；#6 b→a(-2) 为直接返回；#7 b→z(0)、#8 z→b(0) 构成零权回路。
  await fillRows(page, [
    { id: '5', u: 'a', v: 'b', c: '10' },
    { id: '6', u: 'b', v: 'a', c: '-2' },
    { id: '7', u: 'b', v: 'z', c: '0' },
    { id: '8', u: 'z', v: 'b', c: '0' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();

  // 最小返回路径是直接边 #6（1 条边、权 -2、τ=2），零权回路不使其变长或变权。
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('1 条边');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('τ = 2');

  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();
  await page.getByTestId('rehearsal-c').fill('1');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();
  // 矛盾链只含拟议边与直接返回边，不含零权回路上的 #7、#8。
  await expect(page.getByTestId('rehearsal-step-0')).toContainText('断言 #5');
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #6');
  await expect(page.getByTestId('rehearsal-panel')).not.toContainText('断言 #7');
  await expect(page.getByTestId('rehearsal-panel')).not.toContainText('断言 #8');
});

test('平行边与并列返回路径：唯一证明链取编号序列字典序最小者', async ({ page }) => {
  // 目标 #5 a→b(10)；两条等权（0）等边数（2）返回路径 [1,3] 与 [2,4]，取 [1,3]。
  await fillRows(page, [
    { id: '5', u: 'a', v: 'b', c: '10' },
    { id: '1', u: 'b', v: 'x', c: '0' },
    { id: '3', u: 'x', v: 'a', c: '0' },
    { id: '2', u: 'b', v: 'y', c: '0' },
    { id: '4', u: 'y', v: 'a', c: '0' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();

  await expect(page.getByTestId('rehearsal-threshold')).toContainText('2 条边');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('τ = 0');

  await page.getByTestId('rehearsal-c').fill('0');
  await expect(page.getByTestId('rehearsal-safe')).toBeVisible();
  await page.getByTestId('rehearsal-c').fill('-1');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #1');
  await expect(page.getByTestId('rehearsal-step-2')).toContainText('断言 #3');
  await expect(page.getByTestId('rehearsal-panel')).not.toContainText('断言 #2');
  await expect(page.getByTestId('rehearsal-panel')).not.toContainText('断言 #4');
});

test('同向平行边不能充当返回路径', async ({ page }) => {
  // #1、#2 都是 a→b（平行同向），只有 #3 b→a(-2) 能返回；τ=2。
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'a', v: 'b', c: '3' },
    { id: '3', u: 'b', v: 'a', c: '-2' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('1 条边');
  await expect(page.getByTestId('rehearsal-threshold')).toContainText('τ = 2');

  await page.getByTestId('rehearsal-c').fill('1');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();
  await expect(page.getByTestId('rehearsal-step-1')).toContainText('断言 #3');
  await expect(page.getByTestId('rehearsal-panel')).not.toContainText('断言 #2');
});

test('预演中修改任意录入字段：预演与旧结论立即作废并给就地反馈', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();

  // 修改另一行的字段，过期的越界矛盾链与相容结论必须立即消失。
  await page.getByTestId('row-1-c').fill('-4');
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('result-consistent')).toHaveCount(0);
  await expect(page.getByTestId('void-notice')).toBeVisible();
  await expect(page.getByTestId('void-notice')).toContainText('修订预演立即作废');

  // 修改后的批次（环权 5-4=1）仍相容，重新考证与重新预演正常。
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
});

test('删除预演目标行：预演立即作废并给出针对性就地反馈', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();
  await expect(page.getByTestId('rehearsal-panel')).toBeVisible();

  await page.getByTestId('row-0-remove').click();
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('void-notice')).toContainText('目标行已被删除');
});

test('删除非目标行同样立即作废预演', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();

  await page.getByTestId('row-1-remove').click();
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('void-notice')).toContainText('录入表已变化');
});

test('新 c 非法或大于原值时就地标错且不出判定', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();

  await page.getByTestId('rehearsal-c').fill('6');
  await expect(page.getByTestId('rehearsal-c-error')).toContainText('不大于原值 5');
  await expect(page.getByTestId('rehearsal-safe')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-violation')).toHaveCount(0);

  await page.getByTestId('rehearsal-c').fill('1.5');
  await expect(page.getByTestId('rehearsal-c-error')).toContainText('整数');

  await page.getByTestId('rehearsal-c').fill('100001');
  await expect(page.getByTestId('rehearsal-c-error')).toContainText('-100000 至 100000');

  await page.getByTestId('rehearsal-c').fill('');
  await expect(page.getByTestId('rehearsal-c-error')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-safe')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-violation')).toHaveCount(0);
});

test('取消预演：面板关闭但相容结论保留', async ({ page }) => {
  await fillRows(page, [
    { id: '1', u: 'a', v: 'b', c: '5' },
    { id: '2', u: 'b', v: 'a', c: '-3' },
  ]);
  await page.getByTestId('compute-button').click();
  await page.getByTestId('row-0-rehearse').click();
  await page.getByTestId('rehearsal-c').fill('2');
  await expect(page.getByTestId('rehearsal-violation')).toBeVisible();

  await page.getByTestId('rehearsal-cancel').click();
  await expect(page.getByTestId('rehearsal-panel')).toHaveCount(0);
  await expect(page.getByTestId('result-consistent')).toBeVisible();
});
