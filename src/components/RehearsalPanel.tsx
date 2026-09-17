import type { Assertion, ProposalVerdict, TighteningAnalysis } from '../lib/types';
import { C_MAX, C_MIN, C_PATTERN } from '../lib/parse';

/**
 * 单条断言收紧的修订预演面板（仅在整批结论为「约束相容」时出现）。
 *
 * - 不改动录入表即可预演：输入新的整数上界 c′（范围内且不大于原值）；
 * - 可达时展示可安全收紧的临界值 τ：c′ ≥ τ 相容，c′ < τ 越界；
 * - 不可达时明确标注「无有限临界值」；
 * - 越界时展示拟议断言 + 返回路径组成的逐步累计矛盾链，并禁止写回；
 * - 安全时可一键写回该行（由父组件执行并清除旧结论）。
 */
export interface DraftValidation {
  kind: 'empty' | 'error' | 'ok';
  message?: string;
  cNew?: number;
}

export function validateDraft(draft: string, target: Assertion): DraftValidation {
  const value = draft.trim();
  if (value === '') return { kind: 'empty' };
  if (!C_PATTERN.test(value)) return { kind: 'error', message: '新 c 须为整数（形如 -3、0、42）' };
  const cNew = Number.parseInt(value, 10);
  if (cNew < C_MIN || cNew > C_MAX) {
    return { kind: 'error', message: `新 c 须在 ${C_MIN} 至 ${C_MAX} 之间` };
  }
  if (cNew > target.c) {
    return { kind: 'error', message: `收紧后的新 c 必须不大于原值 ${target.c}` };
  }
  return { kind: 'ok', cNew };
}

interface RehearsalPanelProps {
  target: Assertion;
  analysis: TighteningAnalysis;
  draftC: string;
  validation: DraftValidation;
  verdict: ProposalVerdict | null;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function RehearsalPanel({
  target,
  analysis,
  draftC,
  validation,
  verdict,
  onDraftChange,
  onCommit,
  onCancel,
}: RehearsalPanelProps) {
  return (
    <section className="rehearsal" data-testid="rehearsal-panel" aria-live="polite">
      <h2>单条断言收紧预演</h2>
      <p className="meta" data-testid="rehearsal-target">
        目标断言 #{target.id}（第 {target.row} 行）：
        <code>
          date({target.v}) − date({target.u}) ≤ {target.c}
        </code>
        ，预演不改动录入表。
      </p>

      <div className="rehearsal-form">
        <label htmlFor="rehearsal-c">新上界 c′（整数，≤ {target.c}）：</label>
        <input
          id="rehearsal-c"
          data-testid="rehearsal-c"
          value={draftC}
          inputMode="numeric"
          autoFocus
          aria-invalid={validation.kind === 'error'}
          onChange={(e) => onDraftChange(e.target.value)}
        />
        {validation.kind === 'error' && (
          <div className="field-error" role="alert" data-testid="rehearsal-c-error">
            {validation.message}
          </div>
        )}
      </div>

      {analysis.reachable ? (
        <p className="rehearsal-threshold" data-testid="rehearsal-threshold">
          排除断言 #{target.id} 后，从「{target.v}」回到「{target.u}」的最小权重返回路径共{' '}
          {analysis.path.length} 条边、总权重 {analysis.pathWeight}；故可安全收紧的临界值{' '}
          <strong>τ = {analysis.critical}</strong>（c′ ≥ τ 时相容，c′ &lt; τ 时产生负环）。
        </p>
      ) : (
        <p className="rehearsal-threshold" data-testid="rehearsal-unbounded">
          排除断言 #{target.id} 后，不存在从「{target.v}」回到「{target.u}」的路径：
          <strong>无有限临界值</strong>——无论把 c 收紧到何值都无法闭环，可任意收紧。
        </p>
      )}

      {verdict?.kind === 'safe' && (
        <div className="rehearsal-verdict safe" data-testid="rehearsal-safe">
          {verdict.unbounded ? (
            <p>预演判定：安全。无返回路径，c′ = {verdict.cNew} 不可能制造矛盾，可任意收紧。</p>
          ) : (
            <p>
              预演判定：安全。c′ = {verdict.cNew}
              {verdict.cNew === verdict.critical ? ' 恰为临界值，闭环权和为 0，不构成负环' : ''}
              ；可安全收紧的临界值为 τ = {verdict.critical}。
            </p>
          )}
          <div className="rehearsal-actions">
            <button type="button" className="compute" onClick={onCommit} data-testid="rehearsal-write">
              一键写回该行（c = {verdict.cNew}）并清除旧结论
            </button>
          </div>
        </div>
      )}

      {verdict?.kind === 'violation' && (
        <div className="rehearsal-verdict violation" data-testid="rehearsal-violation">
          <p>
            预演判定：越界。c′ = {verdict.cNew} &lt; τ = {verdict.critical}
            ，拟议断言与最小权重返回路径组成负环；<strong>禁止写回</strong>。
          </p>
          <ol className="chain">
            {verdict.chain.steps.map((step, i) => (
              <li key={`${step.assertion.id}-${i}`} data-testid={`rehearsal-step-${i}`}>
                <span className="step-order">
                  {i === 0 ? '拟议断言' : `返回路径第 ${i} 步`}
                </span>
                <span className="step-id">断言 #{step.assertion.id}</span>
                <span className="step-ineq">
                  date({step.assertion.v}) − date({step.assertion.u}) ≤ {step.assertion.c}
                </span>
                <span className="step-sum" data-testid={`rehearsal-step-${i}-sum`}>
                  累计和 = {step.cumulative}
                </span>
              </li>
            ))}
          </ol>
          <p className="conclusion" data-testid="rehearsal-total">
            将拟议断言与 {analysis.path.length} 条返回边相加：左端沿环相消为 0，右端累计总和 ={' '}
            {verdict.chain.total}。总和小于零 —— 得到 0 ≤ {verdict.chain.total} 的矛盾。
          </p>
        </div>
      )}

      <div className="rehearsal-actions">
        <button type="button" className="link" onClick={onCancel} data-testid="rehearsal-cancel">
          取消预演
        </button>
      </div>
    </section>
  );
}
