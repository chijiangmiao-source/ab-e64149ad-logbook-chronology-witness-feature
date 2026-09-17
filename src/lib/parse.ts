/**
 * 录入校验：逐行解析断言编号、起始事件 u、结束事件 v 与整数 c，
 * 并做整批校验（编号唯一、事件数与断言数上限）。
 *
 * 规则（与需求一一对应）：
 * - 编号须匹配 [1-9][0-9]{0,5}（即 1–999999，无符号、无前导零）；
 * - 编号整批唯一，按整数数值比较；
 * - 事件名区分大小写、非空，可含空格（含首尾空格）与中文等任意 Unicode 字符，
 *   长度不限，完全按录入原样参与计算（不做任何裁剪或归一化；" 靠港 " 与 "靠港"
 *   是两个不同事件）；
 * - c 为整数，范围 [-100000, 100000]；
 * - 每批 1–60 个事件、1–240 条断言；
 * - 任一非法行均阻止计算，错误就地标在该行；
 * - 全空行视为未使用而忽略；只填了部分字段的行视为非法行。
 */
import type { Assertion } from './types';

export const ID_PATTERN = /^[1-9][0-9]{0,5}$/;
export const C_PATTERN = /^-?\d+$/;
export const C_MIN = -100_000;
export const C_MAX = 100_000;
export const MAX_EVENTS = 60;
export const MAX_ASSERTIONS = 240;

/** 表单一行的原始输入（均为字符串，未 trim）。 */
export interface RawRow {
  id: string;
  u: string;
  v: string;
  c: string;
}

export interface FieldErrors {
  id?: string;
  u?: string;
  v?: string;
  c?: string;
}

export interface RowValidation {
  /** 行号，从 1 开始。 */
  row: number;
  /** 规整后的字段：id、c 已裁剪首尾空白；u、v 完全保持录入原样。 */
  raw: RawRow;
  /** 四个字段全空：视为未使用，忽略。 */
  empty: boolean;
  /** 逐字段的就地错误信息。 */
  errors: FieldErrors;
  /** 字段全部合法时解析出的断言，否则为 null。 */
  assertion: Assertion | null;
}

export interface BatchValidation {
  rows: RowValidation[];
  /** 整批级错误（编号重复、事件/断言数量越界等）。 */
  batchErrors: string[];
  /** 字段合法且不含重复编号的断言集合（仅在 ok 时可用于计算）。 */
  assertions: Assertion[];
  /** 全部校验通过、可以开始计算。 */
  ok: boolean;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function validateRow(row: number, input: RawRow): RowValidation {
  // id、c 裁剪首尾空白后按严格模式校验；u、v 必须完全保持录入原样：
  // 首尾空格也是事件名的一部分，" 靠港 " 与 "靠港" 是两个不同事件，
  // 裁剪会把它们错误合并，甚至拼出录入中不存在的矛盾链。
  const raw: RawRow = {
    id: input.id.trim(),
    u: input.u,
    v: input.v,
    c: input.c.trim(),
  };
  // 全空行与“是否填写”的判定对 u、v 用 trim：纯空白视同未填写，
  // 但一旦含有非空白字符，整个原名（含首尾空格）原样保留。
  const uBlank = raw.u.trim() === '';
  const vBlank = raw.v.trim() === '';
  const empty = raw.id === '' && uBlank && vBlank && raw.c === '';
  const errors: FieldErrors = {};
  let assertion: Assertion | null = null;

  if (!empty) {
    if (raw.id === '') {
      errors.id = '请输入断言编号';
    } else if (!ID_PATTERN.test(raw.id)) {
      errors.id = '编号须匹配 [1-9][0-9]{0,5}（1–999999 的整数，无前导零）';
    }

    if (uBlank) {
      errors.u = '请输入起始事件 u';
    }

    if (vBlank) {
      errors.v = '请输入结束事件 v';
    }

    if (raw.c === '') {
      errors.c = '请输入整数上界 c';
    } else if (!C_PATTERN.test(raw.c)) {
      errors.c = 'c 须为整数（形如 -3、0、42）';
    } else {
      const value = Number(raw.c);
      if (value < C_MIN || value > C_MAX) {
        errors.c = `c 须在 ${C_MIN} 至 ${C_MAX} 之间`;
      }
    }

    if (!hasErrors(errors)) {
      assertion = {
        id: Number.parseInt(raw.id, 10),
        u: raw.u,
        v: raw.v,
        c: Number.parseInt(raw.c, 10),
        row,
      };
    }
  }

  return { row, raw, empty, errors, assertion };
}

/**
 * 校验整批表单行。返回每行的就地错误与整批错误；
 * 只有 ok === true 时 assertions 才可送入求解器。
 */
export function validateBatch(inputs: RawRow[]): BatchValidation {
  const rows = inputs.map((input, i) => validateRow(i + 1, input));
  const batchErrors: string[] = [];
  const nonEmpty = rows.filter((r) => !r.empty);

  if (nonEmpty.length === 0) {
    batchErrors.push('至少需要 1 条断言（当前为 0 条）。');
  }
  if (nonEmpty.length > MAX_ASSERTIONS) {
    batchErrors.push(`断言数量 ${nonEmpty.length} 超过上限 ${MAX_ASSERTIONS} 条。`);
  }

  // 编号整批唯一：按整数数值比较、聚合同一编号的全部行号。
  const rowsById = new Map<number, number[]>();
  for (const r of nonEmpty) {
    if (r.errors.id !== undefined) continue;
    const id = Number.parseInt(r.raw.id, 10);
    const list = rowsById.get(id);
    if (list) list.push(r.row);
    else rowsById.set(id, [r.row]);
  }
  const duplicatedIds = [...rowsById.entries()]
    .filter(([, rowNums]) => rowNums.length > 1)
    .sort((a, b) => a[0] - b[0]);
  for (const [id, rowNums] of duplicatedIds) {
    batchErrors.push(`断言编号 ${id} 重复出现于第 ${rowNums.join('、')} 行。`);
    for (const r of rows) {
      if (r.empty || !rowNums.includes(r.row)) continue;
      const others = rowNums.filter((n) => n !== r.row).join('、');
      r.errors.id = `编号 ${id} 与第 ${others} 行重复（编号须整批唯一）`;
    }
  }

  // 事件数上限：统计字段合法且编号不重复的行所涉及的事件（区分大小写）。
  const usable = nonEmpty.filter((r) => !hasErrors(r.errors) && r.assertion !== null);
  const events = new Set<string>();
  for (const r of usable) {
    events.add(r.assertion!.u);
    events.add(r.assertion!.v);
  }
  if (events.size > MAX_EVENTS) {
    batchErrors.push(`事件数量 ${events.size} 超过上限 ${MAX_EVENTS} 个。`);
  }

  const rowsClean = nonEmpty.every((r) => !hasErrors(r.errors));
  const ok = rowsClean && batchErrors.length === 0 && usable.length >= 1;
  return {
    rows,
    batchErrors,
    assertions: usable.map((r) => r.assertion!),
    ok,
  };
}
