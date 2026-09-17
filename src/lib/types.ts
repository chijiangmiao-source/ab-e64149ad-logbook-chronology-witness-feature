/**
 * 领域类型：差分约束断言与负环见证。
 *
 * 一条断言 (id, u, v, c) 的语义为：date(v) - date(u) <= c。
 */

export interface Assertion {
  /** 断言编号，匹配 [1-9][0-9]{0,5}，整批唯一，按整数数值比较。 */
  id: number;
  /** 起始事件名（区分大小写）。 */
  u: string;
  /** 结束事件名（区分大小写）。 */
  v: string;
  /** 整数上界，范围 [-100000, 100000]。 */
  c: number;
  /** 在表单中的行号（从 1 开始），用于就地标错与展示。 */
  row: number;
}

/** 见证环上的一步：按环序排列的断言及走到该步为止的累计权重和。 */
export interface CycleStep {
  assertion: Assertion;
  /** 沿环序累加到本步（含）的 c 值之和。 */
  cumulative: number;
}

/**
 * 负环见证：权重和小于零的有向简单环。
 * - 除闭合首尾外事件不重复，断言不重复；
 * - edges 已沿原方向旋转至最小编号开头（禁止反转）；
 * - 在所有边数最少的候选环中，其编号整数序列字典序最小。
 */
export interface NegativeCycleWitness {
  /** 环上断言，按环序（已规范化旋转）。 */
  edges: Assertion[];
  /** 环上全部 c 值之和，保证小于零。 */
  total: number;
  /** 逐步累计和，供页面逐步展示。 */
  steps: CycleStep[];
}

export type SolveResult =
  | { kind: 'consistent' }
  | { kind: 'negative-cycle'; witness: NegativeCycleWitness };

/** 预演证明链上的一步（拟议断言或返回路径上的断言）及走到该步为止的累计和。 */
export interface RehearsalStep {
  assertion: Assertion;
  /** 沿「拟议断言 → 返回路径」的顺序累加到本步（含）的权重和。 */
  cumulative: number;
}

/**
 * 单条断言收紧预演的分析结果。
 *
 * 设拟修订断言 e0 = (u, v, c0)，在【排除 e0】的图上求 v → u 的最小权重
 * （返回）路径：
 * - 不存在返回路径：无论 c′ 收紧到何值都无法闭环，critical 为 null
 *   （无有限临界值）；
 * - 否则 pathWeight 即最小权重 d，临界值 τ = -d：c′ ≥ τ 时修订后仍相容，
 *   c′ < τ 时 e0 与返回路径组成负环。原批次相容保证 τ ≤ c0。
 *
 * 返回路径的唯一性由（总权重, 边数, 编号整数序列字典序）依次确定。
 */
export interface TighteningAnalysis {
  target: Assertion;
  /** 排除目标断言后是否存在从 v 回到 u 的路径（u=v 时空路径总存在）。 */
  reachable: boolean;
  /** 返回路径的最小总权重 d；不可达时为 null。 */
  pathWeight: number | null;
  /** 可安全收紧的临界值 τ = -d；不可达时为 null（无有限临界值）。 */
  critical: number | null;
  /** 唯一最优返回路径上的断言，按 v → u 的经过顺序排列；自环修订时为空数组。 */
  path: Assertion[];
}

/** 越界预演的矛盾链：拟议断言在前，返回路径随后闭合回 u。 */
export interface TighteningChain {
  /** 链上断言，首条为替换了 c 的拟议断言，其余为返回路径。 */
  edges: Assertion[];
  /** 逐步累计和，供页面逐步展示。 */
  steps: RehearsalStep[];
  /** 全链权重和，越界时保证小于零。 */
  total: number;
}

export type ProposalVerdict =
  | { kind: 'safe'; cNew: number; critical: number | null; unbounded: boolean }
  | { kind: 'violation'; cNew: number; critical: number; chain: TighteningChain };
