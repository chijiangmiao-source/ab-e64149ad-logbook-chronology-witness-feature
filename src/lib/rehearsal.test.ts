import { describe, expect, it } from 'vitest';
import { analyzeTightening, evaluateProposal } from './rehearsal';
import { findNegativeCycle } from './solver';
import { C_MAX, C_MIN } from './parse';
import type { Assertion } from './types';

const A = (id: number, u: string, v: string, c: number): Assertion => ({ id, u, v, c, row: id });

const seqOf = (analysis: ReturnType<typeof analyzeTightening>): number[] =>
  analysis.path.map((e) => e.id);

/** 替换目标断言的 c 后整批送入既有负环求证。 */
function solveWithReplacement(assertions: Assertion[], targetId: number, cNew: number) {
  return findNegativeCycle(assertions.map((a) => (a.id === targetId ? { ...a, c: cNew } : a)));
}

describe('收紧预演：临界值基本语义', () => {
  const assertions = [
    A(1, 'a', 'b', 3),
    A(2, 'b', 'd', 2),
    A(3, 'd', 'a', -5), // 环权和 3+2-5 = 0，原批相容
  ];

  it('相容批次的临界值为 -（最小返回路径权）且不大于原值', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.reachable).toBe(true);
    expect(analysis.pathWeight).toBe(-3);
    expect(analysis.critical).toBe(3);
    expect(seqOf(analysis)).toEqual([2, 3]);
    expect(analysis.critical!).toBeLessThanOrEqual(assertions[0].c);
  });

  it('c′ 恰为临界值时安全（闭环权和恰为 0，非负环）', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    const verdict = evaluateProposal(analysis, 3);
    expect(verdict.kind).toBe('safe');
    expect(solveWithReplacement(assertions, 1, 3).kind).toBe('consistent');
  });

  it('临界值上方一单位安全，与求解器一致', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(evaluateProposal(analysis, 3).kind).toBe('safe');
  });

  it('临界值下方一单位越界，矛盾链为拟议断言 + 返回路径，与求解器一致', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    const verdict = evaluateProposal(analysis, 2);
    expect(verdict.kind).toBe('violation');
    if (verdict.kind !== 'violation') return;
    expect(verdict.critical).toBe(3);
    expect(verdict.chain.edges.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(verdict.chain.edges[0].c).toBe(2); // 拟议断言替换为 c′
    expect(verdict.chain.steps.map((s) => s.cumulative)).toEqual([2, 4, -1]);
    expect(verdict.chain.total).toBe(-1);
    // 链确实闭合：首边 a→b，返回边依次 b→d、d→a。
    expect(verdict.chain.edges[0].u).toBe('a');
    expect(verdict.chain.edges[0].v).toBe('b');
    expect(verdict.chain.edges[2].v).toBe('a');
    expect(solveWithReplacement(assertions, 1, 2).kind).toBe('negative-cycle');
  });
});

describe('收紧预演：无返回路径即无有限临界值', () => {
  const assertions = [A(1, 'a', 'b', 5), A(2, 'b', 'c', 4)]; // 单向链，b 无法回到 a

  it('排除目标边后不可达：标注无有限临界值', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.reachable).toBe(false);
    expect(analysis.pathWeight).toBeNull();
    expect(analysis.critical).toBeNull();
    expect(analysis.path).toEqual([]);
  });

  it('无有限临界值时收紧到任意合法 c（含下界）都判安全，求解器同样相容', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    for (const cNew of [5, 0, -1, C_MIN]) {
      const verdict = evaluateProposal(analysis, cNew);
      expect(verdict.kind).toBe('safe');
      if (verdict.kind !== 'safe') return;
      expect(verdict.unbounded).toBe(true);
      expect(solveWithReplacement(assertions, 1, cNew).kind).toBe('consistent');
    }
  });
});

