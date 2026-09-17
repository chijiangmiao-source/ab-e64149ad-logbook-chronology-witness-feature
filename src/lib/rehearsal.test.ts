import { describe, expect, it } from 'vitest';
import { rehearseTightening, shortestReturnPath } from './rehearsal';
import { findNegativeCycle } from './solver';
import type { Assertion } from './types';

const A = (id: number, u: string, v: string, c: number): Assertion => ({ id, u, v, c, row: id });

/** 把编号 id 的断言上界替换为 cNew（不修改原数组）。 */
function withC(assertions: Assertion[], id: number, cNew: number): Assertion[] {
  return assertions.map((a) => (a.id === id ? { ...a, c: cNew } : a));
}

describe('shortestReturnPath：排除被修订边后的最小权重返回路径', () => {
  it('无返回路径时返回 null（无有限临界值）', () => {
    const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'c', 1)];
    expect(shortestReturnPath(assertions, 1)).toBeNull();
  });

  it('直接返回边即为最短路径', () => {
    const path = shortestReturnPath([A(1, 'a', 'b', 5), A(2, 'b', 'a', -2)], 1);
    expect(path).toEqual({ edges: [A(2, 'b', 'a', -2)], weight: -2, length: 1 });
  });

  it('自环被排除后取长度 0 的空路径（临界值为 0）', () => {
    const path = shortestReturnPath([A(1, 'x', 'x', 0), A(2, 'x', 'y', 3), A(3, 'y', 'x', 2)], 1);
    expect(path).not.toBeNull();
    expect(path!.weight).toBe(0);
    expect(path!.length).toBe(0);
    expect(path!.edges).toEqual([]);
  });

  it('总权重优先：较负的远路胜过较正的近路', () => {
    // 目标 #1 s→a；近路 a→s 权重 0（#9），远路 a→b→s 权重 -4（#2,#3）。
    const assertions = [
      A(1, 's', 'a', 10),
      A(9, 'a', 's', 0),
      A(2, 'a', 'b', -1),
      A(3, 'b', 's', -3),
    ];
    const path = shortestReturnPath(assertions, 1)!;
    expect(path.weight).toBe(-4);
    expect(path.edges.map((e) => e.id)).toEqual([2, 3]);
    expect(path.length).toBe(2);
  });

  it('总权重并列时边数最少：零权回路不进入证明链', () => {
    // 直接 a→s 权重 -2（#2，1 条边）；绕零权回路 a→b→a→s 也是 -2（3 条边）。
    const assertions = [
      A(1, 's', 'a', 5),
      A(2, 'a', 's', -2),
      A(3, 'a', 'b', 0),
      A(4, 'b', 'a', 0),
    ];
    const path = shortestReturnPath(assertions, 1)!;
    expect(path.weight).toBe(-2);
    expect(path.length).toBe(1);
    expect(path.edges.map((e) => e.id)).toEqual([2]);
  });

  it('总权重与边数并列时编号序列字典序最小', () => {
    // 两条 a→s 路径权重均为 -2、长度均为 2：[2,3] 与 [4,5]。
    const assertions = [
      A(1, 's', 'a', 0),
      A(2, 'a', 'x', 1),
      A(3, 'x', 's', -3),
      A(4, 'a', 'y', 1),
      A(5, 'y', 's', -3),
    ];
    const path = shortestReturnPath(assertions, 1)!;
    expect(path.weight).toBe(-2);
    expect(path.edges.map((e) => e.id)).toEqual([2, 3]);
  });

  it('平行边按编号序列取舍，与行序无关', () => {
    // b→a 有平行边 #2(-2) 与 #4(0)：取更负的 #2。
    const assertions = [A(4, 'b', 'a', 0), A(1, 'a', 'b', 5), A(2, 'b', 'a', -2)];
    const path = shortestReturnPath(assertions, 1)!;
    expect(path.edges.map((e) => e.id)).toEqual([2]);
    expect(path.weight).toBe(-2);
  });

  it('被修订边本身绝不进入返回路径（即使它是唯一的平行边）', () => {
    // #1 a→b 与 #3 a→b 平行；排除 #1 后 b→a 只能经 #2 返回。
    const assertions = [A(1, 'a', 'b', 5), A(3, 'a', 'b', 4), A(2, 'b', 'a', -2)];
    const path = shortestReturnPath(assertions, 1)!;
    expect(path.edges.every((e) => e.id !== 1)).toBe(true);
    expect(path.edges.map((e) => e.id)).toEqual([2]);
  });
});

