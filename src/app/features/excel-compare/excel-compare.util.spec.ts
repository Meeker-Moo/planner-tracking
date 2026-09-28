import { cellText, columnLetter, compareTables, CompareOptions, normalizeKey, pairMatches, suggestKeys, Table, toTable } from './excel-compare.util';

const base: Table = {
  headers: ['รหัส', 'ชื่อ'],
  rows: [
    ['A01', 'สมชาย'],
    [' a02 ', 'สมหญิง'],
    ['A03', 'สมศักดิ์'],
    [null, 'ไม่มีรหัส'],
  ],
};

const lookup: Table = {
  headers: ['รหัส', 'แผนก', 'ชื่อ'],
  rows: [
    ['A01', 'บัญชี', 'x'],
    ['A02', 'บุคคล', 'y'],
    ['A03', 'ไอที', 'z1'],
    ['A03', 'การตลาด', 'z2'],
    ['A99', 'จัดซื้อ', 'w'],
  ],
};

const options: CompareOptions = { keys: [{ base: 0, lookup: 0, mode: 'equals' }], pick: [1, 2], trim: true, ignoreCase: true };

describe('excel compare', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('shows dates as UTC days, with the time only when there is one', () => {
    expect(cellText(new Date(Date.UTC(2026, 8, 28)))).toBe('2026-09-28');
    expect(cellText(new Date(Date.UTC(2026, 8, 28, 9, 5)))).toBe('2026-09-28 09:05');
    expect(cellText(12)).toBe('12');
    expect(cellText(null)).toBe('');
  });

  it('cuts a sheet at the header row, names blank headers and drops blank rows', () => {
    const table = toTable(
      {
        name: 'S',
        rows: [['รายงาน'], ['รหัส', null, 'ค่า'], ['A', 1], [null, ''], ['B', 2, 3, 'extra']],
      },
      2,
    );
    expect(table.headers).toEqual(['รหัส', 'คอลัมน์ B', 'ค่า', 'คอลัมน์ D']);
    expect(table.rows).toEqual([
      ['A', 1, null, null],
      ['B', 2, 3, 'extra'],
    ]);
  });

  it('matches numbers against text and honours the trim / case options', () => {
    expect(normalizeKey(12, options)).toBe(normalizeKey('12', options));
    expect(normalizeKey('  Ab   c ', options)).toBe('ab c');
    expect(normalizeKey(' Ab ', { trim: false, ignoreCase: false })).toBe(' Ab ');
  });

  it('copies the picked columns of the first match and marks every row', () => {
    const r = compareTables(base, lookup, options);
    expect(r.headers).toEqual(['รหัส', 'ชื่อ', 'แผนก', 'ชื่อ (เปรียบเทียบ)']);
    expect(r.addedFrom).toBe(2);
    expect(r.rows.map((row) => [row.status, row.matches, ...row.values.slice(2)])).toEqual([
      ['found', 1, 'บัญชี', 'x'],
      ['found', 1, 'บุคคล', 'y'],
      ['duplicate', 2, 'ไอที', 'z1'],
      ['empty', 0, null, null],
    ]);
    expect(r.counts).toEqual({ found: 2, duplicate: 1, missing: 0, empty: 1 });
    expect(r.unmatchedLookup).toEqual([['A99', 'จัดซื้อ', 'w']]);
  });

  it('misses rows that differ only in case or spaces when those options are off', () => {
    const r = compareTables(base, lookup, { ...options, trim: false, ignoreCase: false });
    expect(r.rows[1].status).toBe('missing');
    expect(r.counts.missing).toBe(1);
  });

  it('needs every key pair to match', () => {
    const keys: CompareOptions['keys'] = [
      { base: 0, lookup: 0, mode: 'equals' },
      { base: 1, lookup: 2, mode: 'equals' },
    ];
    const r = compareTables(base, lookup, { ...options, keys, pick: [1] });
    expect(r.rows.every((row) => row.status === 'missing' || row.status === 'empty')).toBe(true);
  });

  it('tests include / in and never lets a blank side match', () => {
    expect(pairMatches('includes', 'บริษัท abc จำกัด', 'abc')).toBe(true);
    expect(pairMatches('includes', 'abc', 'บริษัท abc จำกัด')).toBe(false);
    expect(pairMatches('within', 'abc', 'บริษัท abc จำกัด')).toBe(true);
    expect(pairMatches('includes', 'abc', '')).toBe(false);
    expect(pairMatches('within', '', 'abc')).toBe(false);
    expect(pairMatches('equals', '', '')).toBe(true);
  });

  it('matches rows whose base text includes the comparison text', () => {
    const companies: Table = {
      headers: ['ลูกค้า'],
      rows: [['บริษัท ABC จำกัด'], ['ร้าน XYZ'], ['ABC และ DEF'], ['อื่นๆ']],
    };
    const words: Table = {
      headers: ['คำค้น', 'กลุ่ม'],
      rows: [['abc', 'กลุ่ม 1'], ['def', 'กลุ่ม 2'], ['xyz', 'กลุ่ม 3'], ['qqq', 'กลุ่ม 4']],
    };
    const r = compareTables(companies, words, { ...options, keys: [{ base: 0, lookup: 0, mode: 'includes' }], pick: [1] });
    expect(r.rows.map((row) => [row.status, row.matches, row.values[1]])).toEqual([
      ['found', 1, 'กลุ่ม 1'],
      ['found', 1, 'กลุ่ม 3'],
      ['duplicate', 2, 'กลุ่ม 1'],
      ['missing', 0, null],
    ]);
    expect(r.unmatchedLookup).toEqual([['qqq', 'กลุ่ม 4']]);
  });

  it('combines an exact pair with an include pair', () => {
    const orders: Table = { headers: ['สาขา', 'รายการ'], rows: [['BKK', 'ค่าไฟฟ้า มี.ค.'], ['CNX', 'ค่าไฟฟ้า มี.ค.']] };
    const rules: Table = { headers: ['สาขา', 'คำ', 'บัญชี'], rows: [['BKK', 'ไฟฟ้า', '5101'], ['CNX', 'น้ำประปา', '5102']] };
    const keys: CompareOptions['keys'] = [
      { base: 0, lookup: 0, mode: 'equals' },
      { base: 1, lookup: 1, mode: 'includes' },
    ];
    const r = compareTables(orders, rules, { ...options, keys, pick: [2] });
    expect(r.rows.map((row) => [row.status, row.values[2]])).toEqual([
      ['found', '5101'],
      ['missing', null],
    ]);
  });

  it('suggests a key from a shared header, else the first columns', () => {
    expect(suggestKeys(base, lookup)).toEqual([{ base: 0, lookup: 0, mode: 'equals' }]);
    expect(suggestKeys({ headers: ['x', 'ชื่อ'], rows: [] }, lookup)).toEqual([{ base: 1, lookup: 2, mode: 'equals' }]);
    expect(suggestKeys({ headers: ['x'], rows: [] }, { headers: ['y'], rows: [] })).toEqual([{ base: 0, lookup: 0, mode: 'equals' }]);
  });
});
