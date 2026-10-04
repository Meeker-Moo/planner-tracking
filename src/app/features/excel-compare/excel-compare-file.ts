import type { Worksheet } from 'exceljs';
import { type CellObject, type ParsingOptions, read, utils, type WorkBook, write } from 'xlsx';
import { loadExcelJs } from '../../shared/utils/exceljs.util';
import { cellText, CellValue, CompareResult, MATCH_STATUS, SheetData, Table, TableRow } from './excel-compare.util';

/** A file's contents as the parser takes them: text for .csv (so Thai is decoded as UTF-8), bytes otherwise. */
export type SheetSource = ArrayBuffer | string;

const READ_ERROR = 'อ่านไฟล์ไม่ได้ (รองรับไฟล์ .xlsx, .xls และ .csv)';

/** What SheetJS keeps for an error cell is Excel's error code. */
const ERROR_TEXT: Record<number, string> = {
  0x00: '#NULL!',
  0x07: '#DIV/0!',
  0x0f: '#VALUE!',
  0x17: '#REF!',
  0x1d: '#NAME?',
  0x24: '#NUM!',
  0x2a: '#N/A',
  0x2b: '#GETTING_DATA',
};

export function readSource(file: File): Promise<SheetSource> {
  return /\.csv$/i.test(file.name) ? file.text() : file.arrayBuffer();
}

function parse(source: SheetSource, options: ParsingOptions): WorkBook {
  const text = typeof source === 'string';
  try {
    // Text is kept as typed in a .csv so codes such as "00123" keep their leading zeros.
    return read(source, { type: text ? 'string' : 'array', raw: text, UTC: true, ...options });
  } catch {
    throw new Error(READ_ERROR);
  }
}

/** Reduces a cell to a plain value: formulas give their saved result, rich text its text. */
function cellValue(cell: CellObject | undefined): CellValue {
  if (!cell || cell.v === undefined || cell.t === 'z') return null;
  if (cell.t === 'e') return ERROR_TEXT[cell.v as number] ?? '#ERROR';
  return cell.v as CellValue;
}

/** The names of a workbook's sheets, without reading their cells. */
export function readSheetNames(source: SheetSource): string[] {
  const names = parse(source, { bookSheets: true }).SheetNames;
  if (names.length === 0) throw new Error('ไม่พบ Sheet ในไฟล์');
  return names;
}

/**
 * One sheet as values only, from cell A1, every row as wide as the widest. Only this sheet is parsed,
 * so the other sheets of a large workbook cost no memory.
 */
export function readSheet(source: SheetSource, name: string): SheetData {
  const book = parse(source, {
    sheets: [name],
    dense: true,
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    cellStyles: false,
  });
  const data: (CellObject[] | undefined)[] = book.Sheets[name]?.['!data'] ?? [];
  const width = data.reduce((w, row) => Math.max(w, row?.length ?? 0), 0);
  const rows = Array.from(data, (row) => {
    const cells = new Array<CellValue>(width);
    for (let c = 0; c < width; c++) cells[c] = cellValue(row?.[c]);
    return cells;
  });
  return { name, rows };
}

const HEADER_FILL = 'FFF1F5F9';
const ADDED_HEADER_FILL = 'FFDBEAFE';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STATUS_HEADERS = ['สถานะการค้นหา', 'จำนวนที่พบ'];
/**
 * ExcelJS keeps a heavy object per cell and runs out of memory on a few million cells, so a larger
 * export is written by SheetJS instead: the same values, without the header and status colours.
 */
const STYLED_MAX_CELLS = 2_000_000;

/** One sheet of an exported workbook. */
export interface ExportSheet {
  name: string;
  headers: string[];
  rows: TableRow[];
  /** Append the match status and match count of every row. */
  withStatus: boolean;
  /** Headers from this column on are tinted as copied from the comparison file. */
  addedFrom?: number;
  /** Only these columns, in this order (all of them when left out). */
  columns?: number[];
}

