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

/**
 * 修订预演中的一步：拟议断言（首步）或返回路径上的断言（其余步），
 * 附沿矛盾链走到该步为止的累计权重。
 */
export interface RehearsalStep {
  assertion: Assertion;
  /** 该步是否为被修订断言本身（拟议断言）；false 表示属于排除边后的返回路径。 */
  revised: boolean;
  /** 沿矛盾链累加到本步（含）的权重和。 */
  cumulative: number;
}

/**
 * 单条断言收紧预演结果（被修订边不参与返回路径计算）。
 *
 * - safe：新上界 cNew 不超过安全临界值 threshold，写回后系统仍相容；
 * - violated：cNew 越过临界值，拟议断言与返回路径组成权重和为负的矛盾链，禁止写回；
 * - unbounded：不存在从结束事件回到起始事件的路径，断言可无限收紧，无有限临界值；
 * - invalid：拟议 cNew 不是合法整数、超出 c 取值范围或不小于原值。
 */
export type RehearsalResult =
  | {
      kind: 'safe';
      /** 目标断言编号。 */
      targetId: number;
      /** 拟议新上界。 */
      cNew: number;
      /** 原上界。 */
      cOld: number;
      /** 可安全收紧的临界值（safe 必有有限返回路径）。 */
      threshold: number;
    }
  | {
      kind: 'violated';
      targetId: number;
      cNew: number;
      cOld: number;
      /** 导致越界的临界值。 */
      threshold: number;
      /** 矛盾链：首元素为拟议断言，其后为排除被修订边后的返回路径。 */
      steps: RehearsalStep[];
      /** 拟议断言权重与返回路径权重之和（即矛盾链累计总和），保证小于零。 */
      total: number;
      /** 返回路径的总权重。 */
      pathWeight: number;
      /** 返回路径的边数。 */
      edgeCount: number;
    }
  | {
      kind: 'unbounded';
      targetId: number;
      cNew: number;
      cOld: number;
    }
  | {
      kind: 'invalid';
      targetId: number;
      /** 成功解析为整数时的拟议值，否则为 null。 */
      cNew: number | null;
      cOld: number;
      /** 用户输入的原始字符串。 */
      cRaw: string;
      /** 无法预演的原因（就地反馈）。 */
      reason: string;
    };
