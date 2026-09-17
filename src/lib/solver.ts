/**
 * 差分约束负环求证。
 *
 * 断言 (u, v, c) 构成有向边 u -> v，权重 c。约束系统不自洽，当且仅当图中
 * 存在权重和小于零的有向环。本模块在找到负环时给出可逐步复核的见证：
 *
 * 1. 见证是权重和小于零的有向【简单】环：除闭合首尾外事件不重复，
 *    断言自然也不重复（同一断言若在环上出现两次必然重复事件）。
 * 2. 在所有负简单环中先取边数最少者：
 *    边数最少的负【闭途径】必为简单环（否则可拆成两个更短闭途径，
 *    至少一个为负，矛盾），故用 min-plus 矩阵幂逐阶检查对角线即可
 *    得到最小边数 k；此时所有长度为 k 的负闭途径都是简单环。
 * 3. 并列候选沿原方向旋转至最小编号开头（禁止反转），再按编号整数
 *    序列字典序取最小者。编号整批唯一，故最小者唯一，结果稳定，
 *    与平行边、自环、多环的存在无关。
 *
 * 性能：不枚举全部候选环（简单路径数在 60 事件 / 240 断言上限内可达
 * 指数级，会长时间卡死主线程）。min-plus 精确步数幂 P_r = M^r 同时充当
 * 可行性预言机：沿当前前缀走到 x（已累计权重 w，还剩 t 步）时，
 * w + e.c + P[t-1][y][s] < 0 当且仅当边 e 之后还能接成一条长度为 k 的
 * 负闭途径；而长度为 k 的负闭途径必为简单环，故该判定对“能否接成负
 * 简单环”是精确的（不是松驰下界）。于是：
 *
 * - 按编号升序找第一条能作为长度 k 负环首边的边 e（即最小环上的最小
 *   编号边，规范化序列的首元素）；
 * - 从 e 出发逐步贪心：每一步选仍能接成负环的编号最小边。
 *
 * 总复杂度为多项式：矩阵幂 O(n^4)，贪心 O(k·m)。
 */
import type { Assertion, NegativeCycleWitness, SolveResult } from './types';

/** min-plus 矩阵乘：C[i][j] = min_l A[i][l] + B[l][j]。 */
function minPlusMultiply(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    for (let l = 0; l < n; l++) {
      const ail = a[i][l];
      if (!Number.isFinite(ail)) continue;
      const bl = b[l];
      const ci = out[i];
      for (let j = 0; j < n; j++) {
        const blj = bl[j];
        if (!Number.isFinite(blj)) continue;
        const candidate = ail + blj;
        if (candidate < ci[j]) ci[j] = candidate;
      }
    }
  }
  return out;
}

