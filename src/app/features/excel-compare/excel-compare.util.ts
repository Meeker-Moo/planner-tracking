/** One cell as read from a workbook: formulas are reduced to their result, rich text to plain text. */
export type CellValue = string | number | boolean | Date | null;

/** A worksheet as it was read, before a header row is chosen. */
export interface SheetData {
  name: string;
  rows: CellValue[][];
}

/** A worksheet cut at its header row: one header per column, every row padded to the same width. */
export interface Table {
  headers: string[];
  rows: CellValue[][];
}

/**
 * How a base cell is tested against a comparison cell: the same text, the base text containing the
 * comparison text, or the base text found inside the comparison text.
 */
export type MatchMode = 'equals' | 'includes' | 'within';

export interface MatchModeMeta {
  value: MatchMode;
  /** Reads between the two column names: "[base column] <label> [comparison column]". */
  label: string;
  hint: string;
}

export const MATCH_MODE_LIST: MatchModeMeta[] = [
  { value: 'equals', label: 'เท่ากับ (=)', hint: 'ค่าต้องตรงกันทั้งหมด' },
  { value: 'includes', label: 'มีค่าของ (include)', hint: 'ค่าในไฟล์ตั้งต้นมีค่าจากไฟล์เปรียบเทียบอยู่ในข้อความ' },
  { value: 'within', label: 'อยู่ในค่าของ (in)', hint: 'ค่าในไฟล์ตั้งต้นอยู่ในข้อความของไฟล์เปรียบเทียบ' },
];

/** A column of the base file matched against a column of the comparison file. */
export interface KeyPair {
  base: number;
  lookup: number;
  mode: MatchMode;
}

export interface CompareOptions {
  /** Every pair must match for a row to match (a composite key when there is more than one). */
  keys: KeyPair[];
  /** Columns of the comparison file whose values are copied into the result. */
  pick: number[];
  ignoreCase: boolean;
  /** Ignore spaces at both ends and collapse runs of spaces inside. */
  trim: boolean;
}

export type MatchStatus = 'found' | 'duplicate' | 'missing' | 'empty';

export interface StatusMeta {
  value: MatchStatus;
  label: string;
  /** Tailwind classes for a badge. */
  badge: string;
  /** Cell fill in the exported workbook. */
  argb: string;
}

