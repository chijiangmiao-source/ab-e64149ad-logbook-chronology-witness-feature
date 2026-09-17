import { describe, expect, it } from 'vitest';
import {
  C_MAX,
  C_MIN,
  MAX_ASSERTIONS,
  MAX_EVENTS,
  validateBatch,
  type RawRow,
} from './parse';
import { findNegativeCycle } from './solver';

const row = (id: string, u: string, v: string, c: string): RawRow => ({ id, u, v, c });
const blank = (): RawRow => ({ id: '', u: '', v: '', c: '' });

describe('逐行字段校验', () => {
  it('接受合法行并解析为断言', () => {
    const batch = validateBatch([row('12', '靠港', '补给', '-3')]);
    expect(batch.ok).toBe(true);
    expect(batch.batchErrors).toEqual([]);
    expect(batch.assertions).toEqual([{ id: 12, u: '靠港', v: '补给', c: -3, row: 1 }]);
  });

  it.each(['0', '01', '007', '1234567', '-5', '1.5', 'abc', '1e3', '+7'])(
    '拒绝非法编号 %j',
    (badId) => {
      const batch = validateBatch([row(badId, 'a', 'b', '1')]);
      expect(batch.ok).toBe(false);
      expect(batch.rows[0].errors.id).toBeTruthy();
    },
  );

  it.each(['1', '9', '10', '999999'])('接受合法编号 %j', (goodId) => {
    const batch = validateBatch([row(goodId, 'a', 'b', '1')]);
    expect(batch.rows[0].errors.id).toBeUndefined();
    expect(batch.ok).toBe(true);
  });

  it('编号按整数数值判重：1 与 1 重复', () => {
    const batch = validateBatch([row('1', 'a', 'b', '0'), row('1', 'c', 'd', '0')]);
    expect(batch.ok).toBe(false);
    expect(batch.batchErrors.join()).toContain('编号 1 重复');
    expect(batch.rows[0].errors.id).toContain('重复');
    expect(batch.rows[1].errors.id).toContain('重复');
  });

  it('不同编号（如 9 与 10）按整数比较不判重', () => {
    const batch = validateBatch([row('9', 'a', 'b', '0'), row('10', 'b', 'a', '0')]);
    expect(batch.ok).toBe(true);
  });

  it('事件名区分大小写：Foo 与 foo 是两个事件', () => {
    const batch = validateBatch([row('1', 'Foo', 'foo', '0')]);
    expect(batch.ok).toBe(true);
    expect(batch.assertions[0].u).toBe('Foo');
    expect(batch.assertions[0].v).toBe('foo');
  });

  it('事件名允许中文、空格与超长名称，并按原样参与计算', () => {
    expect(validateBatch([row('1', '靠港', '离港', '0')]).ok).toBe(true);

    const spaced = validateBatch([row('1', '开船 第一天', '靠港 补给', '0')]);
    expect(spaced.ok).toBe(true);
    expect(spaced.assertions[0].u).toBe('开船 第一天');
    expect(spaced.assertions[0].v).toBe('靠港 补给');

    const longName = '航'.repeat(64) + ' 记录';
    const longBatch = validateBatch([row('1', longName, '离港', '0')]);
    expect(longBatch.ok).toBe(true);
    expect(longBatch.assertions[0].u).toBe(longName);

    // 含空格的名称同样按原样判重：整批同一名称出现两次字段均合法。
    const same = validateBatch([
      row('1', '风暴 夜航', 'a', '0'),
      row('2', 'a', '风暴 夜航', '0'),
    ]);
    expect(same.ok).toBe(true);
    expect(new Set(same.assertions.flatMap((a) => [a.u, a.v])).size).toBe(2);
  });

  it('事件名仅为空白时视为未填写并就地标错', () => {
    const batch = validateBatch([row('1', '   ', '离港', '0')]);
    expect(batch.ok).toBe(false);
    expect(batch.rows[0].errors.u).toBe('请输入起始事件 u');
  });

  it.each([String(C_MIN), String(C_MAX), '0', '-1', '42'])('接受范围内整数 c = %j', (c) => {
    const batch = validateBatch([row('1', 'a', 'b', c)]);
    expect(batch.rows[0].errors.c).toBeUndefined();
    expect(batch.ok).toBe(true);
  });

  it.each(['100001', '-100001', '3.5', '1e3', '+5', '--3', '1,000'])(
    '拒绝越界或非整数 c = %j',
    (c) => {
      const batch = validateBatch([row('1', 'a', 'b', c)]);
      expect(batch.ok).toBe(false);
      expect(batch.rows[0].errors.c).toBeTruthy();
    },
  );

  it('全空行被忽略；部分填写的行就地标错', () => {
    const batch = validateBatch([blank(), row('1', 'a', 'b', '0'), row('2', 'a', '', '')]);
    expect(batch.rows[0].empty).toBe(true);
    expect(batch.rows[0].errors).toEqual({});
    expect(batch.rows[2].errors.v).toBeTruthy();
    expect(batch.rows[2].errors.c).toBeTruthy();
    expect(batch.ok).toBe(false);
  });

  it('id 与 c 两端空白会被裁剪；事件名首尾空白原样保留', () => {
    const batch = validateBatch([row(' 3 ', ' 靠港 ', ' 补给 ', ' -2 ')]);
    expect(batch.ok).toBe(true);
    expect(batch.assertions[0]).toMatchObject({ id: 3, u: ' 靠港 ', v: ' 补给 ', c: -2 });
  });

  it('事件名首尾空格是名称的一部分：不与无空格名称合并，不拼出不存在的矛盾链', () => {
    // 录入中只有 '靠港' 和 ' 靠港 '（带首尾空格）两个不同事件，二者不得被合并成环。
    const batch = validateBatch([
      row('1', '靠港', '补给', '-5'),
      row('2', '补给', ' 靠港 ', '1'),
    ]);
    expect(batch.ok).toBe(true);
    const eventNames = [...new Set(batch.assertions.flatMap((a) => [a.u, a.v]))];
    expect(eventNames).toContain('靠港');
    expect(eventNames).toContain(' 靠港 ');
    expect(eventNames.sort()).toEqual([' 靠港 ', '补给', '靠港']);
    // 两断言并不闭合（终点是不同事件），故约束相容，不能显示矛盾链。
    expect(findNegativeCycle(batch.assertions).kind).toBe('consistent');

    // 只有当另一行也逐字录入 ' 靠港 ' 时才真正闭合为负环。
    const closed = validateBatch([
      row('1', ' 靠港 ', '补给', '-5'),
      row('2', '补给', ' 靠港 ', '1'),
    ]);
    expect(closed.ok).toBe(true);
    expect(findNegativeCycle(closed.assertions).kind).toBe('negative-cycle');
  });
});

