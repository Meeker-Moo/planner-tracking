import { THAI_MONTHS, THAI_MONTHS_FULL } from '../../core/models/status.constant';

/** Builds a yyyy-MM-dd string from a Gregorian year, 0-based month and day. */
export function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/** Today's date in the user's local timezone as yyyy-MM-dd (toISOString would use UTC). */
export function todayIso(): string {
  const d = new Date();
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parses yyyy-MM-dd without going through Date, so no timezone shift. Returns null if invalid. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  return { year: +m[1], month: +m[2] - 1, day: +m[3] };
}

/** True only for a yyyy-MM-dd string that names a day that exists (parseIsoDate alone accepts 2026-13-40). */
export function isRealIsoDate(iso: string): boolean {
  const p = parseIsoDate(iso);
  return !!p && p.month >= 0 && p.month <= 11 && p.day >= 1 && p.day <= daysInMonth(p.year, p.month);
}

/** Number of days in a Gregorian year / 0-based month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The first day of the month a date falls in. Returns the input unchanged if it is not a valid date. */
export function monthStartIso(iso: string): string {
  const p = parseIsoDate(iso);
  return p ? toIsoDate(p.year, p.month, 1) : iso;
}

/** The last day of the month a date falls in. Returns the input unchanged if it is not a valid date. */
export function monthEndIso(iso: string): string {
  const p = parseIsoDate(iso);
  return p ? toIsoDate(p.year, p.month, daysInMonth(p.year, p.month)) : iso;
}

/** Thai long format with Buddhist year, e.g. "19 กันยายน 2569". */
export function formatDateThai(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${p.day} ${THAI_MONTHS_FULL[p.month]} ${p.year + 543}`;
}

/** Month and Buddhist year only, e.g. "ตุลาคม 2568". */
export function formatMonthYearThai(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${THAI_MONTHS_FULL[p.month]} ${p.year + 543}`;
}

/** Short month and two-digit Buddhist year, e.g. "ต.ค. 68". */
export function formatMonthYearShort(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso ?? '';
  return `${THAI_MONTHS[p.month]} ${((p.year + 543) % 100).toString().padStart(2, '0')}`;
}

export function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const buddhistYear = (d.getFullYear() + 543) % 100;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${buddhistYear.toString().padStart(2, '0')}`;
}

// ---------- fiscal year (ปีงบประมาณ) ----------
// 1 October – 30 September, named by the Buddhist year in which it ends:
// October 2568 – September 2569 is fiscal year 2569.

/** The fiscal year (พ.ศ.) a date falls in, or null for an invalid date. */
export function fiscalYearOf(iso: string): number | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  return p.year + (p.month >= 9 ? 1 : 0) + 543;
}

export function currentFiscalYear(): number {
  return fiscalYearOf(todayIso())!;
}

/** The 12 months of a fiscal year in order, October first. `year` is Gregorian, `month` is 0-based. */
export function fiscalMonths(fiscalYear: number): { year: number; month: number }[] {
  const endYear = fiscalYear - 543;
  return Array.from({ length: 12 }, (_, i) => ({ year: i < 3 ? endYear - 1 : endYear, month: (9 + i) % 12 }));
}

/** e.g. "ต.ค. 2568 – ก.ย. 2569" */
export function fiscalYearRangeLabel(fiscalYear: number): string {
  return `${THAI_MONTHS[9]} ${fiscalYear - 1} – ${THAI_MONTHS[8]} ${fiscalYear}`;
}

/**
 * Plans saved before fiscal years existed carry the calendar year of their start date;
 * the fiscal year always follows from the start date, so it is recomputed rather than trusted.
 */
export function withFiscalYear<T extends { year: number; startDate: string }>(plan: T): T {
  const year = fiscalYearOf(plan.startDate);
  return year === null || year === plan.year ? plan : { ...plan, year };
}

/**
 * The first and last month (1-based, counting from October of `firstFiscalYear`) that a date range
 * covers within the fiscal years `firstFiscalYear`…`lastFiscalYear`, clipped to that window; null if
 * the range does not overlap it (or a date is invalid). Within a single fiscal year 1 = October … 12 = September.
 */
export function monthSpanInFiscalYears(
  startDate: string,
  endDate: string,
  firstFiscalYear: number,
  lastFiscalYear: number = firstFiscalYear,
): [number, number] | null {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return null;

  const first = fiscalMonths(firstFiscalYear)[0];
  const firstIndex = first.year * 12 + first.month;
  const lastIndex = firstIndex + (lastFiscalYear - firstFiscalYear + 1) * 12 - 1;
  const from = Math.max(start.year * 12 + start.month, firstIndex);
  const to = Math.min(end.year * 12 + end.month, lastIndex);
  return from > to ? null : [from - firstIndex + 1, to - firstIndex + 1];
}

/**
 * Where a date falls on a monthly axis that starts on 1 October of `firstFiscalYear`, in months:
 * 0 is 1 October, 1.5 is the middle of November, and it is negative before the axis. Null for an invalid date.
 */
export function monthPositionInFiscalYears(iso: string, firstFiscalYear: number): number | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const first = fiscalMonths(firstFiscalYear)[0];
  return p.year * 12 + p.month - (first.year * 12 + first.month) + (p.day - 1) / daysInMonth(p.year, p.month);
}

/** The months of one fiscal year (1 = October … 12 = September) that a date range covers. */
export function monthSpanInFiscalYear(startDate: string, endDate: string, fiscalYear: number): [number, number] | null {
  return monthSpanInFiscalYears(startDate, endDate, fiscalYear, fiscalYear);
}

/**
 * Grid column span (1-based, CSS grid line numbers) for a bar inside a timeline row of consecutive
 * fiscal years where column line 1 is the row's leading edge. Clips the date range to those years;
 * returns null if it does not overlap them at all.
 */
export function monthGridColumn(
  startDate: string,
  endDate: string,
  firstFiscalYear: number,
  lastFiscalYear: number = firstFiscalYear,
): string | null {
  const span = monthSpanInFiscalYears(startDate, endDate, firstFiscalYear, lastFiscalYear);
  return span ? `${span[0] + 1} / ${span[1] + 2}` : null;
}

/** "2569" for a range inside one fiscal year, "2569 – 2570 (คาบเกี่ยว 2 ปีงบ)" when it spans several. */
export function fiscalYearSpanLabel(startDate: string, endDate: string): string {
  const first = fiscalYearOf(startDate);
  const last = fiscalYearOf(endDate);
  if (first === null || last === null) return '';
  return first >= last ? `${first}` : `${first} – ${last} (คาบเกี่ยว ${last - first + 1} ปีงบ)`;
}
