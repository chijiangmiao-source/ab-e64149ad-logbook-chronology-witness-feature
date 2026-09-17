import { describe, expect, it } from 'vitest';
import { findNegativeCycle } from './solver';
import type { Assertion } from './types';

const A = (id: number, u: string, v: string, c: number): Assertion => ({ id, u, v, c, row: id });

const idsOf = (result: ReturnType<typeof findNegativeCycle>): number[] => {
  if (result.kind !== 'negative-cycle') throw new Error('期望负环，实际为相容');
  return result.witness.edges.map((e) => e.id);
};

/** 沿原方向旋转，使环以最小断言编号开头（参考实现用）。 */
function normalizeCycleRotation(edges: Assertion[]): Assertion[] {
  let minIndex = 0;
  for (let i = 1; i < edges.length; i++) {
    if (edges[i].id < edges[minIndex].id) minIndex = i;
  }
  return [...edges.slice(minIndex), ...edges.slice(0, minIndex)];
}

/** 按整数数值比较两个编号序列的字典序（参考实现用）。 */
function compareIdSequences(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

describe('负环探测', () => {
  it('空断言集相容', () => {
    expect(findNegativeCycle([]).kind).toBe('consistent');
  });

  it('负权重自环是长度为 1 的负环', () => {
    const result = findNegativeCycle([A(4, 'X', 'X', -2)]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([4]);
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.total).toBe(-2);
    expect(result.witness.steps.map((s) => s.cumulative)).toEqual([-2]);
  });

  it('非负自环（c = 0）不构成负环', () => {
    expect(findNegativeCycle([A(4, 'X', 'X', 0)]).kind).toBe('consistent');
  });

  it('二元负环：权重和为负即见证', () => {
    const result = findNegativeCycle([A(1, 'a', 'b', -3), A(2, 'b', 'a', 1)]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([1, 2]);
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.total).toBe(-2);
    expect(result.witness.steps.map((s) => s.cumulative)).toEqual([-3, -2]);
  });

  it('环上权重和为零或为正时相容', () => {
    expect(findNegativeCycle([A(1, 'a', 'b', 1), A(2, 'b', 'c', 1), A(3, 'c', 'a', -2)]).kind).toBe(
      'consistent',
    );
    expect(findNegativeCycle([A(1, 'a', 'b', 1), A(2, 'b', 'c', 1), A(3, 'c', 'a', -1)]).kind).toBe(
      'consistent',
    );
  });

  it('无环图（DAG）相容', () => {
    const result = findNegativeCycle([
      A(1, 'a', 'b', -100),
      A(2, 'b', 'c', -100),
      A(3, 'a', 'c', -100),
    ]);
    expect(result.kind).toBe('consistent');
  });

  it('经典可满足差分约束相容', () => {
    const result = findNegativeCycle([
      A(1, 'x', 'y', 2),
      A(2, 'y', 'z', 3),
      A(3, 'x', 'z', 10),
      A(4, 'z', 'x', -4),
    ]);
    expect(result.kind).toBe('consistent');
  });
});

describe('见证选取规则', () => {
  it('先选边数最少者：二元负环胜过编号更小的三元负环', () => {
    const result = findNegativeCycle([
      A(1, 'x', 'y', 1),
      A(2, 'y', 'z', 1),
      A(3, 'z', 'x', -5), // 三元负环，和 = -3
      A(10, 'a', 'b', -5),
      A(11, 'b', 'a', 1), // 二元负环，和 = -4
    ]);
    expect(idsOf(result)).toEqual([10, 11]);
  });

  it('自环（1 条边）胜过更长的负环', () => {
    const result = findNegativeCycle([
      A(1, 'a', 'b', -3),
      A(2, 'b', 'a', 1),
      A(9, 's', 's', -1),
    ]);
    expect(idsOf(result)).toEqual([9]);
  });

  it('并列候选旋转至最小编号开头（禁止反转）', () => {
    // 环：靠港 -7-> 补给 -2-> 离港 -5-> 靠港，编号最小的是 2。
    const result = findNegativeCycle([
      A(7, '靠港', '补给', 3),
      A(2, '补给', '离港', 2),
      A(5, '离港', '靠港', -6),
    ]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([2, 5, 7]);
    if (result.kind !== 'negative-cycle') return;
    // 旋转后从“补给”出发，沿原方向前进。
    expect(result.witness.edges.map((e) => [e.u, e.v])).toEqual([
      ['补给', '离港'],
      ['离港', '靠港'],
      ['靠港', '补给'],
    ]);
    expect(result.witness.steps.map((s) => s.cumulative)).toEqual([2, -4, -1]);
    expect(result.witness.total).toBe(-1);
  });

  it('同一边数的多个负环按编号整数序列字典序取最小', () => {
    const result = findNegativeCycle([
      A(5, 'a', 'b', -4),
      A(6, 'b', 'a', 1), // 环 [5,6]，和 = -3
      A(3, 'c', 'd', -4),
      A(9, 'd', 'c', 1), // 环 [3,9]，和 = -3；3 < 5，故胜出（与第二元素 9 > 6 无关）
    ]);
    expect(idsOf(result)).toEqual([3, 9]);
  });

  it('平行边各自成环候选，按编号序列取舍而非权重', () => {
    const result = findNegativeCycle([
      A(8, 'u', 'v', -4), // 与 #5 成环 [5,8]，和 = -3
      A(3, 'u', 'v', -2), // 与 #5 成环 [3,5]，和 = -1；[3,5] 字典序更小
      A(5, 'v', 'u', 1),
    ]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([3, 5]);
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.total).toBe(-1);
  });

  it('禁止反转：反向会成负环但原方向不为负时判相容', () => {
    // 原方向 a->b->c->a 权重和 = 1（非负）；若允许反转则和 = -1。
    const result = findNegativeCycle([
      A(1, 'a', 'b', 1),
      A(2, 'b', 'c', 1),
      A(3, 'c', 'a', -1),
    ]);
    expect(result.kind).toBe('consistent');
  });

  it('多环并存时结果稳定：与输入行序无关', () => {
    const assertions = [
      A(7, '靠港', '补给', 3),
      A(2, '补给', '离港', 2),
      A(5, '离港', '靠港', -6), // 负环 A：[2,5,7]
      A(11, 'p', 'q', -9),
      A(12, 'q', 'p', 1), // 负环 B：[11,12]
      A(20, 'm', 'n', 5),
      A(21, 'n', 'm', -2), // 非负环
    ];
    const shuffled = [...assertions].reverse();
    const r1 = findNegativeCycle(assertions);
    const r2 = findNegativeCycle(shuffled);
    expect(idsOf(r1)).toEqual([11, 12]); // 边数最少（2 < 3）者优先
    expect(idsOf(r2)).toEqual([11, 12]);
    expect(r1).toEqual(r2);
  });

  it('同一负环无论以哪个事件起录都得到同一规范化见证', () => {
    const base = [A(7, 'a', 'b', 3), A(2, 'b', 'c', 2), A(5, 'c', 'a', -6)];
    const rotatedInput = [base[1], base[2], base[0]];
    expect(idsOf(findNegativeCycle(base))).toEqual([2, 5, 7]);
    expect(idsOf(findNegativeCycle(rotatedInput))).toEqual([2, 5, 7]);
  });

  it('长链上的负环：只报告环本身', () => {
    const result = findNegativeCycle([
      A(1, 's', 'a', 0),
      A(2, 'a', 'b', 1),
      A(3, 'b', 'c', -4),
      A(4, 'c', 'b', 1), // 环 b->c->b：1? 实际为 #3(b->c,-4) + #4(c->b,1) = -3
      A(5, 'c', 't', 0),
    ]);
    expect(idsOf(result)).toEqual([3, 4]);
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.total).toBe(-3);
  });

  it('含空格与超长字符的事件名按原样参与计算', () => {
    const spaced = '靠港 3 号泊位';
    const long = '泊'.repeat(40);
    const result = findNegativeCycle([A(1, spaced, long, -2), A(2, long, spaced, 1)]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([1, 2]);
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.edges[0].u).toBe(spaced);
    expect(result.witness.edges[0].v).toBe(long);
  });

  it('上限规模性能回归：60 事件 / 120 断言（60 环 + 60 平行边）即时完成', () => {
    // 唯一的简单环是 60 环，但每个位置有两条平行边：朴素枚举需面对 2^60 种组合。
    const assertions: Assertion[] = [];
    for (let i = 0; i < 60; i++) {
      assertions.push(A(i + 1, `e${i}`, `e${(i + 1) % 60}`, i === 0 ? -1 : 0));
    }
    for (let i = 0; i < 60; i++) {
      assertions.push(A(61 + i, `e${i}`, `e${(i + 1) % 60}`, 5));
    }
    const start = performance.now();
    const result = findNegativeCycle(assertions);
    const elapsed = performance.now() - start;
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    if (result.kind !== 'negative-cycle') return;
    expect(result.witness.total).toBe(-1);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('大规模与性能（上限内不得指数级卡死）', () => {
  it('60 事件 / 120 断言、2^29 条等长路径的分层图在毫秒级返回正确见证', () => {
    // 30 层 × 每层 2 节点，相邻层 4 条全连边（29×4 = 116），闭合边 4 条。
    // 最小负环长度 31；简单路径数 2^29，旧的全量 DFS 枚举会永久卡死。
    const assertions: Assertion[] = [];
    const name = (layer: number, which: number) => `e${layer}_${which}`;
    for (let layer = 0; layer < 29; layer++) {
      for (const a of [0, 1]) {
        for (const b of [0, 1]) {
          assertions.push(A(assertions.length + 1, name(layer, a), name(layer + 1, b), 0));
        }
      }
    }
    assertions.push(A(117, name(29, 0), name(0, 0), -1));
    assertions.push(A(118, name(29, 1), name(0, 0), 100));
    assertions.push(A(119, name(29, 1), name(0, 1), 100));
    assertions.push(A(120, name(29, 0), name(0, 1), 100));

    const t0 = Date.now();
    const result = findNegativeCycle(assertions);
    expect(Date.now() - t0).toBeLessThan(2000);

    expect(result.kind).toBe('negative-cycle');
    if (result.kind !== 'negative-cycle') return;
    // 唯一负环走层间最小编号边（每层 4 条中的第 1 条）闭合于 #117。
    const expectedIds = Array.from({ length: 29 }, (_, layer) => layer * 4 + 1);
    expectedIds.push(117);
    expect(result.witness.edges.map((e) => e.id)).toEqual(expectedIds);
    expect(result.witness.total).toBe(-1);
  });

  it('60 事件 / 120 断言无负环时快速判定相容', () => {
    const assertions: Assertion[] = [];
    for (let i = 0; i < 60; i++) {
      assertions.push(A(2 * i + 1, `e${i}`, `e${i}`, 0));
      assertions.push(A(2 * i + 2, `e${i}`, `e${(i + 1) % 60}`, 100000));
    }
    const t0 = Date.now();
    expect(findNegativeCycle(assertions).kind).toBe('consistent');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('含空格与超长事件名的大规模批次正常参与计算', () => {
    const longA = '第 一 个 很 长 的 航 海 事 件 名 称'.repeat(4);
    const longB = 'b'.repeat(200);
    const result = findNegativeCycle([
      A(100001, longA, longB, -5),
      A(500000, longB, longA, 1),
    ]);
    expect(result.kind).toBe('negative-cycle');
    expect(idsOf(result)).toEqual([100001, 500000]);
  });
});

describe('辅助函数', () => {
  it('normalizeCycleRotation 旋转至最小编号开头且不反转', () => {
    const cycle = [A(9, 'a', 'b', 0), A(4, 'b', 'c', 0), A(7, 'c', 'a', 0)];
    expect(normalizeCycleRotation(cycle).map((e) => e.id)).toEqual([4, 7, 9]);
  });

  it('compareIdSequences 按整数比较', () => {
    expect(compareIdSequences([9, 1], [10, 1])).toBeLessThan(0); // 9 < 10
    expect(compareIdSequences([3, 9], [3, 10])).toBeLessThan(0);
    expect(compareIdSequences([3, 9], [3, 9])).toBe(0);
    expect(compareIdSequences([3, 9], [3, 9, 1])).toBeLessThan(0);
  });
});

/**
 * 参考实现：暴力枚举全部简单环，独立复算选取规则
 * （最小边数 → 旋转至最小编号 → 编号序列字典序最小），用于随机对照。
 */
function referenceWitnessIds(assertions: Assertion[]): number[] | null {
  const events = [...new Set(assertions.flatMap((a) => [a.u, a.v]))];
  const out = new Map<string, Assertion[]>();
  for (const a of assertions) {
    const list = out.get(a.u) ?? [];
    list.push(a);
    out.set(a.u, list);
  }
  const cycles: Assertion[][] = [];
  const path: Assertion[] = [];
  for (const s of events) {
    const visited = new Set<string>([s]);
    const dfs = (x: string): void => {
      for (const e of out.get(x) ?? []) {
        if (e.v === s) {
          cycles.push([...path, e]);
          continue;
        }
        if (visited.has(e.v)) continue;
        visited.add(e.v);
        path.push(e);
        dfs(e.v);
        path.pop();
        visited.delete(e.v);
      }
    };
    dfs(s);
  }
  const negative = cycles.filter((cy) => cy.reduce((sum, e) => sum + e.c, 0) < 0);
  if (negative.length === 0) return null;
  const minLen = Math.min(...negative.map((cy) => cy.length));
  const seqs = negative
    .filter((cy) => cy.length === minLen)
    .map((cy) => normalizeCycleRotation(cy).map((a) => a.id));
  seqs.sort(compareIdSequences);
  return seqs[0];
}

describe('随机图对照暴力枚举（含平行边、自环、多环）', () => {
  it('200 组随机图的判定与见证序列均与参考实现一致', () => {
    let seed = 20260915;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rand() * 8);
      const m = 1 + Math.floor(rand() * 20);
      const assertions: Assertion[] = [];
      for (let i = 0; i < m; i++) {
        const u = Math.floor(rand() * n);
        const v = Math.floor(rand() * n);
        const c = Math.floor(rand() * 21) - 10;
        assertions.push(A(i + 1, `e${u}`, `e${v}`, c));
      }
      const result = findNegativeCycle(assertions);
      const expected = referenceWitnessIds(assertions);
      if (expected === null) {
        expect(result.kind).toBe('consistent');
        continue;
      }
      expect(result.kind).toBe('negative-cycle');
      expect(idsOf(result)).toEqual(expected);
      if (result.kind !== 'negative-cycle') return;
      const { witness } = result;
      // 见证结构自检：权重和小于零、首尾相接、事件不重复、断言不重复、已旋转。
      expect(witness.total).toBeLessThan(0);
      expect(witness.total).toBe(witness.edges.reduce((s, e) => s + e.c, 0));
      for (let i = 0; i < witness.edges.length; i++) {
        expect(witness.edges[i].v).toBe(witness.edges[(i + 1) % witness.edges.length].u);
      }
      expect(new Set(witness.edges.map((e) => e.u)).size).toBe(witness.edges.length);
      expect(new Set(witness.edges.map((e) => e.id)).size).toBe(witness.edges.length);
      expect(witness.edges[0].id).toBe(Math.min(...witness.edges.map((e) => e.id)));
    }
  });
});
