import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { cellText, CellValue, columnLetter } from './excel-compare.util';

/** How many columns of the sheet the small preview shows. */
const PREVIEW_COLUMNS = 8;

/**
 * Picks one .xlsx, .xls or .csv file (button or drag-and-drop), then which sheet to use. A preview of the sheet's
 * first rows shows which row is taken as the headers; clicking another row makes that one the header row.
 */
@Component({
  selector: 'app-excel-file-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-white rounded-2xl ring-1 shadow-sm p-4 flex flex-col gap-3 h-full" [class]="fileName() ? 'ring-slate-200' : 'ring-blue-200'">
      <div class="flex items-center gap-2">
        <span
          class="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center"
          [class]="fileName() ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'"
        >
          @if (fileName()) {
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true">
              <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          } @else {
            {{ step() }}
          }
        </span>
        <div class="grow min-w-0">
          <h2 class="text-sm font-bold text-slate-900">{{ title() }}</h2>
          <p class="text-xs text-slate-500">{{ hint() }}</p>
        </div>
      </div>

      @if (!fileName() || loading()) {
        <div
          class="grow rounded-xl border-2 border-dashed px-4 py-8 flex flex-col items-center justify-center gap-3 text-center transition-colors"
          [class]="dragging() ? 'border-blue-400 bg-blue-50/70' : 'border-slate-200 bg-slate-50/60'"
          (dragover)="$event.preventDefault(); dragging.set(true)"
          (dragleave)="dragging.set(false)"
          (drop)="onDrop($event)"
        >
          @if (loading()) {
            <div class="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-600 animate-spin" aria-hidden="true"></div>
            <span class="text-sm font-semibold text-slate-500">กำลังอ่านไฟล์…</span>
            @if (loadingHint()) {
              <span class="text-xs text-slate-400">{{ loadingHint() }}</span>
            }
          } @else {
            <div class="w-12 h-12 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center text-emerald-600 shadow-sm">
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="text-sm text-slate-600">ลากไฟล์ <b>.xlsx</b>, <b>.xls</b> หรือ <b>.csv</b> มาวางที่นี่</div>
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700"
              (click)="fileInput.click()"
            >
              เลือกไฟล์ Excel
            </button>
          }
        </div>
      } @else {
        <div
          class="flex items-center gap-3 rounded-xl bg-emerald-50/60 ring-1 ring-emerald-100 px-3 py-2.5"
          [class.ring-blue-400]="dragging()"
          (dragover)="$event.preventDefault(); dragging.set(true)"
          (dragleave)="dragging.set(false)"
          (drop)="onDrop($event)"
        >
          <svg viewBox="0 0 20 20" class="w-6 h-6 shrink-0 text-emerald-600" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M5 2.5h7l3.5 3.5v11a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-13.5a1 1 0 011-1z" stroke-linejoin="round" />
            <path d="M7 10l3 4M10 10l-3 4" stroke-linecap="round" />
          </svg>
          <div class="grow min-w-0">
            <div class="text-sm font-semibold text-slate-800 truncate" [title]="fileName()">{{ fileName() }}</div>
            <div class="text-xs text-slate-500 tabular-nums">{{ rowCount() }} แถวข้อมูล · {{ columnCount() }} คอลัมน์</div>
          </div>
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="fileInput.click()"
          >
            เปลี่ยนไฟล์
          </button>
        </div>

        @if (sheetNames().length > 1) {
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-600 shrink-0">Sheet</span>
            <div class="flex gap-1 overflow-x-auto">
              @for (s of sheetNames(); track $index) {
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
                  [class]="$index === sheetIndex() ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                  (click)="sheetChange.emit($index)"
                >
                  {{ s }}
                </button>
              }
            </div>
          </div>
        }

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2 text-xs">
            <span class="font-semibold text-slate-600 grow">ตัวอย่างข้อมูล</span>
            <span class="text-slate-500">แถวหัวตาราง</span>
            <input
              type="number"
              min="1"
              aria-label="แถวหัวตาราง"
              class="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-500 tabular-nums"
              [value]="headerRow()"
              (change)="onHeaderRow($event)"
            />
          </div>
          <div class="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table class="min-w-full text-[11px]">
              <thead>
                <tr class="bg-slate-50 text-slate-400">
                  <th class="w-8 px-1.5 py-1 font-semibold border-r border-slate-200"></th>
                  @for (c of previewColumns(); track c) {
                    <th class="px-2 py-1 font-semibold text-left">{{ letter(c) }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of previewRows(); track $index; let r = $index) {
                  <tr
                    class="cursor-pointer border-t border-slate-100"
                    [class]="r + 1 === headerRow() ? 'bg-blue-600 text-white font-semibold' : r + 1 < headerRow() ? 'text-slate-300 hover:bg-slate-50' : 'text-slate-600 hover:bg-blue-50'"
                    [title]="r + 1 === headerRow() ? 'แถวหัวตาราง' : 'กดเพื่อใช้แถวนี้เป็นหัวตาราง'"
                    (click)="headerRowChange.emit(r + 1)"
                  >
                    <td class="px-1.5 py-1 text-center tabular-nums border-r" [class]="r + 1 === headerRow() ? 'border-blue-500' : 'border-slate-200 text-slate-400'">
                      {{ r + 1 }}
                    </td>
                    @for (c of previewColumns(); track c) {
                      <td class="px-2 py-1 max-w-28 truncate whitespace-nowrap">{{ text(row[c]) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-slate-400">กดที่แถวในตัวอย่างเพื่อเลือกเป็นหัวตาราง (แถวสีน้ำเงิน)</p>
        </div>
      }

      <input
        #fileInput
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        class="hidden"
        (change)="onFileSelected($event)"
      />
    </section>
  `,
})
export class ExcelFileCard {
  step = input.required<number>();
  title = input.required<string>();
  hint = input('');
  fileName = input<string | null>(null);
  sheetNames = input<string[]>([]);
  sheetIndex = input(0);
  headerRow = input(1);
  rowCount = input(0);
  columnCount = input(0);
  loading = input(false);
  /** Shown under the spinner, e.g. that a large file takes a while. */
  loadingHint = input('');
  /** The first rows of the chosen sheet as they are in the file, header row included. */
  previewRows = input<CellValue[][]>([]);

  fileChange = output<File>();
  sheetChange = output<number>();
  headerRowChange = output<number>();

  dragging = signal(false);

  previewColumns(): number[] {
    const width = this.previewRows().reduce((w, r) => Math.max(w, r.length), 0);
    return Array.from({ length: Math.min(width, PREVIEW_COLUMNS) }, (_, i) => i);
  }

  letter(index: number): string {
    return columnLetter(index);
  }

  text(value: CellValue | undefined): string {
    return cellText(value ?? null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.fileChange.emit(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.fileChange.emit(file);
  }

  onHeaderRow(event: Event): void {
    const input = event.target as HTMLInputElement;
    const row = Math.max(1, Math.floor(+input.value || 1));
    input.value = String(row);
    this.headerRowChange.emit(row);
  }
}
