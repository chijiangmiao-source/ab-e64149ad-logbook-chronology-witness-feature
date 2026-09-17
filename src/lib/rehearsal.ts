/**
 * 单条断言收紧的修订预演。
 *
 * 考证员在一批日志已确认相容后，常会把某条断言 (u, v, c) 的上界收紧为
 * c' ≤ c。收紧后系统是否仍相容？
 *
 * 记被修订断言为 e*（u→v，拟议权重 c'）。收紧只会让不等式更强，故新系统
 * 出现矛盾，当且仅当存在一条从 v 回到 u 的有向路径 P（不使用 e* 本身），
 * 使得 c' + w(P) < 0。于是：
 *
 *   d* = min{ w(P) : P 为 G - e* 中从 v 到 u 的有向路径 }
 *
 * - 不存在这样的路径（d* = +∞）：断言可无限收紧，无有限临界值；
 * - 临界值 t = -d*：c' ≥ t 时相容（c' + d* ≥ 0），c' < t 时矛盾；
 *   由于 c' 为整数，“安全”等价于 c' ≥ t。
 *
 * 注意零权回路的存在：最短路径可能不是简单路径，但由于 G - e* 不含负环
 * （整批原本相容，删边不会产生负环），任意最短路径都可去掉所有零权回路
 * 得到一条权重相同的简单路径，故只需在最多 n-1 条边内逐级求精确步数
 * 最小值。逐级比较（总权重 → 边数 → 编号序列）也天然破除零权回路带来的
 * 并列，给出唯一证明链。
 *
 * 唯一证明链的选取规则（全部并列时依次比较）：
 * 1. 总权重最小；
 * 2. 边数最少（在取得最小总权重的边数中取最小）；
 * 3. 断言编号整数序列字典序最小。
 *
 * 实现用 min-plus 精确步数幂充当可行性预言机做贪心构造（与 solver.ts
 * 同一思路），不枚举候选路径：
 *   沿当前前缀走到 x（累计权重 w，还剩 t 步）时，接上出边 e = x→y 后
 *   能否在 L 步内以目标总权重 d* 完成，等价于存在 r ∈ [0, t-1] 使
 *   w + e.c + Q[r][y][s] = d*，其中 Q[r] 为 G - e* 的精确 r 步幂
 *   （Q[0] 为 min-plus 单位阵）。编号整批唯一，贪心始终取最小编号边，
 * 故所得序列在全部最优路径中字典序最小、结果唯一，与输入行序无关。
 */
import type { Assertion, RehearsalResult, RehearsalStep } from './types';

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

/**
 * 在排除指定断言后的图上，求从结束事件 v(e*) 回到起始事件 u(e*) 的
 * 最小权重路径及其唯一证明链。
 *
 * @returns 路径断言（沿路径顺序）、总权重与边数；不可达时返回 null。
 */
