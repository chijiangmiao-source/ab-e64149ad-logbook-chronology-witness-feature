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
