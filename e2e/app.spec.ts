import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('首页展示录入表单与规则说明', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '航海日志差分约束负环考证' })).toBeVisible();
  await expect(page.getByTestId('row-0-id')).toBeVisible();
  await expect(page.getByTestId('compute-button')).toBeVisible();
});

test('录入负环批次并按环序展示不等式、累计和与总和小于零结论', async ({ page }) => {
  await page.getByTestId('load-negative').click();
  await page.getByTestId('compute-button').click();

  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-meta')).toContainText('3 条边');
  await expect(page.getByTestId('cycle-meta')).toContainText('[2, 5, 7]');

  // 环序（已旋转至最小编号开头）：#2 补给→离港，#5 离港→靠港，#7 靠港→补给。
  await expect(page.getByTestId('cycle-step-0')).toContainText('断言 #2');
  await expect(page.getByTestId('cycle-step-0')).toContainText('date(离港) − date(补给) ≤ 2');
  await expect(page.getByTestId('cycle-step-0-sum')).toHaveText('累计和 = 2');

  await expect(page.getByTestId('cycle-step-1')).toContainText('断言 #5');
  await expect(page.getByTestId('cycle-step-1')).toContainText('date(靠港) − date(离港) ≤ -6');
  await expect(page.getByTestId('cycle-step-1-sum')).toHaveText('累计和 = -4');

  await expect(page.getByTestId('cycle-step-2')).toContainText('断言 #7');
  await expect(page.getByTestId('cycle-step-2')).toContainText('date(补给) − date(靠港) ≤ 3');
  await expect(page.getByTestId('cycle-step-2-sum')).toHaveText('累计和 = -1');

  await expect(page.getByTestId('cycle-total')).toContainText('累计总和 = -1');
  await expect(page.getByTestId('cycle-total')).toContainText('总和小于零');
});

test('相容批次只显示约束相容，不出现矛盾链', async ({ page }) => {
  await page.getByTestId('load-consistent').click();
  await page.getByTestId('compute-button').click();

  await expect(page.getByTestId('result-consistent')).toBeVisible();
  await expect(page.getByTestId('result-consistent')).toContainText('约束相容');
  await expect(page.getByTestId('result-cycle')).toHaveCount(0);
});

test('手工逐行录入自环负环', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('靠港');
  await page.getByTestId('row-0-v').fill('靠港');
  await page.getByTestId('row-0-c').fill('-1');
  await page.getByTestId('compute-button').click();

  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-step-0')).toContainText('date(靠港) − date(靠港) ≤ -1');
  await expect(page.getByTestId('cycle-total')).toContainText('总和小于零');
});

test('非法编号就地标错并阻止计算', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('0'); // 违反 [1-9][0-9]{0,5}
  await page.getByTestId('row-0-u').fill('靠港');
  await page.getByTestId('row-0-v').fill('补给');
  await page.getByTestId('row-0-c').fill('3');

  await expect(page.getByTestId('row-0-id-error')).toBeVisible();
  await expect(page.getByTestId('compute-button')).toBeDisabled();
  await expect(page.getByTestId('compute-blocked')).toBeVisible();

  // 修正后放行。
  await page.getByTestId('row-0-id').fill('10');
  await expect(page.getByTestId('row-0-id-error')).toHaveCount(0);
  await expect(page.getByTestId('compute-button')).toBeEnabled();
});

test('编号重复时两行均被就地标错', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('7');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('0');
  await page.getByTestId('row-1-id').fill('7');
  await page.getByTestId('row-1-u').fill('b');
  await page.getByTestId('row-1-v').fill('a');
  await page.getByTestId('row-1-c').fill('0');

  await expect(page.getByTestId('row-0-id-error')).toContainText('重复');
  await expect(page.getByTestId('row-1-id-error')).toContainText('重复');
  await expect(page.getByTestId('batch-errors')).toContainText('断言编号 7 重复出现于第 1、2 行');
  await expect(page.getByTestId('compute-button')).toBeDisabled();
});

test('c 越界就地标错', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('100001');
  await expect(page.getByTestId('row-0-c-error')).toContainText('-100000 至 100000');
  await expect(page.getByTestId('compute-button')).toBeDisabled();
});

test('部分填写的行视为非法行并阻止计算', async ({ page }) => {
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('a');
  await page.getByTestId('row-0-v').fill('b');
  await page.getByTestId('row-0-c').fill('0');
  await page.getByTestId('row-1-id').fill('2'); // 其余字段留空

  await expect(page.getByTestId('row-1-u-error')).toBeVisible();
  await expect(page.getByTestId('compute-button')).toBeDisabled();
});