export function shortestReturnPath(
  assertions: Assertion[],
  excludedId: number,
): { edges: Assertion[]; weight: number; length: number } | null {
  const others = assertions.filter((a) => a.id !== excludedId);
  const target = assertions.find((a) => a.id === excludedId);
  if (target === undefined) return null;

  // 事件索引须包含被排除边的两端：它的起点是路径终点，终点是路径起点。
  const events = [...new Set(assertions.flatMap((a) => [a.u, a.v]))].sort();
  const n = events.length;
  const indexOf = new Map(events.map((name, i) => [name, i] as const));
  const start = indexOf.get(target.v)!; // 从被修订边的结束事件出发
  const goal = indexOf.get(target.u)!; // 回到被修订边的起始事件

  // min-plus 邻接矩阵（G - e*）：平行边取最小权重。
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (const a of others) {
    const i = indexOf.get(a.u)!;
    const j = indexOf.get(a.v)!;
    if (a.c < matrix[i][j]) matrix[i][j] = a.c;
  }

  // Q[r] = M^r（精确 r 步的最小权重），r = 0..n-1。
  const identity: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let i = 0; i < n; i++) identity[i][i] = 0;
  const powers: number[][][] = [identity];
  let current = identity;
  for (let r = 1; r <= n - 1; r++) {
    current = r === 1 ? matrix : minPlusMultiply(current, matrix);
    powers.push(current);
  }

  // 逐级比较：先总权重，再边数。无负环时 n-1 步足以覆盖某条最短简单路径。
  let dStar = Infinity;
  let lStar = -1;
  for (let r = 0; r <= n - 1; r++) {
    const value = powers[r][start][goal];
    if (value < dStar) {
      dStar = value;
      lStar = r;
    }
  }
  if (!Number.isFinite(dStar)) return null; // 无返回路径：可无限收紧。

  // 长度为 0 仅当 start === goal（被修订断言为自环）：空路径是唯一最优证明链。
  if (lStar === 0) return { edges: [], weight: 0, length: 0 };

  // 出边表按编号升序：贪心每一步优先尝试最小编号边。
  const outgoing: Assertion[][] = Array.from({ length: n }, () => []);
  for (const a of others) outgoing[indexOf.get(a.u)!].push(a);
  for (const list of outgoing) list.sort((p, q) => p.id - q.id);

  // 贪心构造：从 start 出发，每一步选「接上后仍能在剩余步数内以总权重
  // d* 抵达 goal」的编号最小边。预言机是精确的（取等号判定），且 G - e*
  // 无负环：任何重复事件的前缀都可借删除环路段在更短步数内达到不更大的
  // 权重，逐级比较已保证最短边数，故可行选择不会重复事件。
  const path: Assertion[] = [];
  let x = start;
  let weight = 0;
  let remaining = lStar; // 含本步在内还差的边数
  while (remaining > 0) {
    let chosen: Assertion | null = null;
    for (const edge of outgoing[x]) {
      const y = indexOf.get(edge.v)!;
      const nextWeight = weight + edge.c;
      // 接上 e 后还需 r ∈ [0, remaining-1] 步从 y 到 goal；
      // 取等号保证整条路径总权重恰为 d*。
      let feasible = false;
      for (let r = 0; r <= remaining - 1; r++) {
        if (nextWeight + powers[r][y][goal] === dStar) {
          feasible = true;
          break;
        }
      }
      if (feasible) {
        chosen = edge;
        break;
      }
    }
    if (chosen === null) {
      // 逻辑上不可达：dStar 由精确步数幂取得，必存在对应路径被贪心复现。
      throw new Error('内部错误：最短返回路径构造中途丢失可行后继');
    }
    path.push(chosen);
    weight += chosen.c;
    x = indexOf.get(chosen.v)!;
    remaining -= 1;
  }

  if (x !== goal || weight !== dStar || path.length !== lStar) {
    throw new Error('内部错误：最短返回路径构造结果不自洽');
  }
  return { edges: path, weight: dStar, length: lStar };
}

/**
 * 预演：把编号 targetId 的断言上界拟改为 cRaw（整数），评估能否安全收紧。
 *
 * 前置条件：assertions 已通过整批校验（编号唯一），且整批相容
 * （findNegativeCycle 判定 consistent）——收紧预演只在相容结论旁提供。
 */
export function rehearseTightening(
  assertions: Assertion[],
  targetId: number,
  cRaw: string,
): RehearsalResult {
  const target = assertions.find((a) => a.id === targetId);
  if (target === undefined) {
    return { kind: 'invalid', targetId, cNew: null, cOld: NaN, cRaw, reason: '目标断言不存在' };
  }
  const cOld = target.c;

  const trimmed = cRaw.trim();
  const cNew = /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
  if (cNew === null) {
    return { kind: 'invalid', targetId, cNew: null, cOld, cRaw, reason: '新上界须为整数（形如 -3、0、42）' };
  }
  if (cNew < -100_000 || cNew > 100_000) {
    return {
      kind: 'invalid',
      targetId,
      cNew,
      cOld,
      cRaw,
      reason: '新上界须在 -100000 至 100000 之间',
    };
  }
  if (cNew > cOld) {
    return {
      kind: 'invalid',
      targetId,
      cNew,
      cOld,
      cRaw,
      reason: `新上界须不大于原值 ${cOld}（修订预演只支持收紧，不支持放宽）`,
    };
  }

  const shortest = shortestReturnPath(assertions, targetId);
  if (shortest === null) {
    return { kind: 'unbounded', targetId, cNew, cOld };
  }

  // -0 归一化：空路径权重为 +0，取负会得到 -0，影响严格相等与展示。
  const threshold = -shortest.weight + 0;
  if (cNew >= threshold) {
    return { kind: 'safe', targetId, cNew, cOld, threshold };
  }

  // 越界：拟议断言 + 返回路径组成权重和小于零的矛盾链。
  const steps: RehearsalStep[] = [{ assertion: target, revised: true, cumulative: cNew }];
  let cumulative = cNew;
  for (const edge of shortest.edges) {
    cumulative += edge.c;
    steps.push({ assertion: edge, revised: false, cumulative });
  }
  return {
    kind: 'violated',
    targetId,
    cNew,
    cOld,
    threshold,
    steps,
    total: cNew + shortest.weight,
    pathWeight: shortest.weight,
    edgeCount: shortest.length,
  };
}
