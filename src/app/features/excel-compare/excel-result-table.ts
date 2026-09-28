import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { cellText, CellValue, MATCH_STATUS, MatchStatus, TableRow } from './excel-compare.util';
import {
  ColumnFilter,
  compareCells,
  describeFilter,
  FILTER_OP,
  FILTER_OP_LIST,
  FilterOp,
  rowMatches,
  SortState,
} from './excel-filter.util';

const PAGE_SIZES = [25, 50, 100, 500];
/** How many distinct values of a column the filter box suggests. */
const MAX_SUGGESTIONS = 100;

export interface FilteredExport {
  rows: TableRow[];
  /** The columns left visible, in order. */
  columns: number[];
}

/**
 * The compared rows with search, per-column filters, sorting, hidden columns and pages. Anything
 * projected into it (such as status tabs) is shown above the toolbar.
 */
@Component({
  selector: 'app-excel-result-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm">
      <ng-content />

      <div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <label class="relative grow min-w-48 max-w-md">
          <svg viewBox="0 0 20 20" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" stroke-linecap="round" />
          </svg>
          <input
            type="search"
            placeholder="ค้นหาในทุกคอลัมน์…"
            aria-label="ค้นหาในทุกคอลัมน์"
            class="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            [value]="search()"
            (input)="search.set($any($event.target).value); page.set(0)"
          />
        </label>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ring-1 text-sm font-semibold"
          [class]="draft() ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'"
          (click)="draft() ? draft.set(null) : openDraft(visibleColumns()[0] ?? 0)"
        >
          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M3 4.5h14l-5.5 6.5v5l-3 1.5v-6.5L3 4.5z" stroke-linejoin="round" />
          </svg>
          เพิ่มตัวกรอง
        </button>

        <div class="relative" #columnsRoot>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ring-1 ring-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            [attr.aria-expanded]="columnsOpen()"
            (click)="columnsOpen.set(!columnsOpen())"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="4" width="14" height="12" rx="2" />
              <path d="M8 4v12M12.5 4v12" />
            </svg>
            คอลัมน์
            @if (hidden().size) {
              <span class="px-1.5 rounded-md bg-slate-900 text-white text-[11px] tabular-nums">{{ visibleColumns().length }}/{{ headers().length }}</span>
            }
          </button>
          @if (columnsOpen()) {
            <div class="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2">
              <div class="flex gap-2 px-2 pb-2 mb-1 border-b border-slate-100 text-xs font-semibold">
                <button type="button" class="text-blue-600 hover:text-blue-700" (click)="showAllColumns()">แสดงทั้งหมด</button>
                @if (addedFrom() < headers().length) {
                  <button type="button" class="text-blue-600 hover:text-blue-700" (click)="showOnlyAdded()">เฉพาะคอลัมน์ที่ดึงมา</button>
                }
              </div>
              @for (h of headers(); track $index) {
                <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="!hidden().has($index)" (change)="toggleColumn($index)" />
                  <span class="truncate" [class.text-blue-700]="isAdded($index)">{{ h }}</span>
                </label>
              }
            </div>
          }
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ring-1 ring-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          [disabled]="filtered().length === 0"
          title="ส่งออกเฉพาะแถวและคอลัมน์ที่แสดงอยู่ตามตัวกรอง"
          (click)="exportFiltered.emit({ rows: filtered(), columns: visibleColumns() })"
        >
          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M10 3v10M6 9l4 4 4-4M4 13v2.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V13" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          ส่งออกที่แสดง ({{ filtered().length }})
        </button>
      </div>

      @if (draft(); as d) {
        <div class="px-4 py-3 border-b border-slate-100 bg-blue-50/40 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-slate-700">กรอง</span>
          <select
            aria-label="คอลัมน์ที่จะกรอง"
            class="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 max-w-60"
            (change)="patchDraft({ column: +$any($event.target).value })"
          >
            @for (h of headers(); track $index) {
              <option [value]="$index" [selected]="$index === d.column">{{ h }}</option>
            }
          </select>
          <select
            aria-label="เงื่อนไข"
            class="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
            (change)="patchDraft({ op: $any($event.target).value })"
          >
            @for (o of ops; track o.value) {
              <option [value]="o.value" [selected]="o.value === d.op">{{ o.label }}</option>
            }
          </select>
          @if (needsValue(d.op)) {
            <input
              #draftValue
              type="text"
              list="excel-filter-values"
              placeholder="พิมพ์หรือเลือกค่า"
              aria-label="ค่าที่ใช้กรอง"
              class="grow min-w-40 max-w-xs border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              [value]="d.value"
              (input)="patchDraft({ value: $any($event.target).value })"
              (keydown.enter)="applyDraft()"
            />
            <datalist id="excel-filter-values">
              @for (v of suggestions(); track v) {
                <option [value]="v"></option>
              }
            </datalist>
          }
          <button
            type="button"
            class="px-3.5 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            [disabled]="needsValue(d.op) && !d.value.trim()"
            (click)="applyDraft()"
          >
            ใช้ตัวกรอง
          </button>
          <button type="button" class="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700" (click)="draft.set(null)">ยกเลิก</button>
        </div>
      }

      @if (filters().length || search().trim()) {
        <div class="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          @for (f of filters(); track $index) {
            <span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-blue-50 ring-1 ring-blue-200 text-xs font-semibold text-blue-800">
              {{ describe(f) }}
              <button
                type="button"
                class="w-5 h-5 rounded-md flex items-center justify-center hover:bg-blue-100"
                [attr.aria-label]="'ลบตัวกรอง ' + describe(f)"
                (click)="removeFilter($index)"
              >
                <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
                </svg>
              </button>
            </span>
          }
          @if (search().trim()) {
            <span class="inline-flex items-center pl-2.5 pr-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">ค้นหา "{{ search().trim() }}"</span>
          }
          <button type="button" class="text-xs font-semibold text-red-600 hover:text-red-700 ml-1" (click)="clearFilters()">ล้างตัวกรองทั้งหมด</button>
          <span class="ml-auto text-xs text-slate-500 tabular-nums">พบ {{ filtered().length }} จาก {{ rows().length }} แถว</span>
        </div>
      }

      <div class="overflow-auto max-h-[62vh]">
        <table class="min-w-full text-sm">
          <thead class="sticky top-0 z-10">
            <tr>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-slate-400 bg-slate-50 border-b border-slate-200 w-12">#</th>
              @if (withStatus()) {
                <th class="px-3 py-2.5 text-left text-xs font-bold text-slate-500 bg-slate-50 border-b border-slate-200 whitespace-nowrap">สถานะ</th>
              }
              @for (c of visibleColumns(); track c) {
                <th
                  class="px-1 py-1 text-left text-xs font-bold border-b whitespace-nowrap"
                  [class]="isAdded(c) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'"
                  [attr.aria-sort]="sort()?.column === c ? (sort()!.dir === 'asc' ? 'ascending' : 'descending') : null"
                >
                  <div class="flex items-center">
                    <button
                      type="button"
                      class="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/80"
                      [title]="'เรียงตาม ' + headers()[c]"
                      (click)="toggleSort(c)"
                    >
                      {{ headers()[c] }}
                      <span class="text-[10px] w-2.5" [class.opacity-30]="sort()?.column !== c">
                        {{ sort()?.column === c && sort()!.dir === 'desc' ? '▼' : '▲' }}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/80"
                      [class]="hasFilter(c) ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'"
                      [attr.aria-label]="'กรองคอลัมน์ ' + headers()[c]"
                      title="กรองคอลัมน์นี้"
                      (click)="openDraft(c)"
                    >
                      <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" [attr.fill]="hasFilter(c) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M3 4.5h14l-5.5 6.5v5l-3 1.5v-6.5L3 4.5z" stroke-linejoin="round" />
                      </svg>
                    </button>
                  </div>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of pageRows(); track $index) {
              <tr class="border-b border-slate-100 hover:bg-amber-50/40">
                <td class="px-3 py-1.5 text-xs text-slate-400 tabular-nums">{{ pageStart() + $index + 1 }}</td>
                @if (withStatus()) {
                  <td class="px-3 py-1.5 whitespace-nowrap">
                    @if (row.status; as st) {
                      <span class="px-1.5 py-0.5 rounded-md text-xs font-semibold ring-1" [class]="statusBadge(st)">
                        {{ statusLabel(st) }}@if (st === 'duplicate') { ({{ row.matches }}) }
                      </span>
                    }
                  </td>
                }
                @for (c of visibleColumns(); track c) {
                  <td
                    class="px-3 py-1.5 whitespace-nowrap max-w-xs truncate"
                    [class]="isAdded(c) ? (row.status === 'found' || row.status === 'duplicate' ? 'bg-blue-50/50 text-slate-900' : 'bg-blue-50/30') : 'text-slate-700'"
                    [title]="text(row.values[c])"
                  >
                    {{ text(row.values[c]) }}
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="visibleColumns().length + 2" class="px-3 py-12 text-center">
                  <div class="text-sm font-semibold text-slate-500">ไม่มีแถวที่ตรงกับตัวกรอง</div>
                  @if (filters().length || search().trim()) {
                    <button type="button" class="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-700" (click)="clearFilters()">ล้างตัวกรอง</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span class="tabular-nums">
          @if (filtered().length) {
            แถว {{ pageStart() + 1 }}–{{ pageStart() + pageRows().length }} จาก {{ filtered().length }}
          } @else {
            0 แถว
          }
        </span>
        <label class="flex items-center gap-1.5 ml-auto">
          แสดงหน้าละ
          <select class="border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none" (change)="pageSize.set(+$any($event.target).value); page.set(0)">
            @for (s of pageSizes; track s) {
              <option [value]="s" [selected]="s === pageSize()">{{ s }}</option>
            }
          </select>
        </label>
        <div class="flex items-center gap-1">
          <button
            type="button"
            aria-label="หน้าก่อนหน้า"
            class="w-8 h-8 rounded-lg ring-1 ring-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            [disabled]="currentPage() === 0"
            (click)="page.set(currentPage() - 1)"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12.5 4.5L7 10l5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="px-2 font-semibold text-slate-700 tabular-nums">{{ currentPage() + 1 }} / {{ pageCount() }}</span>
          <button
            type="button"
            aria-label="หน้าถัดไป"
            class="w-8 h-8 rounded-lg ring-1 ring-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            [disabled]="currentPage() >= pageCount() - 1"
            (click)="page.set(currentPage() + 1)"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7.5 4.5L13 10l-5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  `,
})
export class ExcelResultTable {
  headers = input.required<string[]>();
  rows = input.required<TableRow[]>();
  /** Columns from this index on were copied from the comparison file. */
  addedFrom = input(Infinity);
  withStatus = input(true);

  exportFiltered = output<FilteredExport>();

  readonly ops = FILTER_OP_LIST;
  readonly pageSizes = PAGE_SIZES;

  search = signal('');
  filters = signal<ColumnFilter[]>([]);
  draft = signal<ColumnFilter | null>(null);
  sort = signal<SortState | null>(null);
  hidden = signal<Set<number>>(new Set());
  columnsOpen = signal(false);
  page = signal(0);
  pageSize = signal(50);

  private readonly columnsRoot = viewChild<ElementRef<HTMLElement>>('columnsRoot');
  private readonly draftValue = viewChild<ElementRef<HTMLInputElement>>('draftValue');

  /** Changes only when the columns themselves change, not when the same columns get new rows. */
  private readonly shape = computed(() => this.headers().join('\u0001'));

  constructor() {
    // Filters, sort and hidden columns refer to columns by index, so they cannot outlive the columns.
    effect(() => {
      this.shape();
      untracked(() => {
        this.filters.set([]);
        this.draft.set(null);
        this.sort.set(null);
        this.hidden.set(new Set());
        this.search.set('');
      });
    });
    effect(() => {
      this.rows();
      untracked(() => this.page.set(0));
    });
    // Put the cursor in the value box whenever the filter form opens or its column changes.
    effect(() => {
      this.draft()?.column;
      this.draftValue()?.nativeElement.focus();
    });
  }

  visibleColumns = computed(() => this.headers().flatMap((_, i) => (this.hidden().has(i) ? [] : [i])));

  filtered = computed(() => {
    const search = this.search();
    const filters = this.filters();
    const rows = this.rows().filter((r) => rowMatches(r.values, search, filters));
    const sort = this.sort();
    if (!sort) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => compareCells(a.values[sort.column] ?? null, b.values[sort.column] ?? null) * dir);
  });

  pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  pageStart = computed(() => this.currentPage() * this.pageSize());
  pageRows = computed(() => this.filtered().slice(this.pageStart(), this.pageStart() + this.pageSize()));

  /** Distinct values of the column being filtered, most common first, for the value box to suggest. */
  suggestions = computed(() => {
    const column = this.draft()?.column;
    if (column === undefined) return [];
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      const text = cellText(row.values[column] ?? null).trim();
      if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SUGGESTIONS)
      .map(([text]) => text);
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const root = this.columnsRoot()?.nativeElement;
    if (root && !root.contains(event.target as Node)) this.columnsOpen.set(false);
  }

  isAdded(column: number): boolean {
    return column >= this.addedFrom();
  }

  hasFilter(column: number): boolean {
    return this.filters().some((f) => f.column === column);
  }

  text(value: CellValue | undefined): string {
    return cellText(value ?? null);
  }

  statusLabel(status: MatchStatus): string {
    return MATCH_STATUS[status].label;
  }

  statusBadge(status: MatchStatus): string {
    return MATCH_STATUS[status].badge;
  }

  needsValue(op: FilterOp): boolean {
    return FILTER_OP[op].needsValue;
  }

  describe(filter: ColumnFilter): string {
    return describeFilter(filter, this.headers());
  }

  toggleSort(column: number): void {
    const s = this.sort();
    if (s?.column !== column) this.sort.set({ column, dir: 'asc' });
    else if (s.dir === 'asc') this.sort.set({ column, dir: 'desc' });
    else this.sort.set(null);
  }

  toggleColumn(column: number): void {
    this.hidden.update((h) => {
      const next = new Set(h);
      if (next.has(column)) next.delete(column);
      // Keep at least one column on screen.
      else if (next.size < this.headers().length - 1) next.add(column);
      return next;
    });
  }

  showAllColumns(): void {
    this.hidden.set(new Set());
  }

  /** Hide the base file's columns except the first, which usually names the row. */
  showOnlyAdded(): void {
    const from = this.addedFrom();
    this.hidden.set(new Set(this.headers().flatMap((_, i) => (i > 0 && i < from ? [i] : []))));
  }

  openDraft(column: number): void {
    this.columnsOpen.set(false);
    this.draft.set({ column, op: 'contains', value: '' });
  }

  patchDraft(patch: Partial<ColumnFilter>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  applyDraft(): void {
    const d = this.draft();
    if (!d || (this.needsValue(d.op) && !d.value.trim())) return;
    this.filters.update((f) => [...f, { ...d, value: this.needsValue(d.op) ? d.value.trim() : '' }]);
    this.draft.set(null);
    this.page.set(0);
  }

  removeFilter(index: number): void {
    this.filters.update((f) => f.filter((_, i) => i !== index));
    this.page.set(0);
  }

  clearFilters(): void {
    this.filters.set([]);
    this.search.set('');
    this.page.set(0);
  }
}
