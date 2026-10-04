import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PlanFormDialog } from './plan-form-dialog/plan-form-dialog';
import { PlanTable } from './plan-table/plan-table';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { ExportImportService } from '../../core/services/export-import.service';
import { FiscalYearStateService, ListSpan } from '../../core/services/fiscal-year-state.service';
import { STATUS_LIST, THAI_MONTHS_FULL, WORK_TYPES } from '../../core/models/status.constant';
import { WorkPlan, WorkPlanInput, WorkStatus } from '../../core/models/work-plan.model';
import { fiscalMonths, fiscalYearRangeLabel } from '../../shared/utils/date.util';
import { PlanFilters, buildPlanGroups, countByStatus, fiscalYearsInView, hasActiveFilters } from './plan-list.util';

const SPAN_OPTIONS: { value: ListSpan; label: string }[] = [
  { value: 1, label: 'ปีเดียว' },
  { value: 3, label: 'ย้อนหลัง 3 ปี' },
  { value: 5, label: 'ย้อนหลัง 5 ปี' },
  { value: 'all', label: 'ทั้งหมด' },
];

@Component({
  selector: 'app-plan-list',
  standalone: true,
  imports: [FormsModule, Toolbar, ConfirmDialog, PlanFormDialog, PlanTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grow flex flex-col min-h-0' },
  template: `
    <app-toolbar
      [years]="workPlanService.years()"
      [selectedYear]="selectedYear()"
      (yearChange)="selectedYear.set($event)"
      (addClick)="openAdd()"
      (importJson)="onImportJson($event)"
      (exportJson)="exportImportService.exportJson(visiblePlans(), selectedYear())"
      (exportExcel)="exportImportService.exportExcel(visiblePlans(), selectedYear())"
    />

    <div class="grow overflow-auto">
      <div class="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-7 flex flex-col gap-5">
        <!-- Heading and how many years to show -->
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-xl md:text-2xl font-bold text-slate-900">รายการโครงการ</h1>
            <p class="mt-0.5 text-sm text-slate-500">{{ subtitle() }}</p>
          </div>
          <div class="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm overflow-x-auto max-w-full" role="radiogroup" aria-label="ช่วงปีงบประมาณที่แสดง">
            @for (o of spanOptions; track o.value) {
              <button
                type="button"
                role="radio"
                class="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                [class]="listSpan() === o.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'"
                [attr.aria-checked]="listSpan() === o.value"
                (click)="listSpan.set(o.value)"
              >
                {{ o.label }}
              </button>
            }
          </div>
        </div>

        @if (yearState.isPast() && listSpan() !== 'all') {
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <svg viewBox="0 0 20 20" class="w-5 h-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="grow">
              กำลังดูข้อมูล<b>ปีงบประมาณย้อนหลัง</b> ({{ selectedYear() }}) — ยังแก้ไขข้อมูลได้ตามปกติ
            </span>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-800 hover:bg-amber-100"
              (click)="yearState.resetToCurrent()"
            >
              กลับไปปีปัจจุบัน ({{ yearState.currentYear }})
            </button>
          </div>
        }

        <!-- Status chips: count per status, click to filter -->
        <div class="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:gap-2.5">
          <button
            type="button"
            class="shrink-0 min-w-28 sm:min-w-0 text-left rounded-xl border px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            [class]="statusFilter() === null ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 hover:shadow-sm'"
            [attr.aria-pressed]="statusFilter() === null"
            (click)="statusFilter.set(null)"
          >
            <div class="text-xs font-medium" [class]="statusFilter() === null ? 'text-slate-300' : 'text-slate-500'">ทั้งหมด</div>
            <div class="mt-0.5 text-xl sm:text-2xl font-bold">{{ counts().all }}</div>
          </button>
          @for (s of statusList; track s.value) {
            <button
              type="button"
              class="shrink-0 min-w-28 sm:min-w-0 text-left rounded-xl border px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              [class]="statusFilter() === s.value ? 'shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'"
              [style.background]="statusFilter() === s.value ? s.bg : null"
              [style.border-color]="statusFilter() === s.value ? s.dot : null"
              [attr.aria-pressed]="statusFilter() === s.value"
              (click)="toggleStatus(s.value)"
            >
              <div class="flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap" [style.color]="statusFilter() === s.value ? s.text : null">
                <span class="w-2 h-2 rounded-full" [style.background]="s.dot"></span>{{ s.label }}
              </div>
              <div class="mt-0.5 text-xl sm:text-2xl font-bold text-slate-900" [style.color]="statusFilter() === s.value ? s.text : null">{{ counts()[s.value] }}</div>
            </button>
          }
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-2.5">
          <label class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white w-full sm:w-72 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-400">
            <svg viewBox="0 0 20 20" class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" stroke-linecap="round" />
            </svg>
            <input
              type="text"
              placeholder="ค้นหาโครงการ, กิจกรรม, ผู้รับผิดชอบ"
              aria-label="ค้นหา"
              class="bg-transparent outline-none text-sm w-full"
              [(ngModel)]="search"
            />
            @if (search()) {
              <button type="button" class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="ล้างคำค้นหา" (click)="search.set('')">
                <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" />
                </svg>
              </button>
            }
          </label>
          <select
            class="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            [class]="monthFilter() !== null ? 'text-blue-700 border-blue-300' : 'text-slate-700'"
            aria-label="กรองตามเดือน"
            [(ngModel)]="monthFilter"
          >
            <option [ngValue]="null">ทุกเดือน</option>
            @for (m of monthOptions(); track m.value) {
              <option [ngValue]="m.value">{{ m.label }}</option>
            }
          </select>
          <select
            class="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            [class]="typeFilter() !== null ? 'text-blue-700 border-blue-300' : 'text-slate-700'"
            aria-label="กรองตามประเภท"
            [(ngModel)]="typeFilter"
          >
            <option [ngValue]="null">ทุกประเภท</option>
            @for (t of workTypes; track t) {
              <option [ngValue]="t">{{ t }}</option>
            }
          </select>
          @if (filtering()) {
            <button type="button" class="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900" (click)="clearFilters()">
              ล้างตัวกรอง
            </button>
          }
          <div class="grow"></div>
          <span class="text-sm text-slate-500">แสดง {{ visiblePlans().length }} โครงการ</span>
          @if (expandablePlans().length > 0) {
            <button type="button" class="px-3 py-2 rounded-xl text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="toggleAll()">
              {{ allExpanded() ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด' }}
            </button>
          }
        </div>

        @if (visiblePlans().length > 0) {
          <app-plan-table
            [groups]="groups()"
            [expandedIds]="expandedIds()"
            [showGroupHeaders]="listSpan() !== 1"
            [currentYear]="yearState.currentYear"
            (edit)="openEdit($event)"
            (remove)="deleteTarget.set($event)"
            (toggle)="toggleExpanded($event)"
          />
        } @else {
          <div class="bg-white border border-dashed border-slate-300 rounded-2xl px-6 py-14 flex flex-col items-center text-center gap-3">
            <span class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <svg viewBox="0 0 20 20" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                @if (filtering()) {
                  <circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" stroke-linecap="round" />
                } @else {
                  <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M7 8h6M7 11h6M7 14h3" stroke-linecap="round" />
                }
              </svg>
            </span>
            @if (filtering()) {
              <div class="font-semibold text-slate-700">ไม่พบโครงการที่ตรงกับตัวกรอง</div>
              <p class="text-sm text-slate-500">ลองเปลี่ยนคำค้นหาหรือเงื่อนไข หรือดูช่วงปีงบประมาณอื่น</p>
              <button type="button" class="mt-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50" (click)="clearFilters()">
                ล้างตัวกรอง
              </button>
            } @else {
              <div class="font-semibold text-slate-700">ยังไม่มีโครงการใน{{ listSpan() === 1 ? 'ปีงบประมาณ ' + selectedYear() : 'ช่วงปีที่เลือก' }}</div>
              <p class="text-sm text-slate-500">เริ่มเพิ่มโครงการแรก หรือเลือกปีงบประมาณอื่นจากแถบด้านบน</p>
              <button type="button" class="mt-1 px-4 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700" (click)="openAdd()">
                + เพิ่มโครงการ
              </button>
            }
          </div>
        }
      </div>
    </div>

    <app-plan-form-dialog
      [open]="formOpen()"
      [editing]="editingPlan()"
      (save)="onSave($event)"
      (cancel)="closeForm()"
    />

    <app-confirm-dialog
      [open]="deleteTarget() !== null"
      title="ลบโครงการ"
      [message]="'ต้องการลบโครงการ &quot;' + (deleteTarget()?.name ?? '') + '&quot; หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้'"
      confirmText="ลบ"
      (confirm)="confirmDelete()"
      (cancel)="deleteTarget.set(null)"
    />

    @if (importPending()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
          <h2 class="text-lg font-bold text-slate-900">นำเข้าข้อมูล JSON</h2>
          <p class="text-sm text-slate-600">
            พบ {{ importPending()!.length }} รายการในไฟล์ ต้องการแทนที่ข้อมูลเดิมทั้งหมด หรือผสานเข้ากับข้อมูลที่มีอยู่?
          </p>
          <div class="flex flex-col gap-2">
            <button type="button" class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="confirmImport('merge')">
              ผสานกับข้อมูลเดิม
            </button>
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="confirmImport('replace')">
              แทนที่ทั้งหมด
            </button>
            <button type="button" class="px-4 py-2.5 text-sm font-semibold text-slate-500" (click)="importPending.set(null)">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlanList {
  readonly workPlanService = inject(WorkPlanService);
  readonly exportImportService = inject(ExportImportService);
  readonly yearState = inject(FiscalYearStateService);

  readonly statusList = STATUS_LIST;
  readonly workTypes = WORK_TYPES;
  readonly spanOptions = SPAN_OPTIONS;

  readonly selectedYear = this.yearState.year;
  readonly listSpan = this.yearState.listSpan;
  search = signal('');
  monthFilter = signal<number | null>(null);
  statusFilter = signal<WorkStatus | null>(null);
  typeFilter = signal<string | null>(null);

  formOpen = signal(false);
  editingPlan = signal<WorkPlan | null>(null);
  deleteTarget = signal<WorkPlan | null>(null);
  importPending = signal<WorkPlan[] | null>(null);
  expandedIds = signal<ReadonlySet<string>>(new Set());

  private filters = computed<PlanFilters>(() => ({
    keyword: this.search(),
    month: this.monthFilter(),
    status: this.statusFilter(),
    type: this.typeFilter(),
  }));

  filtering = computed(() => hasActiveFilters(this.filters()));

  private viewYears = computed(() =>
    fiscalYearsInView(this.selectedYear(), this.listSpan(), this.workPlanService.yearsWithPlans()),
  );

  groups = computed(() => buildPlanGroups(this.workPlanService.plans(), this.viewYears(), this.filters()));

  visiblePlans = computed(() => this.groups().flatMap((g) => g.rows.map((r) => r.plan)));

  counts = computed(() => countByStatus(this.workPlanService.plans(), this.viewYears(), this.filters()));

  subtitle = computed(() => {
    const year = this.selectedYear();
    const years = this.viewYears();
    const oldest = years[years.length - 1];
    switch (this.listSpan()) {
      case 1:
        return `ปีงบประมาณ ${year} (${fiscalYearRangeLabel(year)}) · รวมโครงการต่อเนื่องจากปีก่อน`;
      case 'all':
        return years.length > 1 ? `ทุกปีงบประมาณ (${oldest} – ${years[0]})` : `ทุกปีงบประมาณ (${years[0]})`;
      default:
        return `ย้อนหลัง ${years.length} ปีงบประมาณ (${oldest} – ${year}) · แยกตามปีที่เริ่มโครงการ`;
    }
  });

  expandablePlans = computed(() => this.visiblePlans().filter((p) => (p.activities?.length ?? 0) > 0));

  allExpanded = computed(() => {
    const ids = this.expandedIds();
    const expandable = this.expandablePlans();
    return expandable.length > 0 && expandable.every((p) => ids.has(p.id));
  });

  // The months of the fiscal year, October first; the value is the month's position (1 = October).
  // Across several years the month is read within each project's group, so only its name is shown.
  monthOptions = computed(() => {
    const single = this.listSpan() === 1;
    return fiscalMonths(this.selectedYear()).map((m, i) => ({
      value: i + 1,
      label: single ? `${THAI_MONTHS_FULL[m.month]} ${m.year + 543}` : THAI_MONTHS_FULL[m.month],
    }));
  });

  toggleStatus(status: WorkStatus): void {
    this.statusFilter.update((current) => (current === status ? null : status));
  }

  clearFilters(): void {
    this.search.set('');
    this.monthFilter.set(null);
    this.statusFilter.set(null);
    this.typeFilter.set(null);
  }

  toggleAll(): void {
    const ids = this.expandablePlans().map((p) => p.id);
    const collapse = this.allExpanded();
    this.expandedIds.update((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (collapse) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  toggleExpanded(id: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  openAdd(): void {
    this.editingPlan.set(null);
    this.formOpen.set(true);
  }

  openEdit(plan: WorkPlan): void {
    this.editingPlan.set(plan);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingPlan.set(null);
  }

  onSave(input: WorkPlanInput): void {
    const editing = this.editingPlan();
    if (editing) {
      this.workPlanService.update(editing.id, input);
    } else {
      this.workPlanService.add(input);
    }
    this.closeForm();
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target) {
      this.workPlanService.delete(target.id);
    }
    this.deleteTarget.set(null);
  }

  async onImportJson(file: File): Promise<void> {
    try {
      const plans = await this.exportImportService.importJson(file);
      this.importPending.set(plans);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'นำเข้าไฟล์ไม่สำเร็จ');
    }
  }

  confirmImport(mode: 'merge' | 'replace'): void {
    const plans = this.importPending();
    if (!plans) return;
    if (mode === 'replace') {
      this.workPlanService.replaceAll(plans);
    } else {
      this.workPlanService.mergeAll(plans);
    }
    this.importPending.set(null);
  }
}
