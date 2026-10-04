import { buildWorkbook, readSheet, readSheetNames, readSource, resultSheets } from './excel-compare-file';
import {
  cellText,
  CellValue,
  CompareOptions,
  CompareResult,
  compareTables,
  ResultView,
  SheetData,
  Table,
  toTable,
  viewOf,
} from './excel-compare.util';
import { queryRows, RowQuery } from './excel-filter.util';

export type Side = 'base' | 'lookup';

/** The file preview always shows at least this many rows, and a few below the header row. */
const MIN_PREVIEW_ROWS = 6;
const SAMPLE_COUNT = 3;
/**
 * Without an '=' pair every base row is tested against every comparison row; past this many tests the
 * comparison would run for minutes, so it is refused.
 */
const MAX_PAIRWISE_TESTS = 50_000_000;

/** What the page needs to show one file's chosen sheet; the rows themselves stay in the worker. */
export interface SheetInfo {
  headers: string[];
  rowCount: number;
  /** The first rows of the sheet as they are in the file, header row included. */
  preview: CellValue[][];
  /** A few distinct values of each column, joined for display. */
  samples: string[];
}

export interface OpenedFile {
  sheetNames: string[];
  sheet: SheetInfo;
}

export type ExportRequest =
  | { kind: 'all' }
  /** The rows the result table shows for a tab and query, with only the visible columns. */
  | { kind: 'filtered'; view: ResultView; query: RowQuery; columns: number[] };

interface SideState {
  file: File;
  sheetNames: string[];
  sheetIndex: number;
  headerRow: number;
  sheet: SheetData;
  table: Table;
}

/** A few distinct values of every column, read in one pass that stops once each column has enough. */
function columnSamples(table: Table): string[] {
  const seen = table.headers.map(() => new Set<string>());
  let open = seen.length;
  for (const row of table.rows) {
    if (open === 0) break;
    for (let c = 0; c < seen.length; c++) {
      if (seen[c].size >= SAMPLE_COUNT) continue;
      const text = cellText(row[c] ?? null).trim();
      if (text && !seen[c].has(text)) {
        seen[c].add(text);
        if (seen[c].size === SAMPLE_COUNT) open--;
      }
    }
  }
  return seen.map((s) => (s.size ? [...s].join(', ') : '(ว่าง)'));
}

/**
 * Holds both files and the last comparison, so the page never keeps whole sheets itself. Runs inside
 * the Excel worker (see excel.worker.ts); every public method is callable through ExcelWorkerClient.
 */
export class ExcelSession {
  private sides: Partial<Record<Side, SideState>> = {};
  private result: CompareResult | null = null;

  /** Reads a file's sheet names and its first sheet, with row 1 as the header row. */
  async open(side: Side, file: File): Promise<OpenedFile> {
    // Let go of the file being replaced before the new one is parsed.
    delete this.sides[side];
    this.result = null;
    const source = await readSource(file);
    const sheetNames = readSheetNames(source);
    const sheet = this.keep(side, {
      file,
      sheetNames,
      sheetIndex: 0,
      headerRow: 1,
      sheet: readSheet(source, sheetNames[0]),
    });
    return { sheetNames, sheet };
  }

  /** Switches to another sheet and/or header row; the file is parsed again only for another sheet. */
  async selectSheet(side: Side, sheetIndex: number, headerRow: number): Promise<SheetInfo> {
    this.result = null;
    const { file, sheetNames, sheetIndex: current, sheet } = this.side(side);
    if (sheetIndex === current) return this.keep(side, { file, sheetNames, sheetIndex, headerRow, sheet });
    // Drop the current sheet first, so two large sheets are never held at once.
    delete this.sides[side];
    const source = await readSource(file);
    return this.keep(side, {
      file,
      sheetNames,
      sheetIndex,
      headerRow,
      sheet: readSheet(source, sheetNames[sheetIndex]),
    });
  }

  swap(): void {
    this.sides = { base: this.sides.lookup, lookup: this.sides.base };
    this.result = null;
  }

  clear(): void {
    this.sides = {};
    this.result = null;
  }

  compare(options: CompareOptions): CompareResult {
    const base = this.side('base').table;
    const lookup = this.side('lookup').table;
    const tests = base.rows.length * lookup.rows.length;
    if (!options.keys.some((k) => k.mode === 'equals') && tests > MAX_PAIRWISE_TESTS) {
      throw new Error(
        `ข้อมูลมีมากเกินกว่าจะเทียบทีละแถวได้ (${base.rows.length.toLocaleString()} × ${lookup.rows.length.toLocaleString()} แถว) ` +
          'กรุณาใช้เงื่อนไขแบบ "เท่ากับ (=)" อย่างน้อย 1 คู่',
      );
    }
    this.result = null;
    this.result = compareTables(base, lookup, options);
    return this.result;
  }

  /** An .xlsx of the last comparison. */
  async export(request: ExportRequest): Promise<Blob> {
    const result = this.result;
    if (!result) throw new Error('ยังไม่มีผลการเปรียบเทียบ');
    const lookup = this.side('lookup').table;
    if (request.kind === 'all') return buildWorkbook(resultSheets(result, lookup));
    const data = viewOf(result, lookup.headers, request.view);
    return buildWorkbook([
      {
        name: 'ข้อมูลที่กรอง',
        headers: data.headers,
        rows: queryRows(data.rows, request.query),
        withStatus: data.withStatus,
        addedFrom: data.addedFrom,
        columns: request.columns,
      },
    ]);
  }

  private side(side: Side): SideState {
    const state = this.sides[side];
    if (!state) throw new Error('ยังไม่ได้นำเข้าไฟล์');
    return state;
  }

  private keep(side: Side, state: Omit<SideState, 'table'>): SheetInfo {
    const full: SideState = { ...state, table: toTable(state.sheet, state.headerRow) };
    this.sides[side] = full;
    return this.info(full);
  }

  private info(state: SideState): SheetInfo {
    return {
      headers: state.table.headers,
      rowCount: state.table.rows.length,
      preview: state.sheet.rows.slice(0, Math.max(MIN_PREVIEW_ROWS, state.headerRow + 3)),
      samples: columnSamples(state.table),
    };
  }
}

/** The names of ExcelSession's methods, which are what the worker can be asked to run. */
export type SessionMethod = {
  [K in keyof ExcelSession]: ExcelSession[K] extends (...args: never[]) => unknown ? K : never;
}[keyof ExcelSession];

export interface WorkerRequest<M extends SessionMethod = SessionMethod> {
  id: number;
  method: M;
  args: Parameters<ExcelSession[M]>;
}

export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