describe('rehearseTightening：临界值与越界判定', () => {
  it('临界值处安全、再收紧一单位越界，且与负环求证结果一致', () => {
    // a→b(5) + b→a(-2) = 3 相容；收紧 #1 的临界值为 2。
    const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'a', -2)];

    const safe = rehearseTightening(assertions, 1, '2');
    expect(safe.kind).toBe('safe');
    if (safe.kind === 'safe') expect(safe.threshold).toBe(2);
    expect(findNegativeCycle(withC(assertions, 1, 2)).kind).toBe('consistent');

    const violated = rehearseTightening(assertions, 1, '1');
    expect(violated.kind).toBe('violated');
    if (violated.kind === 'violated') {
      expect(violated.threshold).toBe(2);
      expect(violated.total).toBe(-1);
      expect(violated.pathWeight).toBe(-2);
      expect(violated.edgeCount).toBe(1);
      expect(violated.steps.map((s) => s.assertion.id)).toEqual([1, 2]);
      expect(violated.steps.map((s) => s.revised)).toEqual([true, false]);
      expect(violated.steps.map((s) => s.cumulative)).toEqual([1, -1]);
    }
    // 与现有负环求证一致：临界值下一单位必检出负环且包含被修订断言。
    const cycle = findNegativeCycle(withC(assertions, 1, 1));
    expect(cycle.kind).toBe('negative-cycle');
    if (cycle.kind === 'negative-cycle') {
      expect(cycle.witness.edges.map((e) => e.id).sort((a, b) => a - b)).toEqual([1, 2]);
    }
  });

  it('无返回路径：任意收紧均判无有限临界值，写回后仍相容', () => {
    const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'c', 1)];
    const result = rehearseTightening(assertions, 1, '-100000');
    expect(result.kind).toBe('unbounded');
    expect(findNegativeCycle(withC(assertions, 1, -100000)).kind).toBe('consistent');
  });

  it('非负自环收紧为负值：空返回路径 + 拟议断言组成单步矛盾链', () => {
    const assertions = [A(1, 'x', 'x', 0)];
    const result = rehearseTightening(assertions, 1, '-1');
    expect(result.kind).toBe('violated');
    if (result.kind !== 'violated') return;
    expect(result.threshold).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.steps.map((s) => s.assertion.id)).toEqual([1]);
    expect(result.total).toBe(-1);
  });

  it('零权闭环整体相容时，把任一边收紧 1 即越界，累计和为 -1', () => {
    // 相容示例：3+2-5 = 0，临界值就是原值 3；收紧到 2 必矛盾。
    const assertions = [
      A(1, '靠港', '补给', 3),
      A(2, '补给', '离港', 2),
      A(3, '离港', '靠港', -5),
    ];
    const result = rehearseTightening(assertions, 1, '2');
    expect(result.kind).toBe('violated');
    if (result.kind !== 'violated') return;
    expect(result.threshold).toBe(3);
    expect(result.pathWeight).toBe(-3);
    expect(result.edgeCount).toBe(2);
    expect(result.steps.map((s) => s.assertion.id)).toEqual([1, 2, 3]);
    expect(result.steps.map((s) => s.cumulative)).toEqual([2, 4, -1]);
    expect(result.total).toBe(-1);
  });

  it('多步返回路径按总权重、边数、编号序列给出唯一链', () => {
    const assertions = [
      A(7, 's', 'a', 10), // 被修订边
      A(9, 'a', 's', 0), // 近路，权重 0
      A(2, 'a', 'b', -1),
      A(3, 'b', 's', -3), // 远路权重 -4，胜出
    ];
    const result = rehearseTightening(assertions, 7, '3'); // threshold = 4，3 越界
    expect(result.kind).toBe('violated');
    if (result.kind !== 'violated') return;
    expect(result.threshold).toBe(4);
    expect(result.steps.map((s) => s.assertion.id)).toEqual([7, 2, 3]);
    expect(result.steps.map((s) => s.cumulative)).toEqual([3, 2, -1]);
  });

  it('临界值上一单位（threshold+1）同样安全', () => {
    const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'a', -2)]; // threshold = 2
    expect(rehearseTightening(assertions, 1, '3').kind).toBe('safe');
  });
});

describe('rehearseTightening：非法拟议值', () => {
  const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'a', -2)];

  it('非整数被判 invalid', () => {
    const result = rehearseTightening(assertions, 1, '2.5');
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') expect(result.cNew).toBeNull();
  });

  it('超出 c 范围被判 invalid', () => {
    expect(rehearseTightening(assertions, 1, '-100001').kind).toBe('invalid');
    expect(rehearseTightening(assertions, 1, '100001').kind).toBe('invalid');
  });

  it('新值大于原值（放宽）被判 invalid，等于原值允许（判安全）', () => {
    expect(rehearseTightening(assertions, 1, '6').kind).toBe('invalid');
    const same = rehearseTightening(assertions, 1, '5');
    expect(same.kind).toBe('safe');
  });

  it('目标断言不存在时判 invalid', () => {
    expect(rehearseTightening(assertions, 99, '1').kind).toBe('invalid');
  });
});