describe('收紧预演：自环（空返回路径）', () => {
  const assertions = [A(1, 's', 's', 0)]; // c=0 自环相容

  it('u=v 时空路径权为 0，临界值为 0', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.reachable).toBe(true);
    expect(analysis.pathWeight).toBe(0);
    expect(analysis.critical).toBe(0);
    expect(analysis.path).toEqual([]);
  });

  it('c′=0 安全，c′=-1 越界且求解器发现该自环负环', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(evaluateProposal(analysis, 0).kind).toBe('safe');
    const violation = evaluateProposal(analysis, -1);
    expect(violation.kind).toBe('violation');
    if (violation.kind !== 'violation') return;
    expect(violation.chain.edges.map((e) => e.id)).toEqual([1]);
    expect(violation.chain.total).toBe(-1);
    expect(solveWithReplacement(assertions, 1, -1).kind).toBe('negative-cycle');
  });
});

describe('收紧预演：平行边与唯一证明链取舍', () => {
  it('等权等边数的并列返回路径取编号整数序列字典序最小者', () => {
    const assertions = [
      A(5, 'a', 'b', 10), // 目标
      A(1, 'b', 'x', 0),
      A(3, 'x', 'a', 0), // 路径 [1,3]，权 0
      A(2, 'b', 'y', 0),
      A(4, 'y', 'a', 0), // 路径 [2,4]，权 0；字典序 [1,3] 胜出
    ];
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.pathWeight).toBe(0);
    expect(analysis.critical).toBe(0);
    expect(seqOf(analysis)).toEqual([1, 3]);
  });

  it('权重相同时边数更少者胜出（即使编号更大）', () => {
    const assertions = [
      A(5, 'a', 'b', 10),
      A(1, 'b', 'x', 0),
      A(2, 'x', 'a', 0), // 权 0、2 边
      A(9, 'b', 'a', 0), // 权 0、1 边：边数更少
    ];
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(seqOf(analysis)).toEqual([9]);
  });

  it('总权重优先于边数与编号：更负的长路胜出', () => {
    const assertions = [
      A(5, 'a', 'b', 10),
      A(1, 'b', 'x', 0),
      A(2, 'x', 'a', -3), // 权 -3、2 边
      A(9, 'b', 'a', -2), // 权 -2、1 边：权重优先，[1,2] 胜出
    ];
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.pathWeight).toBe(-3);
    expect(analysis.critical).toBe(3);
    expect(seqOf(analysis)).toEqual([1, 2]);
  });

  it('平行边被排除的是指定编号那一条：其余平行边不影响判定', () => {
    const assertions = [
      A(1, 'a', 'b', 5), // 目标
      A(2, 'a', 'b', 3), // 平行边，方向同为 a→b，不能充当返回路径
      A(3, 'b', 'a', -2),
    ];
    // 原批相容：5-2=3、3-2=1 均非负。
    expect(findNegativeCycle(assertions).kind).toBe('consistent');
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(seqOf(analysis)).toEqual([3]);
    expect(analysis.critical).toBe(2);
    expect(evaluateProposal(analysis, 1).kind).toBe('violation');
    expect(solveWithReplacement(assertions, 1, 1).kind).toBe('negative-cycle');
  });
});

describe('收紧预演：零权回路不得干扰最短路', () => {
  const assertions = [
    A(5, 'a', 'b', 10),
    A(6, 'b', 'a', -2), // 直接返回：权 -2、1 边
    A(7, 'b', 'z', 0),
    A(8, 'z', 'b', 0), // 零权回路 b→z→b：绕行后权仍 -2 但边数更多
  ];

  it('含零权回路时仍取简单、边数最少的最小权重路径并即时返回', () => {
    const start = performance.now();
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(analysis.pathWeight).toBe(-2);
    expect(analysis.critical).toBe(2);
    expect(seqOf(analysis)).toEqual([6]);
    // 返回路径是简单路径：事件、断言均不重复。
    expect(new Set(analysis.path.map((e) => e.id)).size).toBe(analysis.path.length);
  });

  it('临界值两侧判定与求解器一致', () => {
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(evaluateProposal(analysis, 2).kind).toBe('safe');
    expect(evaluateProposal(analysis, 1).kind).toBe('violation');
    expect(solveWithReplacement(assertions, 5, 2).kind).toBe('consistent');
    expect(solveWithReplacement(assertions, 5, 1).kind).toBe('negative-cycle');
  });
});

