import { utils, write } from 'xlsx';
import { readSheet, readSheetNames } from './excel-compare-file';
import { CompareOptions } from './excel-compare.util';
import { ExcelSession } from './excel-session';

function xlsx(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) utils.book_append_sheet(book, utils.aoa_to_sheet(rows, { cellDates: true, UTC: true }), name);
  return write(book, { type: 'array', bookType: 'xlsx' });
}

function file(data: ArrayBuffer | string, name: string): File {
  return new File([data], name);
}

const book = xlsx({
  พนักงาน: [['รายงานพนักงาน'], ['รหัส', 'ชื่อ', 'วันเริ่มงาน'], ['A01', 'สมชาย', new Date(Date.UTC(2024, 2, 5))], [], ['A02', 'สมหญิง', null]],
  แผนก: [
    ['รหัส', 'แผนก'],
    ['A01', 'บัญชี'],
    ['A03', 'ไอที'],
  ],
  ว่าง: [],
});

describe('reading a workbook', () => {
  it('lists the sheets without reading them', () => {
    expect(readSheetNames(book)).toEqual(['พนักงาน', 'แผนก', 'ว่าง']);
  });

  it('reads one sheet as plain values, every row as wide as the widest', () => {
    const sheet = readSheet(book, 'พนักงาน');
    expect(sheet.name).toBe('พนักงาน');
    expect(sheet.rows[0]).toEqual(['รายงานพนักงาน', null, null]);
    expect(sheet.rows[2][0]).toBe('A01');
    expect((sheet.rows[2][2] as Date).toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(sheet.rows[3]).toEqual([null, null, null]);
  });

  it('turns error cells into their Excel text', () => {
    const ws = utils.aoa_to_sheet([['x']]);
    ws['B1'] = { t: 'e', v: 0x2a };
    ws['!ref'] = 'A1:B1';
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'S');
    expect(readSheet(write(wb, { type: 'array', bookType: 'xlsx' }), 'S').rows[0]).toEqual(['x', '#N/A']);
  });

  it('keeps .csv text as typed', () => {
    const sheet = readSheet('รหัส,ชื่อ\n00123,สมชาย\n', readSheetNames('รหัส,ชื่อ\n00123,สมชาย\n')[0]);
    expect(sheet.rows).toEqual([
      ['รหัส', 'ชื่อ'],
      ['00123', 'สมชาย'],
    ]);
  });

  it('says so when the file is not a spreadsheet', () => {
    expect(() => readSheetNames(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer)).toThrowError(/อ่านไฟล์ไม่ได้/);
  });
});

describe('ExcelSession', () => {
  const options: CompareOptions = {
    keys: [{ base: 0, lookup: 0, mode: 'equals' }],
    pick: [1],
    trim: true,
    ignoreCase: true,
  };

  it('opens the first sheet with row 1 as the header row', async () => {
    const session = new ExcelSession();
    const opened = await session.open('base', file(book, 'staff.xlsx'));
    expect(opened.sheetNames).toEqual(['พนักงาน', 'แผนก', 'ว่าง']);
    expect(opened.sheet.headers).toEqual(['รายงานพนักงาน', 'คอลัมน์ B', 'คอลัมน์ C']);
    expect(opened.sheet.preview.length).toBe(5);
  });

  it('moves the header row without reading the file again, and drops blank rows', async () => {
    const session = new ExcelSession();
    await session.open('base', file(book, 'staff.xlsx'));
    const info = await session.selectSheet('base', 0, 2);
    expect(info.headers).toEqual(['รหัส', 'ชื่อ', 'วันเริ่มงาน']);
    expect(info.rowCount).toBe(2);
    expect(info.samples).toEqual(['A01, A02', 'สมชาย, สมหญิง', '2024-03-05']);
  });

  it('compares the chosen sheets and exports the result', async () => {
    const session = new ExcelSession();
    await session.open('base', file(book, 'staff.xlsx'));
    await session.selectSheet('base', 0, 2);
    await session.open('lookup', file(book, 'dept.xlsx'));
    const info = await session.selectSheet('lookup', 1, 1);
    expect(info.headers).toEqual(['รหัส', 'แผนก']);

    const result = session.compare(options);
    expect(result.rows.map((r) => [r.values[0], r.values[3], r.status])).toEqual([
      ['A01', 'บัญชี', 'found'],
      ['A02', null, 'missing'],
    ]);
    expect(result.unmatchedLookup).toEqual([['A03', 'ไอที']]);

    const all = await session.export({ kind: 'all' });
    expect(readSheetNames(await all.arrayBuffer())).toEqual(['ผลการเปรียบเทียบ', 'ไม่พบในไฟล์ตั้งต้น']);
    const filtered = await session.export({
      kind: 'filtered',
      view: 'all',
      query: { search: 'สมหญิง', filters: [], sort: null },
      columns: [0, 3],
    });
    expect(readSheet(await filtered.arrayBuffer(), 'ข้อมูลที่กรอง').rows).toEqual([
      ['รหัส', 'แผนก', 'สถานะการค้นหา', 'จำนวนที่พบ'],
      ['A02', null, 'ไม่พบ', 0],
    ]);
  });

  it('swaps the two files', async () => {
    const session = new ExcelSession();
    await session.open('base', file(book, 'a.xlsx'));
    await session.open('lookup', file(xlsx({ S: [['k'], ['1']] }), 'b.xlsx'));
    session.swap();
    expect((await session.selectSheet('base', 0, 1)).headers).toEqual(['k']);
  });

  it('refuses to compare before both files are read', async () => {
    const session = new ExcelSession();
    await session.open('base', file(book, 'a.xlsx'));
    expect(() => session.compare(options)).toThrowError('ยังไม่ได้นำเข้าไฟล์');
  });
});