/**
 * 参考实现：暴力枚举 G - excludedId 中从 v(e*) 到 u(e*) 的全部简单路径
 * （平行边各自独立），按总权重 → 边数 → 编号序列取唯一最优，与多项式实现对照。
 * 空路径（起终点相同）权重 0、长度 0，亦为候选。
 */
function referenceShortest(assertions: Assertion[], excludedId: number) {
  const target = assertions.find((a) => a.id === excludedId)!;
  const others = assertions.filter((a) => a.id !== excludedId);
  const out = new Map<string, Assertion[]>();
  for (const a of others) {
    const list = out.get(a.u) ?? [];
    list.push(a);
    out.set(a.u, list);
  }
  for (const list of out.values()) list.sort((p, q) => p.id - q.id);

  interface Cand {
    ids: number[];
    weight: number;
    length: number;
  }
  const candidates: Cand[] = [];
  if (target.v === target.u) candidates.push({ ids: [], weight: 0, length: 0 });

  const visited = new Set<string>([target.v]);
  const path: Assertion[] = [];
  const dfs = (x: string, weight: number): void => {
    for (const e of out.get(x) ?? []) {
      if (e.v === target.u) {
        candidates.push({
          ids: [...path.map((p) => p.id), e.id],
          weight: weight + e.c,
          length: path.length + 1,
        });
        continue;
      }
      if (visited.has(e.v)) continue;
      visited.add(e.v);
      path.push(e);
      dfs(e.v, weight + e.c);
      path.pop();
      visited.delete(e.v);
    }
  };
  dfs(target.v, 0);

  if (candidates.length === 0) return null;
  candidates.sort((p, q) => {
    if (p.weight !== q.weight) return p.weight - q.weight;
    if (p.length !== q.length) return p.length - q.length;
    const n = Math.min(p.ids.length, q.ids.length);
    for (let i = 0; i < n; i++) if (p.ids[i] !== q.ids[i]) return p.ids[i] - q.ids[i];
    return p.ids.length - q.ids.length;
  });
  return candidates[0];
}

describe('随机图对照暴力枚举（含平行边、零权回路、无返回路径）', () => {
  it('300 组随机图的最短返回路径与预演结论均与参考实现一致', () => {
    let seed = 20260917;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rand() * 6);
      const m = 1 + Math.floor(rand() * 14);
      const assertions: Assertion[] = [];
      for (let i = 0; i < m; i++) {
        assertions.push(
          A(i + 1, `e${Math.floor(rand() * n)}`, `e${Math.floor(rand() * n)}`, Math.floor(rand() * 11) - 5),
        );
      }
      // 只在整批相容时预演（收紧预演的前置条件），任取一条断言为目标。
      if (findNegativeCycle(assertions).kind !== 'consistent') continue;
      const target = assertions[Math.floor(rand() * assertions.length)];

      const got = shortestReturnPath(assertions, target.id);
      const expected = referenceShortest(assertions, target.id);
      if (expected === null) {
        expect(got).toBeNull();
      } else {
        expect(got).not.toBeNull();
        expect(got!.weight).toBe(expected.weight);
        expect(got!.length).toBe(expected.length);
        expect(got!.edges.map((e) => e.id)).toEqual(expected.ids);
      }

      // 临界值两侧各取一个整数与 findNegativeCycle 交叉验证。
      if (got !== null) {
        const threshold = -got.weight;
        const cSafe = Math.min(target.c - 1, threshold); // 收紧范围内、不小于临界值
        if (cSafe >= threshold) {
          expect(rehearseTightening(assertions, target.id, String(cSafe)).kind).toBe('safe');
          expect(findNegativeCycle(withC(assertions, target.id, cSafe)).kind).toBe('consistent');
        }
        const cBad = Math.max(-100_000, threshold - 1);
        if (cBad < target.c) {
          const r = rehearseTightening(assertions, target.id, String(cBad));
          expect(r.kind).toBe('violated');
          expect(findNegativeCycle(withC(assertions, target.id, cBad)).kind).toBe('negative-cycle');
        }
      } else {
        const r = rehearseTightening(assertions, target.id, String(Math.max(-100_000, target.c - 1)));
        expect(r.kind).toBe('unbounded');
      }
    }
  });
});
