/**
 * 单条断言收紧的修订预演分析。
 *
 * 背景：考证员已确认一批日志相容（不含负环），现拟把某条断言
 * e0 = (id, u, v, c0) 的日期上界收紧为更小的整数 c′，且不改动录入表，
 * 预演新数值会在何处制造矛盾。
 *
 * 数学结构。以拟议值 c′ 替换 e0 后若产生负环，则该环【必含】 e0：
 * 原批次相容，不含 e0 的任何环权重和都不小于零。把环拆成
 *
 *   u --e0(c′)--> v --（其余边组成的路径 P）--> u
 *
 * 其余边 P 是在【排除 e0】的图上从 v 回到 u 的一条路径，负环条件为
 *
 *   c′ + weight(P) < 0。
 *
 * 故在排除 e0 的图上求 v → u 的【最小权重路径】 d 即可：
 *
 * - v 无法到达 u：任何 c′ 都不能闭环，不存在有限临界值（可任意收紧）；
 * - 否则临界值 τ = -d：c′ ≥ τ 时修订后仍相容（含 c′ = τ 时权和恰为 0，
 *   不是负环）；c′ < τ 时 e0 与该最小权重路径组成负环。
 *
 * 正确性要点：
 * - 原图相容（无负环），排除 e0 后更不可能有负环，故 v→u 的最小权重
 *   途径一定可以取为【简单路径】：任何含闭合环的途径删去该非负环后
 *   权重不增、边数严格更少；这也保证「零权回路」不会制造无限松弛，
 *   最多 n-1 步的精确步数动态规划即可覆盖最优解。
 * - 原批次相容还保证 c0 + d ≥ 0，即 τ ≤ c0——在相容批次上临界值必不
 *   大于原值（调用方亦只接受 c′ ≤ c0 的提议）。
 *
 * 唯一证明链：最小权重路径可能不止一条，依次按
 * （总权重最小, 边数最少, 编号整数序列字典序最小）确定唯一者，
 * 平行边、零权回路并存时结果仍稳定且与输入行序无关。
 */
import type {
  Assertion,
  ProposalVerdict,
  RehearsalStep,
  TighteningAnalysis,
  TighteningChain,
} from './types';

interface BestPath {
  weight: number;
  /** 按经过顺序（从 v 走向 u）排列的断言序列。 */
  path: Assertion[];
}

const absent = (): BestPath => ({ weight: Infinity, path: [] });

/** 候选是否优于当前最优：权重 → 边数 → 编号整数序列字典序。 */
function better(candidate: BestPath, current: BestPath): boolean {
  if (candidate.weight !== current.weight) return candidate.weight < current.weight;
  if (candidate.path.length !== current.path.length) return candidate.path.length < current.path.length;
  for (let i = 0; i < candidate.path.length; i++) {
    if (candidate.path[i].id !== current.path[i].id) {
      return candidate.path[i].id < current.path[i].id;
    }
  }
  return false;
}

/**
 * 在排除编号 targetId 的断言后，求从 v 回到 u 的最小权重路径，
 * 并以（总权重, 边数, 编号序列字典序）确定唯一证明链。
 *
 * 返回不可达结果表示无路径；u === v（如自环修订）时取 0 步空路径，
 * 权重 0、临界值 0。
 */
export function analyzeTightening(assertions: Assertion[], target: Assertion): TighteningAnalysis {
  // 事件名区分大小写：直接以字符串相等建立索引；排序仅为确定性。
  const events = [...new Set(assertions.flatMap((a) => [a.u, a.v]))].sort();
  const indexOf = new Map(events.map((name, i) => [name, i] as const));
  const n = events.length;
  const s = indexOf.get(target.u)!; // 起始事件 u（返回路径的终点）
  const t = indexOf.get(target.v)!; // 结束事件 v（返回路径的起点）

  // 出边表：按编号升序，使同键候选的扫描顺序确定（最终仍以全序列裁定）。
  const outgoing: Assertion[][] = Array.from({ length: n }, () => []);
  for (const a of assertions) {
    if (a.id === target.id) continue; // 排除被修订边
    outgoing[indexOf.get(a.u)!].push(a);
  }
  for (const list of outgoing) list.sort((p, q) => p.id - q.id);

  // 精确步数 DP：dp[r][x] 为从 x 出发、恰用 r 条边到达 s 的最优路径。
  // 无负环时最优解必为至多 n-1 条边的简单路径；自环修订（s===t）由
  // r=0 的空路径覆盖。
  const dp: BestPath[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, absent),
  );
  dp[0][s] = { weight: 0, path: [] };

  let best: BestPath = s === t ? { ...dp[0][s] } : absent();
  for (let r = 1; r <= n - 1; r++) {
    for (let x = 0; x < n; x++) {
      let chosen: BestPath = absent();
      for (const edge of outgoing[x]) {
        const tail = dp[r - 1][indexOf.get(edge.v)!];
        if (!Number.isFinite(tail.weight)) continue;
        const candidate: BestPath = { weight: edge.c + tail.weight, path: [edge, ...tail.path] };
        if (better(candidate, chosen)) chosen = candidate;
      }
      dp[r][x] = chosen;
    }
    if (Number.isFinite(dp[r][t].weight) && better(dp[r][t], best)) best = dp[r][t];
  }

  if (!Number.isFinite(best.weight)) {
    return { target, reachable: false, pathWeight: null, critical: null, path: [] };
  }

  // -(+0) 在 JS 中为 -0，会使临界值与 0 在 Object.is 下不等，统一归一为 +0。
  const weight = best.weight === 0 ? 0 : best.weight;
  const critical = weight === 0 ? 0 : -weight;
  return { target, reachable: true, pathWeight: weight, critical, path: best.path };
}

/**
 * 对提议的新上界 c′ 给出预演判定。调用方保证批次相容、c′ 为
 * [C_MIN, c0] 内的整数。
 *
 * - 无有限临界值（不可达）：恒为安全；
 * - c′ ≥ τ：安全（c′ = τ 时拟议断言 + 返回路径权和恰为 0，非负环）；
 * - c′ < τ：越界，给出由拟议断言与返回路径组成的逐步累计矛盾链。
 */
export function evaluateProposal(analysis: TighteningAnalysis, cNew: number): ProposalVerdict {
  const { critical, reachable, target, path } = analysis;
  if (!reachable || critical === null) {
    return { kind: 'safe', cNew, critical: null, unbounded: true };
  }
  if (cNew >= critical) {
    return { kind: 'safe', cNew, critical, unbounded: false };
  }

  // 越界：拟议断言在前（c 替换为 c′，行号沿用目标行），返回路径随后。
  const proposed: Assertion = { ...target, c: cNew };
  const edges = [proposed, ...path];
  let cumulative = 0;
  const steps: RehearsalStep[] = edges.map((assertion) => {
    cumulative += assertion.c;
    return { assertion, cumulative };
  });
  const chain: TighteningChain = { edges, steps, total: cumulative };
  return { kind: 'violation', cNew, critical, chain };
}
