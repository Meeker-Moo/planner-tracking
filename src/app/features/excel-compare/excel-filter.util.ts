import { cellText, CellValue } from './excel-compare.util';

export type FilterOp = 'contains' | 'equals' | 'notContains' | 'notEquals' | 'empty' | 'notEmpty';

export interface FilterOpMeta {
  value: FilterOp;
  label: string;
  /** Whether the condition is tested against a value the user types. */
  needsValue: boolean;
}

export const FILTER_OP_LIST: FilterOpMeta[] = [
  { value: 'contains', label: 'มีคำว่า', needsValue: true },
  { value: 'equals', label: 'เท่ากับ', needsValue: true },
  { value: 'notContains', label: 'ไม่มีคำว่า', needsValue: true },
  { value: 'notEquals', label: 'ไม่เท่ากับ', needsValue: true },
  { value: 'empty', label: 'ว่าง', needsValue: false },
  { value: 'notEmpty', label: 'ไม่ว่าง', needsValue: false },
];

export const FILTER_OP: Record<FilterOp, FilterOpMeta> = Object.fromEntries(FILTER_OP_LIST.map((o) => [o.value, o])) as Record<
  FilterOp,
  FilterOpMeta
>;

/** A condition on one column; text is compared without case and without spaces at the ends. */
export interface ColumnFilter {
  column: number;
  op: FilterOp;
  value: string;
}

export interface SortState {
  column: number;
  dir: 'asc' | 'desc';
}

function norm(text: string): string {
  return text.trim().toLocaleLowerCase();
}

export function matchesFilter(value: CellValue, filter: ColumnFilter): boolean {
  const text = norm(cellText(value));
  const wanted = norm(filter.value);
  switch (filter.op) {
    case 'contains':
      return text.includes(wanted);
    case 'equals':
      return text === wanted;
    case 'notContains':
      return !text.includes(wanted);
    case 'notEquals':
      return text !== wanted;
    case 'empty':
      return text === '';
    case 'notEmpty':
      return text !== '';
  }
}

/** Every filter holds and, when there is a search, at least one cell contains it. */
export function rowMatches(values: CellValue[], search: string, filters: ColumnFilter[]): boolean {
  if (!filters.every((f) => matchesFilter(values[f.column] ?? null, f))) return false;
  const q = norm(search);
  return q === '' || values.some((v) => norm(cellText(v)).includes(q));
}

const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

/** Blank cells last, numbers and dates by value, everything else as text (Thai order, "2" before "10"). */
export function compareCells(a: CellValue, b: CellValue): number {
  const ta = cellText(a);
  const tb = cellText(b);
  if (ta === '' || tb === '') return ta === tb ? 0 : ta === '' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return collator.compare(ta, tb);
}

/** What the result table is narrowed and ordered by. */
export interface RowQuery {
  search: string;
  filters: ColumnFilter[];
  sort: SortState | null;
}

/** The rows a query keeps, in its order. Never sorts `rows` itself. */
export function queryRows<T extends { values: CellValue[] }>(rows: T[], query: RowQuery): T[] {
  const narrowed = query.search.trim() !== '' || query.filters.length > 0;
  const kept = narrowed ? rows.filter((r) => rowMatches(r.values, query.search, query.filters)) : rows;
  const sort = query.sort;
  if (!sort) return kept;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return (narrowed ? kept : kept.slice()).sort((a, b) => compareCells(a.values[sort.column] ?? null, b.values[sort.column] ?? null) * dir);
}

/** A short description of a filter for its chip, e.g. `แผนก มีคำว่า "บัญชี"`. */
export function describeFilter(filter: ColumnFilter, headers: string[]): string {
  const meta = FILTER_OP[filter.op];
  const column = headers[filter.column] ?? '';
  return meta.needsValue ? `${column} ${meta.label} "${filter.value}"` : `${column} ${meta.label}`;
}