export const MATCH_STATUS_LIST: StatusMeta[] = [
  { value: 'found', label: 'พบ', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', argb: 'FFD1FAE5' },
  { value: 'duplicate', label: 'พบหลายรายการ', badge: 'bg-amber-50 text-amber-700 ring-amber-200', argb: 'FFFEF3C7' },
  { value: 'missing', label: 'ไม่พบ', badge: 'bg-red-50 text-red-700 ring-red-200', argb: 'FFFEE2E2' },
  { value: 'empty', label: 'ไม่มีค่า Key', badge: 'bg-slate-100 text-slate-600 ring-slate-200', argb: 'FFF1F5F9' },
];

export const MATCH_STATUS: Record<MatchStatus, StatusMeta> = Object.fromEntries(
  MATCH_STATUS_LIST.map((s) => [s.value, s]),
) as Record<MatchStatus, StatusMeta>;

/** A row as the result table shows it; status is null for rows that were not looked up. */
export interface TableRow {
  values: CellValue[];
  status: MatchStatus | null;
  matches: number;
}

export interface ResultRow extends TableRow {
  /** The base row followed by the picked values of its first match (blank when nothing matched). */
  values: CellValue[];
  status: MatchStatus;
  /** How many rows of the comparison file share this row's key. */
  matches: number;
}

export interface CompareResult {
  headers: string[];
  /** Index of the first column copied from the comparison file. */
  addedFrom: number;
  rows: ResultRow[];
  counts: Record<MatchStatus, number>;
  /** Rows of the comparison file with a key that no base row has. */
  unmatchedLookup: CellValue[][];
}

/** A, B, …, Z, AA, AB, … for a 0-based column index. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** How a cell reads on screen. Excel keeps dates without a zone, so ExcelJS hands them over as UTC. */
export function cellText(value: CellValue): string {
  if (value === null) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const date = `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    return h || m ? `${date} ${pad2(h)}:${pad2(m)}` : date;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function isBlankRow(row: CellValue[]): boolean {
  return row.every((v) => cellText(v).trim() === '');
}

/**
 * Takes row `headerRow` (1-based) as the headers and the rows below it as data, dropping blank rows.
 * Blank headers become "คอลัมน์ X" so every column can be picked.
 */
export function toTable(sheet: SheetData, headerRow: number): Table {
  const headerIndex = Math.max(0, headerRow - 1);
  const headerCells = sheet.rows[headerIndex] ?? [];
  const body = sheet.rows.slice(headerIndex + 1).filter((r) => !isBlankRow(r));
  const width = body.reduce((w, r) => Math.max(w, r.length), headerCells.length);
  const headers = Array.from({ length: width }, (_, i) => cellText(headerCells[i] ?? null).trim() || `คอลัมน์ ${columnLetter(i)}`);
  const rows = body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
  return { headers, rows };
}

/** The text two cells are matched on. */
export function normalizeKey(value: CellValue, options: Pick<CompareOptions, 'ignoreCase' | 'trim'>): string {
  let text = cellText(value);
  if (options.trim) text = text.trim().replace(/\s+/g, ' ');
  if (options.ignoreCase) text = text.toLocaleLowerCase();
  return text;
}

/** The normalized key cells of a row, or null when they are all blank (such a row can never match). */
function keyParts(row: CellValue[], columns: number[], options: CompareOptions): string[] | null {
  const parts = columns.map((c) => normalizeKey(row[c] ?? null, options));
  return parts.every((p) => p === '') ? null : parts;
}

/** Whether a base key cell and a comparison key cell satisfy a pair. Blank never includes or is within anything. */
export function pairMatches(mode: MatchMode, base: string, lookup: string): boolean {
  if (mode === 'equals') return base === lookup;
  if (base === '' || lookup === '') return false;
  return mode === 'includes' ? base.includes(lookup) : lookup.includes(base);
}

/** A header that does not clash with one already in the result. */
function uniqueHeader(header: string, taken: Set<string>): string {
  let name = taken.has(header) ? `${header} (เปรียบเทียบ)` : header;
  for (let n = 2; taken.has(name); n++) name = `${header} (เปรียบเทียบ ${n})`;
  taken.add(name);
  return name;
}

/**
 * Looks up every base row in the comparison file (like VLOOKUP) and appends the picked columns of the
 * first matching row. Rows whose key cells are all blank are marked 'empty' and never matched.
 * The '=' pairs are looked up in an index; 'include' pairs are then tested on the rows it returns
 * (on every comparison row when there is no '=' pair).
 */
export function compareTables(base: Table, lookup: Table, options: CompareOptions): CompareResult {
  const baseCols = options.keys.map((k) => k.base);
  const lookupCols = options.keys.map((k) => k.lookup);
  const exact = options.keys.flatMap((k, i) => (k.mode === 'equals' ? [i] : []));
  const partial = options.keys.flatMap((k, i) => (k.mode === 'equals' ? [] : [i]));
  const exactKey = (parts: string[]) => exact.map((i) => parts[i]).join('\u0000');

  const lookupParts = lookup.rows.map((row) => keyParts(row, lookupCols, options));
  const index = new Map<string, number[]>();
  lookupParts.forEach((parts, i) => {
    if (parts === null) return;
    const key = exactKey(parts);
    const list = index.get(key);
    if (list) list.push(i);
    else index.set(key, [i]);
  });

  const taken = new Set(base.headers);
  const headers = [...base.headers, ...options.pick.map((c) => uniqueHeader(lookup.headers[c] ?? columnLetter(c), taken))];
  const counts: Record<MatchStatus, number> = { found: 0, duplicate: 0, missing: 0, empty: 0 };
  const used = new Set<number>();

  const rows = base.rows.map((row): ResultRow => {
    const parts = keyParts(row, baseCols, options);
    let hits: number[] = [];
    if (parts !== null) {
      const candidates = index.get(exactKey(parts)) ?? [];
      hits = candidates.filter((i) => partial.every((p) => pairMatches(options.keys[p].mode, parts[p], lookupParts[i]![p])));
      hits.forEach((i) => used.add(i));
    }
    const status: MatchStatus = parts === null ? 'empty' : hits.length === 0 ? 'missing' : hits.length === 1 ? 'found' : 'duplicate';
    counts[status]++;
    const first = hits.length ? lookup.rows[hits[0]] : null;
    return {
      values: [...row, ...options.pick.map((c) => (first ? (first[c] ?? null) : null))],
      status,
      matches: hits.length,
    };
  });

  const unmatchedLookup = lookup.rows.filter((_, i) => lookupParts[i] !== null && !used.has(i));

  return { headers, addedFrom: base.headers.length, rows, counts, unmatchedLookup };
}

/**
 * The key to start with: the first base column whose header also names a column of the comparison file,
 * or the first column of each file when no header is shared.
 */
export function suggestKeys(base: Table, lookup: Table): KeyPair[] {
  const normalized = lookup.headers.map((h) => h.trim().toLocaleLowerCase());
  for (let b = 0; b < base.headers.length; b++) {
    const l = normalized.indexOf(base.headers[b].trim().toLocaleLowerCase());
    if (l >= 0) return [{ base: b, lookup: l, mode: 'equals' }];
  }
  return base.headers.length && lookup.headers.length ? [{ base: 0, lookup: 0, mode: 'equals' }] : [];
}