/** 按整数数值比较两个编号序列的字典序。 */
export function compareIdSequences(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 沿原方向旋转，使环以最小断言编号开头；不改变方向、不重排边。 */
export function normalizeCycleRotation(edges: Assertion[]): Assertion[] {
  let minIndex = 0;
  for (let i = 1; i < edges.length; i++) {
    if (edges[i].id < edges[minIndex].id) minIndex = i;
  }
  return [...edges.slice(minIndex), ...edges.slice(0, minIndex)];
}

/**
 * 在断言图上求证。断言须已通过整批校验（编号唯一等）。
 * 返回约束相容，或一个满足全部选取规则的负环见证。
 */
export function findNegativeCycle(assertions: Assertion[]): SolveResult {
  if (assertions.length === 0) return { kind: 'consistent' };

  // 事件名区分大小写：直接以字符串相等建立索引；排序仅为确定性。
  const events = [...new Set(assertions.flatMap((a) => [a.u, a.v]))].sort();
  const n = events.length;
  const indexOf = new Map(events.map((name, i) => [name, i] as const));

  // min-plus 邻接矩阵：平行边取最小权重用于下界与最小边数判定。
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (const a of assertions) {
    const i = indexOf.get(a.u)!;
    const j = indexOf.get(a.v)!;
    if (a.c < matrix[i][j]) matrix[i][j] = a.c;
  }

  // powers[r] = M^r（精确 r 步的最小权重），r = 0..n。
  // P_0 为 min-plus 单位阵（对角线 0，余为无穷）。
  const identity: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let i = 0; i < n; i++) identity[i][i] = 0;
  const powers: number[][][] = [identity];

  // 逐阶计算精确步数幂，首个使某对角线元素变负的 k 就是负简单环的最小边数。
  let kMin = -1;
  let current = identity;
  for (let k = 1; k <= n; k++) {
    current = k === 1 ? matrix : minPlusMultiply(current, matrix);
    powers.push(current);
    for (let i = 0; i < n; i++) {
      if (current[i][i] < 0) {
        kMin = k;
        break;
      }
    }
    if (kMin !== -1) break;
  }
  if (kMin === -1) return { kind: 'consistent' };

  // 出边表：按编号升序，保证贪心每一步优先尝试小编号边。
  const outgoing: Assertion[][] = Array.from({ length: n }, () => []);
  for (const a of assertions) outgoing[indexOf.get(a.u)!].push(a);
  for (const list of outgoing) list.sort((p, q) => p.id - q.id);

  // 规范化（旋转至最小编号开头）后的序列首元素，就是环上的最小断言编号。
  // 按编号升序扫描：第一条能落在长度为 kMin 的负闭途径上的边，即为最优环的
  // 最小边；它的尾点也就是环的起点 s。可行性：e.c + P[k-1][v(e)][s] < 0。
  const edgesById = [...assertions].sort((p, q) => p.id - q.id);
  let first: Assertion | null = null;
  for (const e of edgesById) {
    const s = indexOf.get(e.u)!;
    const y = indexOf.get(e.v)!;
    if (e.c + powers[kMin - 1][y][s] < 0) {
      first = e;
      break;
    }
  }
  if (first === null) {
    // 逻辑上不可达：kMin 已保证存在长度为 kMin 的负闭途径，其首边必被扫到。
    throw new Error('内部错误：已探测到负环，但找不到可成环的首边');
  }

  // 从 first 出发贪心构造：每一步选「接上后仍能完成长度为 kMin 的负简单环」
  // 的编号最小边。预言机判定是精确的：长度 kMin 的负闭途径必为简单环，
  // 任何会重复事件（含提前回到 s）的选择都不可能满足 w + P_t[y][s] < 0。
  const s = indexOf.get(first.u)!;
  const used = new Array<boolean>(n).fill(false);
  used[s] = true;
  const path: Assertion[] = [first];
  const y0 = indexOf.get(first.v)!;
  used[y0] = true;
  let x = y0;
  let weight = first.c;

  while (path.length < kMin) {
    const remaining = kMin - path.length; // 含本步在内还差的边数
    let chosen: Assertion | null = null;
    for (const edge of outgoing[x]) {
      const y = indexOf.get(edge.v)!;
      const nextWeight = weight + edge.c;
      let feasible: boolean;
      if (remaining === 1) {
        feasible = y === s && nextWeight < 0;
      } else {
        // 最后一步之前回到 s、或踏入已访问事件都会重复事件；
        // 预言机本就会排除，这里显式拦截仅为清晰与省事。
        feasible =
          y !== s &&
          !used[y] &&
          nextWeight + powers[remaining - 1][y][s] < 0;
      }
      if (feasible) {
        chosen = edge;
        break;
      }
    }
    if (chosen === null) {
      // 逻辑上不可达：首边可行性已保证存在完整负环，贪心每步保持可行性。
      throw new Error('内部错误：负环构造中途丢失可行后继');
    }
    path.push(chosen);
    weight += chosen.c;
    x = indexOf.get(chosen.v)!;
    used[x] = true;
  }

  // first 是按编号升序找到的最小成环边，贪心又始终以最小编号边延续，
  // 故 path 已以最小断言编号开头；rotate 在此为恒等变换，仅用于显式守住不变量。
  const edges = normalizeCycleRotation(path);

  let cumulative = 0;
  const steps = edges.map((assertion) => {
    cumulative += assertion.c;
    return { assertion, cumulative };
  });
  const witness: NegativeCycleWitness = { edges, total: cumulative, steps };
  return { kind: 'negative-cycle', witness };
}
