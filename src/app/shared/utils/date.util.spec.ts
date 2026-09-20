import {
  currentFiscalYear,
  fiscalMonths,
  fiscalYearOf,
  fiscalYearSpanLabel,
  fiscalYearRangeLabel,
  formatDateThai,
  formatMonthYearShort,
  formatMonthYearThai,
  isRealIsoDate,
  monthEndIso,
  monthGridColumn,
  monthPositionInFiscalYears,
  monthSpanInFiscalYear,
  monthSpanInFiscalYears,
  monthStartIso,
  parseIsoDate,
  toIsoDate,
  withFiscalYear,
} from './date.util';

describe('fiscalYearOf', () => {
  it('starts a new fiscal year on 1 October, named by the Buddhist year it ends', () => {
    expect(fiscalYearOf('2025-10-01')).toBe(2569);
    expect(fiscalYearOf('2026-09-30')).toBe(2569);
    expect(fiscalYearOf('2026-10-01')).toBe(2570);
    expect(fiscalYearOf('2026-01-15')).toBe(2569);
  });

  it('is null for an invalid date', () => {
    expect(fiscalYearOf('')).toBeNull();
    expect(fiscalYearOf('nope')).toBeNull();
  });

  it('has a current fiscal year', () => {
    expect(currentFiscalYear()).toBeGreaterThan(2500);
  });
});

describe('fiscalMonths', () => {
  it('lists October of the previous year through September', () => {
    const months = fiscalMonths(2569);
    expect(months[0]).toEqual({ year: 2025, month: 9 });
    expect(months[2]).toEqual({ year: 2025, month: 11 });
    expect(months[3]).toEqual({ year: 2026, month: 0 });
    expect(months[11]).toEqual({ year: 2026, month: 8 });
  });

  it('labels the range', () => {
    expect(fiscalYearRangeLabel(2569)).toBe('ต.ค. 2568 – ก.ย. 2569');
  });
});

describe('withFiscalYear', () => {
  it('replaces a calendar year saved by older versions', () => {
    expect(withFiscalYear({ year: 2026, startDate: '2025-11-05' }).year).toBe(2569);
    expect(withFiscalYear({ year: 2026, startDate: '2026-03-05' }).year).toBe(2569);
  });

  it('keeps plans that already match, and ones with an unreadable start date', () => {
    const ok = { year: 2569, startDate: '2026-03-05' };
    expect(withFiscalYear(ok)).toBe(ok);
    const bad = { year: 2026, startDate: '' };
    expect(withFiscalYear(bad)).toBe(bad);
  });
});

describe('monthSpanInFiscalYear', () => {
  it('numbers months from October = 1 to September = 12', () => {
    expect(monthSpanInFiscalYear('2025-10-01', '2025-12-31', 2569)).toEqual([1, 3]);
    expect(monthSpanInFiscalYear('2026-01-05', '2026-09-30', 2569)).toEqual([4, 12]);
  });

  it('clips a range that starts before or ends after the fiscal year', () => {
    expect(monthSpanInFiscalYear('2025-06-01', '2025-11-30', 2569)).toEqual([1, 2]);
    expect(monthSpanInFiscalYear('2026-08-01', '2026-12-31', 2569)).toEqual([11, 12]);
    expect(monthSpanInFiscalYear('2024-01-01', '2028-12-31', 2569)).toEqual([1, 12]);
  });

  it('returns null when the range misses the fiscal year or a date is invalid', () => {
    expect(monthSpanInFiscalYear('2025-01-01', '2025-09-30', 2569)).toBeNull();
    expect(monthSpanInFiscalYear('2026-10-01', '2027-03-31', 2569)).toBeNull();
    expect(monthSpanInFiscalYear('', '2026-01-01', 2569)).toBeNull();
    expect(monthSpanInFiscalYear('2026-06-01', '2026-05-01', 2569)).toBeNull();
  });
});