describe('收紧预演：确定性（与输入行序无关）', () => {
  it('打乱断言顺序后返回路径编号序列不变', () => {
    const assertions = [
      A(5, 'a', 'b', 10),
      A(1, 'b', 'x', 0),
      A(3, 'x', 'a', 0),
      A(2, 'b', 'y', 0),
      A(4, 'y', 'a', 0),
      A(9, 'b', 'a', -1),
    ];
    const target = assertions[0];
    const r1 = analyzeTightening(assertions, target);
    const r2 = analyzeTightening([...assertions].reverse(), { ...target });
    expect(r2).toEqual(r1);
    // 直接边 -1 比两跳 0 更负，权重优先。
    expect(seqOf(r1)).toEqual([9]);
    expect(r1.critical).toBe(1);
  });

  it('上限规模 60 事件 / 240 断言（环 + 平行边）即时返回确定性证明链', () => {
    // 60 环共 60 条编号边，每个环位置再加 3 条同权重平行边（共 240 断言）；
    // 朴素枚举需面对 4^60 种路径，精确步数 DP 必须即时完成且选编号最小序列。
    const assertions: Assertion[] = [];
    for (let i = 0; i < 60; i++) {
      assertions.push(A(1 + i * 4, `e${i}`, `e${(i + 1) % 60}`, 0));
      assertions.push(A(2 + i * 4, `e${i}`, `e${(i + 1) % 60}`, 5));
      assertions.push(A(3 + i * 4, `e${i}`, `e${(i + 1) % 60}`, 5));
      assertions.push(A(4 + i * 4, `e${i}`, `e${(i + 1) % 60}`, 5));
    }
    expect(findNegativeCycle(assertions).kind).toBe('consistent'); // 无权为负的边
    // 目标为闭合边 e59→e0（#237）：返回路径绕环一周，长 59 边、权 0。
    const target = assertions[59 * 4]; // 1 + 59*4 = 237，e59→e0，c=0
    const start = performance.now();
    const analysis = analyzeTightening(assertions, target);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(analysis.reachable).toBe(true);
    expect(analysis.pathWeight).toBe(0);
    expect(analysis.critical).toBe(0);
    expect(analysis.path).toHaveLength(59);
    // 每个位置取编号最小的平行边：1, 5, 9, ...
    expect(seqOf(analysis)).toEqual(Array.from({ length: 59 }, (_, i) => 1 + i * 4));
  });
});

/**
 * 参考实现：暴力枚举排除目标断言后从 v 到 u 的全部简单路径，
 * 按（总权重, 边数, 编号序列字典序）取唯一最优。
 */
function referenceReturn(
  assertions: Assertion[],
  target: Assertion,
): { weight: number; seq: number[] } | null {
  if (target.u === target.v) return { weight: 0, seq: [] };
  const adj = new Map<string, Assertion[]>();
  for (const a of assertions) {
    if (a.id === target.id) continue;
    const list = adj.get(a.u) ?? [];
    list.push(a);
    adj.set(a.u, list);
  }
  for (const list of adj.values()) list.sort((p, q) => p.id - q.id);

  let best: { weight: number; seq: number[] } | null = null;
  const better = (candidate: { weight: number; seq: number[] }): boolean => {
    if (best === null) return true;
    if (candidate.weight !== best.weight) return candidate.weight < best.weight;
    if (candidate.seq.length !== best.seq.length) return candidate.seq.length < best.seq.length;
    return compareLex(candidate.seq, best.seq) < 0;
  };

  const dfs = (node: string, visited: Set<string>, seq: number[], weight: number): void => {
    for (const e of adj.get(node) ?? []) {
      if (e.v === target.u) {
        const candidate = { weight: weight + e.c, seq: [...seq, e.id] };
        if (better(candidate)) best = candidate;
        continue;
      }
      if (visited.has(e.v)) continue;
      visited.add(e.v);
      dfs(e.v, visited, [...seq, e.id], weight + e.c);
      visited.delete(e.v);
    }
  };
  dfs(target.v, new Set([target.v]), [], 0);
  return best;
}

