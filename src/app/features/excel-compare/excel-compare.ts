import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { downloadBlob } from '../../shared/utils/file.util';
import { todayIso } from '../../shared/utils/date.util';
import {
  columnLetter,
  CompareOptions,
  CompareResult,
  KeyPair,
  MATCH_MODE_LIST,
  MATCH_STATUS_LIST,
  MatchMode,
  MatchStatus,
  ResultView,
  suggestKeys,
  viewOf,
} from './excel-compare.util';
import { ExcelFileCard } from './excel-file-card';
import { ExcelResultTable, FilteredExport } from './excel-result-table';
import { ExportRequest, SheetInfo, Side } from './excel-session';
import { ExcelWorkerClient, WorkerCrashedError } from './excel-worker.client';

const MB = 1024 * 1024;
/** Reading a file above this size takes long enough to say so. */
const LARGE_FILE_BYTES = 30 * MB;
/** Above this size the browser is likely to run out of memory, so the file is refused. */
const MAX_FILE_BYTES = 150 * MB;
/** A change to the key or picked columns waits this long, so a few quick changes run one comparison. */
const COMPARE_DELAY_MS = 300;

const STATUS_DOT: Record<MatchStatus, string> = {
  found: 'bg-emerald-500',
  duplicate: 'bg-amber-500',
  missing: 'bg-red-500',
  empty: 'bg-slate-400',
};

/** A file the worker has read; its rows stay in the worker. */
interface LoadedFile {
  name: string;
  sheetNames: string[];
}

interface Step {
  label: string;
  done: boolean;
}

