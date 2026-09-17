import type { Assertion, RehearsalResult } from '../lib/types';

/**
 * 单条断言收紧的修订预演面板（仅在“约束相容”结论旁出现）。
 *
 * - safe / unbounded：可一键把新上界写回目标行（录入表本身不被预演改动）；
 * - violated：展示由拟议断言与排除被修订边后的返回路径组成的逐步累计矛盾链，
 *   不提供写回；
 * - invalid：就地反馈原因。
 */
export function RehearsalPanel({
  target,
  input,
  result,
  onInputChange,
  onWriteBack,
  onCancel,
}: {
  target: Assertion;
  input: string;
  result: RehearsalResult | null;
  onInputChange: (value: string) => void;
  onWriteBack: (cNew: number) => void;
  onCancel: () => void;
}) {
  return (
    <section className="rehearsal" data-testid="rehearsal-panel" aria-live="polite">
      <h2>修订预演：收紧单条断言上界</h2>
      <p className="meta" data-testid="rehearsal-target">
        目标断言 #{target.id}：
        <code>
          date({target.v}) − date({target.u}) ≤ {target.c}
        </code>
        ，拟在不改动录入表的前提下预演收紧上界。
      </p>
      <div className="rehearsal-form">
        <label htmlFor="rehearsal-c">新上界 c</label>
        <input
          id="rehearsal-c"
          data-testid="rehearsal-c"
          value={input}
          inputMode="numeric"
          placeholder={`不大于 ${target.c} 的整数`}
          onChange={(e) => onInputChange(e.target.value)}
        />
        <button type="button" className="link" onClick={onCancel} data-testid="rehearsal-cancel">
          取消预演
        </button>
      </div>

      {result === null && (
        <p className="hint" data-testid="rehearsal-pending">
          请输入范围内（-100000 至 100000）且不大于原值 {target.c} 的整数新上界。
        </p>
      )}

      {result?.kind === 'invalid' && (
        <p className="rehearsal-msg bad" role="alert" data-testid="rehearsal-invalid">
          {result.reason}
        </p>
      )}

      {result?.kind === 'unbounded' && (
        <div className="rehearsal-msg good" data-testid="rehearsal-unbounded">
          <p className="verdict">无有限临界值：排除该断言后不存在从「{target.v}」回到「{target.u}」的路径。</p>
          <p>
            该断言持续收紧也无法与其他断言闭合成环，拟议值 {result.cNew} 可安全写回
            （写回后可再次考证复核）。
          </p>
          <WriteBackButton cNew={result.cNew} onWriteBack={onWriteBack} />
        </div>
      )}

      {result?.kind === 'safe' && (
        <div className="rehearsal-msg good" data-testid="rehearsal-safe">
          <p className="verdict" data-testid="rehearsal-threshold">
            可安全收紧的临界值为 {result.threshold}：新上界 c ≥ {result.threshold} 时约束相容，
            c ≤ {result.threshold - 1} 时产生矛盾（与负环求证结果一致）。
          </p>
          <p>
            拟议值 {result.cNew} 不小于临界值，收紧后系统仍相容，可一键写回第 {target.row} 行
            （写回后旧结论清除，可再次考证）。
          </p>
          <WriteBackButton cNew={result.cNew} onWriteBack={onWriteBack} />
        </div>
      )}

      {result?.kind === 'violated' && <ViolatedChain result={result} target={target} />}
    </section>
  );
}

function WriteBackButton({ cNew, onWriteBack }: { cNew: number; onWriteBack: (cNew: number) => void }) {
  return (
    <button
      type="button"
      className="writeback"
      onClick={() => onWriteBack(cNew)}
      data-testid="rehearsal-writeback"
    >
      写回新上界 {cNew}
    </button>
  );
}

function ViolatedChain({ result, target }: { result: Extract<RehearsalResult, { kind: 'violated' }>; target: Assertion }) {
  return (
    <div className="rehearsal-msg bad" data-testid="rehearsal-violated">
      <p className="verdict">
        越界：可安全收紧的临界值为 {result.threshold}，拟议值 {result.cNew} ≤ {result.threshold - 1}，
        拟议断言与排除该断言后的最短返回路径闭合成负环。已禁止写回。
      </p>
      <p className="meta">
        返回路径（{result.edgeCount} 条边，总权重 {result.pathWeight}）按总权重、边数、
        编号序列依次取唯一最优；逐步累计如下：
      </p>
      <ol className="chain">
        {result.steps.map((step, i) => {
          // 首步是拟议断言：不等式中的上界须显示拟议值 cNew，而非录入表里的原值。
          const shownC = step.revised ? result.cNew : step.assertion.c;
          return (
            <li
              key={`${step.revised ? 'revised' : 'path'}-${step.assertion.id}-${i}`}
              data-testid={`rehearsal-step-${i}`}
              className={step.revised ? 'step-revised' : ''}
            >
              <span className="step-order">{step.revised ? '拟议断言' : `返回第 ${i} 步`}</span>
              <span className="step-id">断言 #{step.assertion.id}</span>
              <span className="step-ineq">
                date({step.assertion.v}) − date({step.assertion.u}) ≤ {shownC}
              </span>
              <span className="step-sum" data-testid={`rehearsal-step-${i}-sum`}>
                累计和 = {step.cumulative}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="conclusion" data-testid="rehearsal-total">
        将拟议断言 #{target.id}（上界 {result.cNew}）与返回路径的不等式相加：左端沿环相消为 0，
        右端累计总和 = {result.total}。总和小于零 —— 得到 0 ≤ {result.total} 的矛盾。
      </p>
    </div>
  );
}

/** 预演因录入表变化或目标行删除而作废时的就地反馈。 */
export function RehearsalVoidNotice({ message }: { message: string }) {
  return (
    <section className="rehearsal" data-testid="rehearsal-void" aria-live="polite">
      <p className="rehearsal-msg warn" role="alert">
        {message}
      </p>
    </section>
  );
}