function compareLex(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

describe('收紧预演：随机图对照暴力枚举 + 临界两侧与求解器一致', () => {
  it('150 组随机相容图：可达性、权、边数、编号序列全部一致', () => {
    let seed = 20260917;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let checked = 0;
    for (let t = 0; t < 150 && checked < 60; t++) {
      const n = 1 + Math.floor(rand() * 6);
      const m = 1 + Math.floor(rand() * 14);
      const assertions: Assertion[] = [];
      for (let i = 0; i < m; i++) {
        assertions.push(
          A(i + 1, `e${Math.floor(rand() * n)}`, `e${Math.floor(rand() * n)}`, Math.floor(rand() * 11) - 5),
        );
      }
      // 预演只在相容批次上进行。
      if (findNegativeCycle(assertions).kind !== 'consistent') continue;
      checked++;
      for (const target of assertions) {
        const analysis = analyzeTightening(assertions, target);
        const expected = referenceReturn(assertions, target);
        if (expected === null) {
          expect(analysis.reachable).toBe(false);
          expect(analysis.critical).toBeNull();
          // 不可达：收紧到下界仍相容。
          expect(evaluateProposal(analysis, C_MIN).kind).toBe('safe');
          expect(solveWithReplacement(assertions, target.id, C_MIN).kind).toBe('consistent');
          continue;
        }
        expect(analysis.reachable).toBe(true);
        expect(analysis.pathWeight).toBe(expected.weight);
        // 取负在 JS 中会得到 -0，与 +0 在 toBe（Object.is）下不等，数学上二者同为 0。
        const expectedCritical = -expected.weight || 0;
        expect(analysis.critical).toBe(expectedCritical);
        expect(seqOf(analysis)).toEqual(expected.seq);
        // 相容保证：临界值不大于原值。
        expect(analysis.critical!).toBeLessThanOrEqual(target.c);

        const tau = analysis.critical!;
        // 临界值（或越界时夹到合法域内）安全；临界值下方一单位越界。
        const safeC = Math.max(C_MIN, Math.min(tau, target.c));
        expect(safeC).toBeGreaterThanOrEqual(tau);
        expect(evaluateProposal(analysis, safeC).kind).toBe('safe');
        expect(solveWithReplacement(assertions, target.id, safeC).kind).toBe('consistent');
        if (tau - 1 >= C_MIN) {
          const verdict = evaluateProposal(analysis, tau - 1);
          expect(verdict.kind).toBe('violation');
          if (verdict.kind === 'violation') {
            expect(verdict.chain.total).toBe(tau - 1 + expected.weight);
            expect(verdict.chain.total).toBe(-1);
            // 矛盾链本身是修订图中的负环。
            expect(verdict.chain.edges[0].u).toBe(target.u);
            for (let i = 0; i < verdict.chain.edges.length; i++) {
              const cur = verdict.chain.edges[i];
              const next = verdict.chain.edges[i + 1];
              if (next) expect(cur.v).toBe(next.u);
            }
            expect(verdict.chain.edges[verdict.chain.edges.length - 1].v).toBe(target.u);
          }
          expect(solveWithReplacement(assertions, target.id, tau - 1).kind).toBe('negative-cycle');
        }
      }
    }
    expect(checked).toBeGreaterThan(30); // 确保确实对照了足够多的相容图
  });

  it('拒绝大于原值的提议由 UI 校验层负责（分析层接受任意整数 c′）', () => {
    // 分析层不重复录入校验：给定超界提议也能数学判定（此处仅确认不抛错）。
    const assertions = [A(1, 'a', 'b', 3), A(2, 'b', 'a', -2)];
    const analysis = analyzeTightening(assertions, assertions[0]);
    expect(analysis.critical).toBe(2);
    expect(evaluateProposal(analysis, C_MAX).kind).toBe('safe');
  });
});