describe('monthSpanInFiscalYears', () => {
  it('numbers months continuously across consecutive fiscal years', () => {
    // FY 2569 = Oct 2025 – Sep 2026, FY 2570 = Oct 2026 – Sep 2027
    expect(monthSpanInFiscalYears('2026-08-01', '2026-12-31', 2569, 2570)).toEqual([11, 15]);
    expect(monthSpanInFiscalYears('2025-10-01', '2027-09-30', 2569, 2570)).toEqual([1, 24]);
  });

  it('spans three fiscal years and clips outside the window', () => {
    expect(monthSpanInFiscalYears('2025-10-01', '2028-09-30', 2569, 2571)).toEqual([1, 36]);
    expect(monthSpanInFiscalYears('2024-01-01', '2028-12-31', 2569, 2570)).toEqual([1, 24]);
    expect(monthSpanInFiscalYears('2028-01-01', '2028-12-31', 2569, 2570)).toBeNull();
  });
});

describe('monthPositionInFiscalYears', () => {
  it('counts months from 1 October of the first fiscal year, with the day as a fraction', () => {
    expect(monthPositionInFiscalYears('2025-10-01', 2569)).toBe(0);
    expect(monthPositionInFiscalYears('2025-11-16', 2569)).toBeCloseTo(1.5, 5);
    expect(monthPositionInFiscalYears('2026-01-01', 2569)).toBe(3);
    expect(monthPositionInFiscalYears('2026-10-01', 2569)).toBe(12);
  });

  it('is negative before the axis starts, and null for an invalid date', () => {
    expect(monthPositionInFiscalYears('2025-09-16', 2569)).toBeCloseTo(-0.5, 5);
    expect(monthPositionInFiscalYears('', 2569)).toBeNull();
  });
});

describe('fiscalYearSpanLabel', () => {
  it('names one fiscal year or the span of them', () => {
    expect(fiscalYearSpanLabel('2025-11-01', '2026-03-31')).toBe('2569');
    expect(fiscalYearSpanLabel('2026-08-01', '2027-03-31')).toBe('2569 – 2570 (คาบเกี่ยว 2 ปีงบ)');
    expect(fiscalYearSpanLabel('2025-10-01', '2028-09-30')).toBe('2569 – 2571 (คาบเกี่ยว 3 ปีงบ)');
    expect(fiscalYearSpanLabel('', '2027-12-31')).toBe('');
  });
});

describe('monthGridColumn', () => {
  it('maps the month span to CSS grid lines (column 1 is the name column)', () => {
    expect(monthGridColumn('2025-10-05', '2025-10-20', 2569)).toBe('2 / 3');
    expect(monthGridColumn('2025-12-10', '2026-02-02', 2569)).toBe('4 / 7');
    expect(monthGridColumn('2024-01-01', '2028-12-31', 2569)).toBe('2 / 14');
    expect(monthGridColumn('2027-01-01', '2027-02-01', 2569)).toBeNull();
    // a window of two fiscal years: the bar can run past September of the first
    expect(monthGridColumn('2026-08-01', '2026-12-31', 2569, 2570)).toBe('12 / 17');
  });
});

describe('isRealIsoDate', () => {
  it('accepts days that exist, including 29 February in a leap year', () => {
    expect(isRealIsoDate('2026-09-30')).toBe(true);
    expect(isRealIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects days that do not exist and text that is not a date', () => {
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('2026-09-31')).toBe(false);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
    expect(isRealIsoDate('2026-00-10')).toBe(false);
    expect(isRealIsoDate('2026-9-1')).toBe(false);
    expect(isRealIsoDate('')).toBe(false);
  });
});

describe('date helpers', () => {
  it('round-trips and formats with a Buddhist year', () => {
    expect(toIsoDate(2026, 8, 19)).toBe('2026-09-19');
    expect(parseIsoDate('2026-09-19')).toEqual({ year: 2026, month: 8, day: 19 });
    expect(formatDateThai('2026-09-19')).toBe('19 กันยายน 2569');
    expect(formatMonthYearThai('2025-10-17')).toBe('ตุลาคม 2568');
    expect(formatMonthYearShort('2025-10-17')).toBe('ต.ค. 68');
  });

  it('snaps a date to the first and last day of its month', () => {
    expect(monthStartIso('2026-02-17')).toBe('2026-02-01');
    expect(monthEndIso('2026-02-17')).toBe('2026-02-28');
    expect(monthEndIso('2028-02-01')).toBe('2028-02-29');
    expect(monthEndIso('2026-12-05')).toBe('2026-12-31');
    expect(monthStartIso('')).toBe('');
  });
});