test('含空格与超长的事件名按原样参与计算并得到矛盾链', async ({ page }) => {
  const longName = '第 三 次 远 洋 航 行 日 志'.repeat(6); // 96 字且含空格
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('启航 码头');
  await page.getByTestId('row-0-v').fill(longName);
  await page.getByTestId('row-0-c').fill('-5');

  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill(longName);
  await page.getByTestId('row-1-v').fill('启航 码头');
  await page.getByTestId('row-1-c').fill('1');

  // 含空格 / 超长名称不被判错，按钮可用。
  await expect(page.getByTestId('row-0-u-error')).toHaveCount(0);
  await expect(page.getByTestId('row-0-v-error')).toHaveCount(0);
  await expect(page.getByTestId('compute-button')).toBeEnabled();

  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-step-0')).toContainText(`date(${longName}) − date(启航 码头) ≤ -5`);
  await expect(page.getByTestId('cycle-total')).toContainText('累计总和 = -4');
});

test('输入变化后旧结论被清除', async ({ page }) => {
  await page.getByTestId('load-negative').click();
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();

  await page.getByTestId('row-0-c').fill('100'); // 修改后负环消失
  await expect(page.getByTestId('result-cycle')).toHaveCount(0);
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
});

test('首尾空格是事件名的一部分：不与无空格名称合并，不显示不存在的矛盾链', async ({ page }) => {
  // #1: 靠港 → 补给 (-5)；#2: 补给 → ' 靠港 ' (1)。
  // 终点 ' 靠港 ' 与起点 '靠港' 是两个不同事件，两断言不闭合，必须相容。
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill('靠港');
  await page.getByTestId('row-0-v').fill('补给');
  await page.getByTestId('row-0-c').fill('-5');

  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill('补给');
  await page.getByTestId('row-1-v').fill(' 靠港 ');
  await page.getByTestId('row-1-c').fill('1');

  await expect(page.getByTestId('compute-button')).toBeEnabled();
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-consistent')).toBeVisible();
  await expect(page.getByTestId('result-cycle')).toHaveCount(0);
});

test('含空格与超长字符的事件名按原样参与计算', async ({ page }) => {
  const spaced = '靠港 3 号泊位';
  const longName = `${'泊'.repeat(40)}码头`;
  await page.getByTestId('row-0-id').fill('1');
  await page.getByTestId('row-0-u').fill(spaced);
  await page.getByTestId('row-0-v').fill(longName);
  await page.getByTestId('row-0-c').fill('-2');
  await page.getByTestId('row-1-id').fill('2');
  await page.getByTestId('row-1-u').fill(longName);
  await page.getByTestId('row-1-v').fill(spaced);
  await page.getByTestId('row-1-c').fill('1');

  await expect(page.getByTestId('compute-button')).toBeEnabled();
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-step-0')).toContainText(
    `date(${longName}) − date(${spaced}) ≤ -2`,
  );
  await expect(page.getByTestId('cycle-step-1')).toContainText(
    `date(${spaced}) − date(${longName}) ≤ 1`,
  );
  await expect(page.getByTestId('cycle-total')).toContainText('总和小于零');
});

test('上限规模（60 事件 / 120 断言）即时返回最短矛盾链', async ({ page }) => {
  test.setTimeout(120_000);
  // 60 环 + 60 条平行边：唯一的简单环是 60 环，但平行边使朴素枚举组合爆炸。
  const rows: { id: string; u: string; v: string; c: string }[] = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ id: String(i + 1), u: `e${i}`, v: `e${(i + 1) % 60}`, c: i === 0 ? '-1' : '0' });
  }
  for (let i = 0; i < 60; i++) {
    rows.push({ id: String(61 + i), u: `e${i}`, v: `e${(i + 1) % 60}`, c: '5' });
  }
  for (let i = 0; i < rows.length; i++) {
    if (i >= 3) await page.getByTestId('add-row').click();
    await page.getByTestId(`row-${i}-id`).fill(rows[i].id);
    await page.getByTestId(`row-${i}-u`).fill(rows[i].u);
    await page.getByTestId(`row-${i}-v`).fill(rows[i].v);
    await page.getByTestId(`row-${i}-c`).fill(rows[i].c);
  }

  await expect(page.getByTestId('batch-counter')).toContainText('120 条断言 / 60 个事件');
  await page.getByTestId('compute-button').click();
  await expect(page.getByTestId('result-cycle')).toBeVisible();
  await expect(page.getByTestId('cycle-meta')).toContainText('60 条边');
  await expect(page.getByTestId('cycle-total')).toContainText('累计总和 = -1');
  await expect(page.getByTestId('cycle-total')).toContainText('总和小于零');
});