describe('整批校验', () => {
  it('0 条断言（全空行）阻止计算', () => {
    const batch = validateBatch([blank(), blank()]);
    expect(batch.ok).toBe(false);
    expect(batch.batchErrors.join()).toContain('至少需要 1 条断言');
  });

  it(`超过 ${MAX_ASSERTIONS} 条断言阻止计算`, () => {
    const rows = Array.from({ length: MAX_ASSERTIONS + 1 }, (_, i) =>
      row(String(i + 1), 'a', 'b', '0'),
    );
    const batch = validateBatch(rows);
    expect(batch.ok).toBe(false);
    expect(batch.batchErrors.join()).toContain(`${MAX_ASSERTIONS + 1} 超过上限 ${MAX_ASSERTIONS}`);
  });

  it(`${MAX_ASSERTIONS} 条断言合法`, () => {
    const rows = Array.from({ length: MAX_ASSERTIONS }, (_, i) => row(String(i + 1), 'a', 'b', '0'));
    expect(validateBatch(rows).ok).toBe(true);
  });

  it(`超过 ${MAX_EVENTS} 个事件阻止计算`, () => {
    // 61 个不同事件 e0..e60，各配一条自环断言。
    const rows = Array.from({ length: MAX_EVENTS + 1 }, (_, i) =>
      row(String(i + 1), `e${i}`, `e${i}`, '0'),
    );
    const batch = validateBatch(rows);
    expect(batch.ok).toBe(false);
    expect(batch.batchErrors.join()).toContain(`${MAX_EVENTS + 1} 超过上限 ${MAX_EVENTS}`);
  });

  it(`${MAX_EVENTS} 个事件合法`, () => {
    const rows = Array.from({ length: MAX_EVENTS }, (_, i) => row(String(i + 1), `e${i}`, `e${i}`, '0'));
    expect(validateBatch(rows).ok).toBe(true);
  });

  it('任一非法行均使整批不可计算', () => {
    const batch = validateBatch([
      row('1', 'a', 'b', '0'),
      row('2', 'b', 'c', '999999'), // c 越界
      row('3', 'c', 'a', '-1'),
    ]);
    expect(batch.ok).toBe(false);
    expect(batch.rows[1].errors.c).toBeTruthy();
  });
});
