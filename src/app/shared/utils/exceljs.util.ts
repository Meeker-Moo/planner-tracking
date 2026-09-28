export type ExcelJs = typeof import('exceljs');

// ExcelJS is large, so it is fetched only when a page reads or writes a workbook.
export async function loadExcelJs(): Promise<ExcelJs> {
  const mod = await import('exceljs');
  return (mod as { default?: ExcelJs }).default ?? mod;
}
