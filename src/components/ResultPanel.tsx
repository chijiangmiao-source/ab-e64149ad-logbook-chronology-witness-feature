import type { SolveResult } from '../lib/types';

/**
 * 考证结论展示：
 * - 无负环：只显示“约束相容”，绝不编造任何具体日期；
 * - 有负环：按环序逐条展示不等式与累计和，并给出“总和小于零”的结论。
 */
export function ResultPanel({ result }: { result: SolveResult }) {
  if (result.kind === 'consistent') {
    return (
      <section className="result consistent" data-testid="result-consistent" aria-live="polite">
        <h2>考证结论：约束相容</h2>
        <p>
          本批断言不存在权重和小于零的有向简单环（含自环、平行边情形），日志记录自洽，
          未发现矛盾链。
        </p>
        <p>按考证规则，此处不给出、也不推测任何具体日期。</p>
      </section>
    );
  }

  const { witness } = result;
  const idSequence = witness.edges.map((e) => e.id).join(', ');
  return (
    <section className="result negative" data-testid="result-cycle" aria-live="polite">
      <h2>考证结论：发现负环（矛盾链）</h2>
      <p className="meta" data-testid="cycle-meta">
        见证为权重和小于零的有向简单环：共 {witness.edges.length} 条边（边数最少）；
        环已沿原方向旋转至最小编号开头，编号序列为 [{idSequence}]
        （并列候选中字典序最小，未做反转）。
      </p>
      <ol className="chain">
        {witness.steps.map((step, i) => (
          <li key={step.assertion.id} data-testid={`cycle-step-${i}`}>
            <span className="step-order">第 {i + 1} 步</span>
            <span className="step-id">断言 #{step.assertion.id}</span>
            <span className="step-ineq">
              date({step.assertion.v}) − date({step.assertion.u}) ≤ {step.assertion.c}
            </span>
            <span className="step-sum" data-testid={`cycle-step-${i}-sum`}>
              累计和 = {step.cumulative}
            </span>
          </li>
        ))}
      </ol>
      <p className="conclusion" data-testid="cycle-total">
        将上述 {witness.edges.length} 个不等式相加：左端沿环相消为 0，右端累计总和 ={' '}
        {witness.total}。总和小于零 —— 得到 0 ≤ {witness.total} 的矛盾，日志记录不自洽。
      </p>
    </section>
  );
}
