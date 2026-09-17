import { useMemo, useState } from 'react';
import {
  C_MAX,
  C_MIN,
  MAX_ASSERTIONS,
  MAX_EVENTS,
  hasErrors,
  validateBatch,
  type RawRow,
} from './lib/parse';
import { findNegativeCycle } from './lib/solver';
import type { SolveResult } from './lib/types';
import { ResultPanel } from './components/ResultPanel';

interface RowState extends RawRow {
  key: number;
}

let nextKey = 1;
const emptyRow = (): RowState => ({ key: nextKey++, id: '', u: '', v: '', c: '' });
const fromRaw = (raw: RawRow): RowState => ({ key: nextKey++, ...raw });

/** 负环示例：3+2-6 = -1 < 0；编号故意乱序，演示旋转至最小编号开头。 */
const NEGATIVE_EXAMPLE: RawRow[] = [
  { id: '7', u: '靠港', v: '补给', c: '3' },
  { id: '2', u: '补给', v: '离港', c: '2' },
  { id: '5', u: '离港', v: '靠港', c: '-6' },
];

/** 相容示例：3+2-5 = 0，不存在负环。 */
const CONSISTENT_EXAMPLE: RawRow[] = [
  { id: '1', u: '靠港', v: '补给', c: '3' },
  { id: '2', u: '补给', v: '离港', c: '2' },
  { id: '3', u: '离港', v: '靠港', c: '-5' },
];

export default function App() {
  const [rows, setRows] = useState<RowState[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [result, setResult] = useState<SolveResult | null>(null);

  const batch = useMemo(() => validateBatch(rows), [rows]);
  const filledCount = batch.rows.filter((r) => !r.empty).length;
  const eventCount = new Set(batch.assertions.flatMap((a) => [a.u, a.v])).size;

  const mutate = (updater: (prev: RowState[]) => RowState[]) => {
    setResult(null); // 输入一旦变化，旧结论作废，避免展示过期矛盾链。
    setRows(updater);
  };
  const updateField = (key: number, field: keyof RawRow, value: string) =>
    mutate((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow = () => mutate((prev) => [...prev, emptyRow()]);
  const removeRow = (key: number) => mutate((prev) => prev.filter((r) => r.key !== key));
  const loadRows = (raws: RawRow[]) => mutate(() => raws.map(fromRaw));

  const compute = () => {
    if (!batch.ok) return;
    setResult(findNegativeCycle(batch.assertions));
  };

  return (
    <main className="page">
      <header>
        <h1>航海日志差分约束负环考证</h1>
        <p className="lede">
          每行录入一条断言：编号、起始事件 u、结束事件 v、整数 c，语义为{' '}
          <code>date(v) − date(u) ≤ c</code>。考证员据此寻找最短且可重复复核的矛盾链
          （权重和小于零的有向简单环）。
        </p>
        <ul className="rules">
          <li>编号匹配 <code>[1-9][0-9]{'{0,5}'}</code>，整批唯一，按整数数值比较；</li>
          <li>事件名区分大小写、非空，可含空格（含首尾空格）与中文等字符（长度不限，完全按原样参与计算）；</li>
          <li>c 为整数，范围 {C_MIN} 至 {C_MAX}；</li>
          <li>每批 1–{MAX_EVENTS} 个事件、1–{MAX_ASSERTIONS} 条断言；任一非法行均阻止计算。</li>
        </ul>
      </header>

      <section aria-label="断言录入">
        <div className="toolbar">
          <button type="button" onClick={addRow} data-testid="add-row">
            添加断言行
          </button>
          <button type="button" onClick={() => loadRows(NEGATIVE_EXAMPLE)} data-testid="load-negative">
            载入负环示例
          </button>
          <button type="button" onClick={() => loadRows(CONSISTENT_EXAMPLE)} data-testid="load-consistent">
            载入相容示例
          </button>
          <button type="button" onClick={() => loadRows([{ id: '', u: '', v: '', c: '' }])} data-testid="clear-rows">
            清空
          </button>
          <span className="counter" data-testid="batch-counter">
            当前 {filledCount} 条断言 / {eventCount} 个事件（上限 {MAX_ASSERTIONS} 条 / {MAX_EVENTS} 个）
          </span>
        </div>

        <table className="assertions">
          <thead>
            <tr>
              <th scope="col">行</th>
              <th scope="col">断言编号</th>
              <th scope="col">起始事件 u</th>
              <th scope="col">结束事件 v</th>
              <th scope="col">上界 c</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const validation = batch.rows[i];
              const errors = validation?.errors ?? {};
              const invalid = validation !== undefined && !validation.empty && hasErrors(errors);
              return (
                <tr key={row.key} className={invalid ? 'row-invalid' : ''} data-testid={`row-${i}`}>
                  <td className="row-number">{i + 1}</td>
                  <td>
                    <input
                      value={row.id}
                      inputMode="numeric"
                      placeholder="如 12"
                      aria-label={`第 ${i + 1} 行断言编号`}
                      aria-invalid={Boolean(errors.id)}
                      data-testid={`row-${i}-id`}
                      onChange={(e) => updateField(row.key, 'id', e.target.value)}
                    />
                    {errors.id && (
                      <div className="field-error" role="alert" data-testid={`row-${i}-id-error`}>
                        {errors.id}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      value={row.u}
                      placeholder="如 靠港"
                      aria-label={`第 ${i + 1} 行起始事件`}
                      aria-invalid={Boolean(errors.u)}
                      data-testid={`row-${i}-u`}
                      onChange={(e) => updateField(row.key, 'u', e.target.value)}
                    />
                    {errors.u && (
                      <div className="field-error" role="alert" data-testid={`row-${i}-u-error`}>
                        {errors.u}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      value={row.v}
                      placeholder="如 补给"
                      aria-label={`第 ${i + 1} 行结束事件`}
                      aria-invalid={Boolean(errors.v)}
                      data-testid={`row-${i}-v`}
                      onChange={(e) => updateField(row.key, 'v', e.target.value)}
                    />
                    {errors.v && (
                      <div className="field-error" role="alert" data-testid={`row-${i}-v-error`}>
                        {errors.v}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      value={row.c}
                      inputMode="numeric"
                      placeholder="如 -3"
                      aria-label={`第 ${i + 1} 行上界 c`}
                      aria-invalid={Boolean(errors.c)}
                      data-testid={`row-${i}-c`}
                      onChange={(e) => updateField(row.key, 'c', e.target.value)}
                    />
                    {errors.c && (
                      <div className="field-error" role="alert" data-testid={`row-${i}-c-error`}>
                        {errors.c}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => removeRow(row.key)}
                      data-testid={`row-${i}-remove`}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {batch.batchErrors.length > 0 && (
          <ul className="batch-errors" data-testid="batch-errors">
            {batch.batchErrors.map((message) => (
              <li key={message} role="alert">
                {message}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="compute"
          disabled={!batch.ok}
          onClick={compute}
          data-testid="compute-button"
        >
          开始考证
        </button>
        {!batch.ok && (
          <p className="hint" data-testid="compute-blocked">
            存在非法行或整批错误，已阻止计算；请修正就地标注的错误。
          </p>
        )}
      </section>

      {result && <ResultPanel result={result} />}
    </main>
  );
}