function megabytes(bytes: number): string {
  return (bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Compare two Excel files like VLOOKUP: every row of the base file is looked up in the comparison file
 * by the chosen key column(s), and the chosen columns of the matching row are copied next to it.
 */
@Component({
  selector: 'app-excel-compare',
  standalone: true,
  imports: [Toolbar, ExcelFileCard, ExcelResultTable],
  providers: [ExcelWorkerClient],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar [showActions]="false" [showYear]="false" />

    <div class="grow overflow-auto p-4 md:p-8">
      <div class="max-w-7xl mx-auto flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-3 grow">
            <div
              class="w-11 h-11 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/25"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
                <path d="M3.5 9h17M3.5 14.5h17M10 4v16" />
              </svg>
            </div>
            <div>
              <h1 class="text-xl font-bold text-slate-900">Excel Compare</h1>
              <p class="text-sm text-slate-500">ค้นหาข้อมูลจากอีกไฟล์มาเติมในไฟล์ของคุณ เหมือน VLOOKUP แต่ไม่ต้องเขียนสูตร</p>
            </div>
          </div>
          @if (base() || lookup()) {
            <button
              type="button"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
              (click)="resetAll()"
            >
              <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 10a6 6 0 106-6H6.5M6.5 4L9 1.5M6.5 4L9 6.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              เริ่มใหม่
            </button>
          }
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            [disabled]="!result() || exporting() || comparing()"
            (click)="exportAll()"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M10 3v10M6 9l4 4 4-4M4 13v2.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V13" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ exporting() ? 'กำลังสร้างไฟล์…' : 'ส่งออกผลลัพธ์ทั้งหมด' }}
          </button>
        </div>

        <ol class="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="ขั้นตอน">
          @for (s of steps(); track $index) {
            <li
              class="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 text-sm"
              [class]="
                s.done
                  ? 'bg-emerald-50 ring-emerald-200 text-emerald-800'
                  : $index === currentStep()
                    ? 'bg-blue-50 ring-blue-300 text-blue-800 font-semibold'
                    : 'bg-white ring-slate-200 text-slate-400'
              "
              [attr.aria-current]="$index === currentStep() ? 'step' : null"
            >
              <span
                class="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                [class]="s.done ? 'bg-emerald-500 text-white' : $index === currentStep() ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'"
              >
                @if (s.done) {
                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.8" aria-hidden="true">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                } @else {
                  {{ $index + 1 }}
                }
              </span>
              <span class="truncate">{{ s.label }}</span>
            </li>
          }
        </ol>

        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
          <app-excel-file-card
            [step]="1"
            title="ไฟล์ตั้งต้น"
            hint="ไฟล์ของคุณ ทุกแถวจะอยู่ในผลลัพธ์"
            [fileName]="base()?.name ?? null"
            [sheetNames]="base()?.sheetNames ?? []"
            [sheetIndex]="baseSheet()"
            [headerRow]="baseHeaderRow()"
            [rowCount]="baseInfo()?.rowCount ?? 0"
            [columnCount]="baseInfo()?.headers?.length ?? 0"
            [previewRows]="baseInfo()?.preview ?? []"
            [loading]="loading()['base'] !== undefined"
            [loadingHint]="loading()['base'] ?? ''"
            (fileChange)="load('base', $event)"
            (sheetChange)="setSheet('base', $event)"
            (headerRowChange)="setHeaderRow('base', $event)"
          />
          <div class="flex md:flex-col items-center justify-center">
            <button
              type="button"
              class="w-10 h-10 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-blue-600 hover:ring-blue-300 disabled:opacity-30"
              title="สลับไฟล์ตั้งต้นกับไฟล์เปรียบเทียบ"
              aria-label="สลับไฟล์ตั้งต้นกับไฟล์เปรียบเทียบ"
              [disabled]="(!base() && !lookup()) || busy()"
              (click)="swap()"
            >
              <svg viewBox="0 0 20 20" class="w-5 h-5 rotate-90 md:rotate-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 7h12M13 4l3 3-3 3M16 13H4M7 10l-3 3 3 3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <app-excel-file-card
            [step]="2"
            title="ไฟล์ที่ใช้เปรียบเทียบ"
            hint="ไฟล์ที่มีข้อมูลที่ต้องการดึงมาใส่"
            [fileName]="lookup()?.name ?? null"
            [sheetNames]="lookup()?.sheetNames ?? []"
            [sheetIndex]="lookupSheet()"
            [headerRow]="lookupHeaderRow()"
            [rowCount]="lookupInfo()?.rowCount ?? 0"
            [columnCount]="lookupInfo()?.headers?.length ?? 0"
            [previewRows]="lookupInfo()?.preview ?? []"
            [loading]="loading()['lookup'] !== undefined"
            [loadingHint]="loading()['lookup'] ?? ''"
            (fileChange)="load('lookup', $event)"
            (sheetChange)="setSheet('lookup', $event)"
            (headerRowChange)="setHeaderRow('lookup', $event)"
          />
        </div>

        @if (baseInfo() && lookupInfo()) {
          @let bt = baseInfo()!;
          @let lt = lookupInfo()!;
          <section class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-5">
            <div class="flex flex-wrap items-start gap-3">
              <div class="flex items-center gap-2 grow">
                <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <h2 class="text-sm font-bold text-slate-900">กำหนดการค้นหา</h2>
                  <p class="text-xs text-slate-500">เลือกคอลัมน์ที่ใช้จับคู่แถวของสองไฟล์ แล้วเลือกข้อมูลที่จะดึงมาใส่</p>
                </div>
              </div>
              @if (comparing()) {
                <div class="flex items-center gap-2 text-xs font-semibold text-slate-500" role="status">
                  <div class="w-4 h-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" aria-hidden="true"></div>
                  กำลังเปรียบเทียบ…
                </div>
              }
              @if (result(); as r) {
                <div class="w-full sm:w-64">
                  <div class="flex items-baseline justify-between text-xs">
                    <span class="font-semibold text-slate-600">จับคู่ได้</span>
                    <span class="font-bold tabular-nums" [class]="matchRate() >= 80 ? 'text-emerald-600' : matchRate() >= 40 ? 'text-amber-600' : 'text-red-600'">
                      {{ matchedCount() }} / {{ r.rows.length }} แถว ({{ matchRate() }}%)
                    </span>
                  </div>
                  <div class="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      [class]="matchRate() >= 80 ? 'bg-emerald-500' : matchRate() >= 40 ? 'bg-amber-500' : 'bg-red-500'"
                      [style.width.%]="matchRate()"
                    ></div>
                  </div>
                </div>
              }
            </div>

            @if (compareError(); as e) {
              <p class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2" role="alert">{{ e }}</p>
            }

            <div class="flex flex-col gap-2">
              <div class="text-sm font-semibold text-slate-700">ก. จับคู่แถวด้วยคอลัมน์ (Key)</div>
              <div class="hidden md:grid grid-cols-[1fr_11rem_1fr_2.25rem] gap-2 px-1 text-xs font-semibold text-slate-500">
                <span>คอลัมน์ในไฟล์ตั้งต้น</span>
                <span>เงื่อนไข</span>
                <span>คอลัมน์ในไฟล์เปรียบเทียบ</span>
                <span></span>
              </div>
              @for (k of keys(); track $index; let i = $index) {
                <div class="grid grid-cols-1 md:grid-cols-[1fr_11rem_1fr_2.25rem] gap-2 items-start rounded-xl bg-slate-50 ring-1 ring-slate-200 p-2">
                  <div class="flex flex-col gap-1 min-w-0">
                    <select
                      class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      [attr.aria-label]="'คอลัมน์ Key ในไฟล์ตั้งต้น คู่ที่ ' + (i + 1)"
                      (change)="setKey(i, 'base', +$any($event.target).value)"
                    >
                      @for (h of bt.headers; track $index) {
                        <option [value]="$index" [selected]="$index === k.base">{{ columnLabel($index, h) }}</option>
                      }
                    </select>
                    <span class="px-1 text-[11px] text-slate-400 truncate">ตัวอย่าง: {{ bt.samples[k.base] }}</span>
                  </div>
                  <select
                    class="w-full border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10"
                    [class]="k.mode === 'equals' ? 'bg-white text-slate-700 border-slate-200' : 'bg-violet-50 text-violet-700 border-violet-200'"
                    [attr.aria-label]="'เงื่อนไขของคู่ที่ ' + (i + 1)"
                    [title]="modeHint(k.mode)"
                    (change)="setMode(i, $any($event.target).value)"
                  >
                    @for (m of modes; track m.value) {
                      <option [value]="m.value" [selected]="m.value === k.mode">{{ m.label }}</option>
                    }
                  </select>
                  <div class="flex flex-col gap-1 min-w-0">
                    <select
                      class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      [attr.aria-label]="'คอลัมน์ Key ในไฟล์เปรียบเทียบ คู่ที่ ' + (i + 1)"
                      (change)="setKey(i, 'lookup', +$any($event.target).value)"
                    >
                      @for (h of lt.headers; track $index) {
                        <option [value]="$index" [selected]="$index === k.lookup">{{ columnLabel($index, h) }}</option>
                      }
                    </select>
                    <span class="px-1 text-[11px] text-slate-400 truncate">ตัวอย่าง: {{ lt.samples[k.lookup] }}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="ลบคู่ Key นี้"
                    class="w-9 h-9 justify-self-end rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    [disabled]="keys().length === 1"
                    (click)="removeKey(i)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>
              }
              <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                <button type="button" class="text-sm font-semibold text-blue-600 hover:text-blue-700" (click)="addKey()">+ เพิ่มเงื่อนไขจับคู่</button>
                <label class="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="trim()" (change)="trim.set($any($event.target).checked)" />
                  ไม่สนใจช่องว่างหน้า/หลัง
                </label>
                <label class="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="ignoreCase()" (change)="ignoreCase.set($any($event.target).checked)" />
                  ไม่สนใจตัวพิมพ์เล็ก/ใหญ่
                </label>
              </div>
              <details class="text-xs text-slate-500">
                <summary class="cursor-pointer font-semibold text-slate-600 w-fit">เงื่อนไขแต่ละแบบต่างกันอย่างไร?</summary>
                <ul class="mt-1.5 ml-4 list-disc flex flex-col gap-0.5">
                  <li><b>เท่ากับ (=)</b> ค่าต้องตรงกันทั้งหมด เช่น "A01" = "A01"</li>
                  <li><b>มีค่าของ (include)</b> ค่าในไฟล์ตั้งต้นมีค่าจากไฟล์เปรียบเทียบอยู่ เช่น "บริษัท ABC จำกัด" มี "ABC"</li>
                  <li><b>อยู่ในค่าของ (in)</b> กลับด้านกัน เช่น "ABC" อยู่ใน "บริษัท ABC จำกัด"</li>
                  <li>ถ้ามีหลายเงื่อนไข แถวจะจับคู่กันเมื่อ<b>ทุกเงื่อนไข</b>เป็นจริง</li>
                </ul>
              </details>
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap items-baseline gap-x-3">
                <span class="text-sm font-semibold text-slate-700">ข. ข้อมูลที่จะดึงจากไฟล์เปรียบเทียบมาใส่</span>
                <span class="text-xs text-slate-400 tabular-nums">เลือกแล้ว {{ pick().length }} คอลัมน์</span>
                <button type="button" class="text-xs font-semibold text-blue-600 hover:text-blue-700" (click)="pickAll()">เลือกทั้งหมด</button>
                <button type="button" class="text-xs font-semibold text-slate-500 hover:text-slate-700" (click)="pick.set([])">ล้าง</button>
              </div>
              <div class="flex flex-wrap gap-2">
                @for (h of lt.headers; track $index) {
                  <button
                    type="button"
                    role="checkbox"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ring-1 transition"
                    [class]="isPicked($index) ? 'bg-blue-600 text-white ring-blue-600 shadow-sm shadow-blue-600/30' : 'bg-white text-slate-600 ring-slate-200 hover:ring-blue-300 hover:text-blue-700'"
                    [attr.aria-checked]="isPicked($index)"
                    (click)="togglePick($index)"
                  >
                    @if (isPicked($index)) {
                      <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.8" aria-hidden="true">
                        <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    } @else {
                      <span class="text-slate-400">+</span>
                    }
                    {{ h }}
                  </button>
                }
              </div>
              @if (pick().length === 0) {
                <p class="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2 w-fit">
                  ยังไม่ได้เลือกคอลัมน์ ผลลัพธ์จะบอกได้เพียงว่าพบหรือไม่พบ — กดที่ชื่อคอลัมน์ด้านบนเพื่อดึงข้อมูลมาใส่
                </p>
              }
            </div>
          </section>
        }

        @if (tableData(); as t) {
            <app-excel-result-table
              [headers]="t.headers"
              [rows]="t.rows"
              [addedFrom]="t.addedFrom"
              [withStatus]="t.withStatus"
              (exportFiltered)="exportFiltered($event)"
            >
              <div class="px-4 pt-4 flex flex-col gap-3">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                  <h2 class="text-sm font-bold text-slate-900">ผลลัพธ์</h2>
                  <span class="text-xs text-slate-400">คอลัมน์สีฟ้าคือข้อมูลที่ดึงมาจากไฟล์เปรียบเทียบ</span>
                </div>
                <div class="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-4 px-4" role="tablist">
                  @for (tab of tabs(); track tab.view) {
                    <button
                      type="button"
                      role="tab"
                      class="flex items-center gap-2 px-3 py-2 -mb-px border-b-2 text-sm font-semibold whitespace-nowrap transition-colors"
                      [class]="view() === tab.view ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'"
                      [attr.aria-selected]="view() === tab.view"
                      (click)="view.set(tab.view)"
                    >
                      @if (tab.dot) {
                        <span class="w-2 h-2 rounded-full" [class]="tab.dot"></span>
                      }
                      {{ tab.label }}
                      <span
                        class="px-1.5 py-0.5 rounded-md text-xs tabular-nums"
                        [class]="view() === tab.view ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'"
                      >
                        {{ tab.count }}
                      </span>
                    </button>
                  }
                </div>
              </div>
            </app-excel-result-table>
        } @else if (!base() || !lookup()) {
          <div class="rounded-2xl bg-white/60 border border-dashed border-slate-300 p-6">
            <div class="text-sm font-bold text-slate-700 mb-3">ใช้งานอย่างไร</div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-600">
              <div class="flex gap-3">
                <span class="w-8 h-8 shrink-0 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center">1</span>
                <span>นำเข้า <b>ไฟล์ตั้งต้น</b> (ไฟล์ของคุณ) และ <b>ไฟล์ที่ใช้เปรียบเทียบ</b> (ไฟล์ที่มีข้อมูลที่ต้องการ)</span>
              </div>
              <div class="flex gap-3">
                <span class="w-8 h-8 shrink-0 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center">2</span>
                <span>เลือกคอลัมน์ที่มีค่าเหมือนกันในสองไฟล์ เช่น รหัสพนักงาน แล้วเลือกข้อมูลที่จะดึงมาใส่</span>
              </div>
              <div class="flex gap-3">
                <span class="w-8 h-8 shrink-0 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center">3</span>
                <span>กรอง ค้นหา และเรียงผลลัพธ์ แล้วส่งออกเป็นไฟล์ Excel ทั้งหมดหรือเฉพาะที่กรอง</span>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ExcelCompare {
  private readonly excel = inject(ExcelWorkerClient);

  readonly modes = MATCH_MODE_LIST;

  base = signal<LoadedFile | null>(null);
  baseSheet = signal(0);
  baseHeaderRow = signal(1);
  baseInfo = signal<SheetInfo | null>(null);
  lookup = signal<LoadedFile | null>(null);
  lookupSheet = signal(0);
  lookupHeaderRow = signal(1);
  lookupInfo = signal<SheetInfo | null>(null);
  /** The sides being read, each with a hint to show while it is. */
  loading = signal<Partial<Record<Side, string>>>({});
  busy = computed(() => Object.keys(this.loading()).length > 0);

  keys = signal<KeyPair[]>([]);
  pick = signal<number[]>([]);
  trim = signal(true);
  ignoreCase = signal(true);
  view = signal<ResultView>('all');
  exporting = signal(false);

  /** The last comparison; kept on screen while the next one runs. */
  result = signal<CompareResult | null>(null);
  comparing = signal(false);
  compareError = signal<string | null>(null);

  private readonly sides = {
    base: { file: this.base, sheet: this.baseSheet, headerRow: this.baseHeaderRow, info: this.baseInfo },
    lookup: { file: this.lookup, sheet: this.lookupSheet, headerRow: this.lookupHeaderRow, info: this.lookupInfo },
  };

  private readonly compareOptions = computed<CompareOptions | null>(() => {
    // Read the tables too, so another sheet or header row compares again with the same keys.
    if (!this.baseInfo() || !this.lookupInfo() || this.keys().length === 0) return null;
    return { keys: this.keys(), pick: this.pick(), trim: this.trim(), ignoreCase: this.ignoreCase() };
  });

  constructor() {
    effect((onCleanup) => {
      const options = this.compareOptions();
      const abort = new AbortController();
      onCleanup(() => abort.abort());
      untracked(() => void this.runCompare(options, abort.signal));
    });
  }

  matchedCount = computed(() => {
    const r = this.result();
    return r ? r.counts.found + r.counts.duplicate : 0;
  });

  matchRate = computed(() => {
    const total = this.result()?.rows.length ?? 0;
    return total ? Math.round((this.matchedCount() / total) * 100) : 0;
  });

  steps = computed<Step[]>(() => [
    { label: 'ไฟล์ตั้งต้น', done: !!this.base() },
    { label: 'ไฟล์เปรียบเทียบ', done: !!this.lookup() },
    { label: 'กำหนดการค้นหา', done: !!this.result() && this.pick().length > 0 },
    { label: 'กรอง & ส่งออก', done: false },
  ]);

  currentStep = computed(() => this.steps().findIndex((s) => !s.done));

  tabs = computed(() => {
    const r = this.result();
    if (!r) return [];
    return [
      { view: 'all' as ResultView, label: 'ทั้งหมด', count: r.rows.length, dot: '' },
      ...MATCH_STATUS_LIST.map((s) => ({ view: s.value as ResultView, label: s.label, count: r.counts[s.value], dot: STATUS_DOT[s.value] })),
      { view: 'unmatched' as ResultView, label: 'มีเฉพาะในไฟล์เปรียบเทียบ', count: r.unmatchedLookup.length, dot: 'bg-violet-500' },
    ];
  });

  /** What the result table shows for the selected tab. */
  tableData = computed(() => {
    const r = this.result();
    const lookup = this.lookupInfo();
    return r && lookup ? viewOf(r, lookup.headers, this.view()) : null;
  });

  columnLabel(index: number, header: string): string {
    return `${columnLetter(index)} · ${header}`;
  }

  modeHint(mode: MatchMode): string {
    return MATCH_MODE_LIST.find((m) => m.value === mode)?.hint ?? '';
  }

  isPicked(index: number): boolean {
    return this.pick().includes(index);
  }

  togglePick(index: number): void {
    // Keep the order of the comparison file so the copied columns line up with it.
    this.pick.update((p) => (p.includes(index) ? p.filter((i) => i !== index) : [...p, index].sort((a, b) => a - b)));
  }

  /** Every column except the ones used as keys, which would only repeat what the base row already has. */
  pickAll(): void {
    const keyCols = new Set(this.keys().map((k) => k.lookup));
    this.pick.set((this.lookupInfo()?.headers ?? []).map((_, i) => i).filter((i) => !keyCols.has(i)));
  }

  setKey(index: number, side: Side, column: number): void {
    this.keys.update((keys) => keys.map((k, i) => (i === index ? { ...k, [side]: column } : k)));
  }

  setMode(index: number, mode: MatchMode): void {
    this.keys.update((keys) => keys.map((k, i) => (i === index ? { ...k, mode } : k)));
  }

  addKey(): void {
    this.keys.update((keys) => [...keys, { base: 0, lookup: 0, mode: 'equals' }]);
  }

  removeKey(index: number): void {
    this.keys.update((keys) => keys.filter((_, i) => i !== index));
  }

  /** Another sheet is parsed again from the file, so it shows as loading. */
  setSheet(side: Side, index: number): Promise<void> {
    return this.select(side, index, this.sides[side].headerRow(), true);
  }

  setHeaderRow(side: Side, row: number): Promise<void> {
    return this.select(side, this.sides[side].sheet(), row, false);
  }

  /** Column indexes mean nothing once either table changes shape, so start the mapping over. */
  resetMapping(): void {
    const base = this.baseInfo();
    const lookup = this.lookupInfo();
    this.keys.set(base && lookup ? suggestKeys(base, lookup) : []);
    this.pick.set([]);
    this.view.set('all');
  }

  swap(): void {
    this.excel.call('swap', []).catch(() => undefined);
    const [file, sheet, header, info] = [this.base(), this.baseSheet(), this.baseHeaderRow(), this.baseInfo()];
    this.base.set(this.lookup());
    this.baseSheet.set(this.lookupSheet());
    this.baseHeaderRow.set(this.lookupHeaderRow());
    this.baseInfo.set(this.lookupInfo());
    this.lookup.set(file);
    this.lookupSheet.set(sheet);
    this.lookupHeaderRow.set(header);
    this.lookupInfo.set(info);
    this.resetMapping();
  }

  resetAll(): void {
    this.excel.call('clear', []).catch(() => undefined);
    this.clearSide('base');
    this.clearSide('lookup');
    this.resetMapping();
  }

  async load(side: Side, file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) {
      alert(
        `ไฟล์ "${file.name}" มีขนาด ${megabytes(file.size)} MB เกินกว่าที่รองรับ (${megabytes(MAX_FILE_BYTES)} MB)\n` +
          'กรุณาลบ Sheet หรือคอลัมน์ที่ไม่ใช้ออก หรือแยกเป็นหลายไฟล์',
      );
      return;
    }
    this.setLoading(side, file.size > LARGE_FILE_BYTES ? `ไฟล์ขนาด ${megabytes(file.size)} MB อาจใช้เวลาสักครู่` : '');
    try {
      const opened = await this.excel.call('open', [side, file]);
      const s = this.sides[side];
      s.file.set({ name: file.name, sheetNames: opened.sheetNames });
      s.sheet.set(0);
      s.headerRow.set(1);
      s.info.set(opened.sheet);
      this.resetMapping();
    } catch (err) {
      // The worker has already let go of the file this one was to replace.
      this.clearSide(side);
      this.resetMapping();
      this.fail(err, 'นำเข้าไฟล์ไม่สำเร็จ');
    } finally {
      this.setLoading(side, null);
    }
  }

  exportAll(): void {
    this.download({ kind: 'all' }, 'compare');
  }

  exportFiltered(filtered: FilteredExport): void {
    this.download({ kind: 'filtered', view: this.view(), query: filtered.query, columns: filtered.columns }, 'filtered');
  }

  private async download(request: ExportRequest, suffix: string): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await this.excel.call('export', [request]);
      const baseName = (this.base()?.name ?? 'excel').replace(/\.(xlsx|xls|csv)$/i, '');
      downloadBlob(blob, `${baseName}-${suffix}-${todayIso()}.xlsx`);
    } catch (err) {
      if (err instanceof WorkerCrashedError) this.fail(err, '');
      else alert(`ส่งออก Excel ไม่สำเร็จ: ${errorMessage(err, 'เกิดข้อผิดพลาด')}`);
    } finally {
      this.exporting.set(false);
    }
  }

  private async select(side: Side, sheet: number, headerRow: number, showLoading: boolean): Promise<void> {
    if (showLoading) this.setLoading(side, '');
    try {
      const info = await this.excel.call('selectSheet', [side, sheet, headerRow]);
      const s = this.sides[side];
      s.sheet.set(sheet);
      s.headerRow.set(headerRow);
      s.info.set(info);
      this.resetMapping();
    } catch (err) {
      this.clearSide(side);
      this.resetMapping();
      this.fail(err, 'อ่าน Sheet ไม่สำเร็จ');
    } finally {
      if (showLoading) this.setLoading(side, null);
    }
  }

  private async runCompare(options: CompareOptions | null, signal: AbortSignal): Promise<void> {
    this.compareError.set(null);
    if (!options) {
      this.result.set(null);
      this.comparing.set(false);
      return;
    }
    this.comparing.set(true);
    try {
      await delay(COMPARE_DELAY_MS, signal);
      this.result.set(await this.excel.call('compare', [options], signal));
    } catch (err) {
      // A newer comparison has taken over.
      if (signal.aborted) return;
      this.result.set(null);
      if (err instanceof WorkerCrashedError) this.fail(err, '');
      else this.compareError.set(errorMessage(err, 'เปรียบเทียบไม่สำเร็จ'));
    }
    this.comparing.set(false);
  }

  /** Shows what went wrong; when the worker has crashed, both files went with it. */
  private fail(err: unknown, fallback: string): void {
    if (err instanceof WorkerCrashedError) {
      this.clearSide('base');
      this.clearSide('lookup');
      this.resetMapping();
    }
    alert(errorMessage(err, fallback));
  }

  private clearSide(side: Side): void {
    const s = this.sides[side];
    s.file.set(null);
    s.sheet.set(0);
    s.headerRow.set(1);
    s.info.set(null);
  }

  /** `null` once the side is read. */
  private setLoading(side: Side, hint: string | null): void {
    this.loading.update((l) => {
      const next = { ...l };
      if (hint === null) delete next[side];
      else next[side] = hint;
      return next;
    });
  }
}