/** Column widths that fit the header and the first 500 rows, between 10 and 50 characters. */
function columnWidths(headers: string[], rows: CellValue[][]): number[] {
  return headers.map((h, i) => {
    const longest = rows.slice(0, 500).reduce((w, r) => Math.max(w, cellText(r[i] ?? null).length), h.length);
    return Math.min(50, Math.max(10, longest + 2));
  });
}

function exportColumns(spec: ExportSheet): number[] {
  return spec.columns ?? spec.headers.map((_, i) => i);
}

function exportHeaders(spec: ExportSheet, columns: number[]): string[] {
  return [...columns.map((c) => spec.headers[c]), ...(spec.withStatus ? STATUS_HEADERS : [])];
}

function exportValues(row: TableRow, columns: number[]): CellValue[] {
  return columns.map((c) => row.values[c] ?? null);
}

function withStatus(spec: ExportSheet, row: TableRow, values: CellValue[]): CellValue[] {
  return spec.withStatus && row.status ? [...values, MATCH_STATUS[row.status].label, row.matches] : values;
}

function addSheet(workbook: import('exceljs').Workbook, spec: ExportSheet): void {
  const sheet = workbook.addWorksheet(spec.name);
  const columns = exportColumns(spec);
  const headers = exportHeaders(spec, columns);
  sheet.addRow(headers);

  const bodies = spec.rows.map((row) => {
    const values = exportValues(row, columns);
    const added = sheet.addRow(withStatus(spec, row, values));
    if (spec.withStatus && row.status) {
      added.getCell(columns.length + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MATCH_STATUS[row.status].argb } };
    }
    return values;
  });

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell, col) => {
    const source = columns[col - 1];
    const tinted = spec.addedFrom !== undefined && source !== undefined && source >= spec.addedFrom;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tinted ? ADDED_HEADER_FILL : HEADER_FILL } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  columnWidths(headers, bodies).forEach((w, i) => (sheet.getColumn(i + 1).width = w));
}

function plainWorkbook(sheets: ExportSheet[]): Blob {
  const book = utils.book_new();
  for (const spec of sheets) {
    const columns = exportColumns(spec);
    const headers = exportHeaders(spec, columns);
    const rows = [headers, ...spec.rows.map((row) => withStatus(spec, row, exportValues(row, columns)))];
    const widths = columnWidths(headers, rows.slice(1, 501));
    const sheet = utils.aoa_to_sheet(rows, { dense: true, cellDates: true, UTC: true });
    // The sheet has its own cells now; let the row copies go before the file is written.
    rows.length = 0;
    sheet['!autofilter'] = { ref: utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    utils.book_append_sheet(book, sheet, spec.name);
  }
  // 'buffer' gives bytes straight from the zip writer (a Uint8Array in a browser); 'array' would first
  // build the whole file as one string, which fails on a large export.
  const bytes: Uint8Array<ArrayBuffer> = write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
  return new Blob([bytes], { type: XLSX_TYPE });
}

export async function buildWorkbook(sheets: ExportSheet[]): Promise<Blob> {
  const cells = sheets.reduce((n, s) => n + s.rows.length * (exportColumns(s).length + (s.withStatus ? STATUS_HEADERS.length : 0)), 0);
  if (cells > STYLED_MAX_CELLS) return plainWorkbook(sheets);
  const { Workbook } = await loadExcelJs();
  const workbook = new Workbook();
  sheets.forEach((s) => addSheet(workbook, s));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_TYPE });
}

/**
 * The full result: the base rows with the copied columns and a match status, and the comparison rows
 * that matched no base row (left out when there are none).
 */
export function resultSheets(result: CompareResult, lookup: Pick<Table, 'headers'>): ExportSheet[] {
  const sheets: ExportSheet[] = [
    { name: 'ผลการเปรียบเทียบ', headers: result.headers, rows: result.rows, withStatus: true, addedFrom: result.addedFrom },
  ];
  if (result.unmatchedLookup.length) {
    sheets.push({
      name: 'ไม่พบในไฟล์ตั้งต้น',
      headers: lookup.headers,
      rows: result.unmatchedLookup.map((values) => ({ values, status: null, matches: 0 })),
      withStatus: false,
    });
  }
  return sheets;
}
