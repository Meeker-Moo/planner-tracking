import type { Worksheet } from 'exceljs';
import { loadExcelJs } from '../../shared/utils/exceljs.util';
import { cellText, CellValue, CompareResult, MATCH_STATUS, SheetData, Table, TableRow } from './excel-compare.util';

/** Reduces what ExcelJS keeps in a cell (formulas, rich text, hyperlinks, errors) to a plain value. */
function plainValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v['richText'])) return (v['richText'] as { text?: string }[]).map((r) => r.text ?? '').join('');
    if ('result' in v) return plainValue(v['result']);
    if ('formula' in v || 'sharedFormula' in v) return null;
    if ('text' in v) return plainValue(v['text']);
    if ('error' in v) return String(v['error']);
  }
  return String(value);
}

/** Every worksheet of an .xlsx file, as values only. Throws an Error with a Thai message when the file cannot be read. */
export async function readWorkbook(data: ArrayBuffer): Promise<SheetData[]> {
  const { Workbook } = await loadExcelJs();
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new Error('อ่านไฟล์ไม่ได้ (รองรับเฉพาะไฟล์ .xlsx)');
  }
  const sheets = workbook.worksheets.map((sheet) => {
    const rows: CellValue[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: CellValue[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(plainValue(row.getCell(c).value));
      rows.push(cells);
    }
    return { name: sheet.name, rows };
  });
  if (sheets.length === 0) throw new Error('ไม่พบ Sheet ในไฟล์');
  return sheets;
}

const HEADER_FILL = 'FFF1F5F9';
const ADDED_HEADER_FILL = 'FFDBEAFE';

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

function fitWidths(sheet: Worksheet, headers: string[], rows: CellValue[][]): void {
  headers.forEach((h, i) => {
    const longest = rows.slice(0, 500).reduce((w, r) => Math.max(w, cellText(r[i] ?? null).length), h.length);
    sheet.getColumn(i + 1).width = Math.min(50, Math.max(10, longest + 2));
  });
}

function addSheet(workbook: import('exceljs').Workbook, spec: ExportSheet): void {
  const sheet = workbook.addWorksheet(spec.name);
  const columns = spec.columns ?? spec.headers.map((_, i) => i);
  const headers = [...columns.map((c) => spec.headers[c]), ...(spec.withStatus ? ['สถานะการค้นหา', 'จำนวนที่พบ'] : [])];
  sheet.addRow(headers);

  const bodies = spec.rows.map((row) => {
    const values: CellValue[] = columns.map((c) => row.values[c] ?? null);
    const added = sheet.addRow(spec.withStatus && row.status ? [...values, MATCH_STATUS[row.status].label, row.matches] : values);
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
  fitWidths(sheet, headers, bodies);
}

export async function buildWorkbook(sheets: ExportSheet[]): Promise<Blob> {
  const { Workbook } = await loadExcelJs();
  const workbook = new Workbook();
  sheets.forEach((s) => addSheet(workbook, s));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * The full result: the base rows with the copied columns and a match status, and the comparison rows
 * that matched no base row (left out when there are none).
 */
export function resultSheets(result: CompareResult, lookup: Table): ExportSheet[] {
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
