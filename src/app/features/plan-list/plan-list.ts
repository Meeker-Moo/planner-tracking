import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PlanFormDialog } from './plan-form-dialog/plan-form-dialog';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { ExportImportService } from '../../core/services/export-import.service';
import { STATUS_LIST, THAI_MONTHS_FULL, WORK_TYPES } from '../../core/models/status.constant';
import { WorkPlan, WorkPlanInput } from '../../core/models/work-plan.model';
import { todoProgress } from '../../shared/utils/activity.util';
import {
  currentFiscalYear,
  fiscalMonths,
  fiscalYearRangeLabel,
  formatDateShort,
  formatMonthYearShort,
  monthSpanInFiscalYear,
} from '../../shared/utils/date.util';

@Component({
  selector: 'app-plan-list',
  standalone: true,
  imports: [FormsModule, RouterLink, Toolbar, StatusBadge, ConfirmDialog, PlanFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar
      [years]="workPlanService.years()"
      [selectedYear]="selectedYear()"
      (yearChange)="selectedYear.set($event)"
      (addClick)="openAdd()"
      (importJson)="onImportJson($event)"
      (exportJson)="exportImportService.exportJson(filteredPlans(), selectedYear())"
      (exportExcel)="exportImportService.exportExcel(filteredPlans(), selectedYear())"
    />

    <div class="flex-shrink-0 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3 px-4 md:px-8 py-3.5">
      <label class="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 w-full sm:w-64">
        <span class="text-slate-400 text-sm">ค้นหา</span>
        <input
          type="text"
          placeholder="ชื่อโครงการ, กิจกรรม, ผู้รับผิดชอบ..."
          class="bg-transparent outline-none text-sm w-full"
          [(ngModel)]="search"
        />
      </label>
      <select class="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700" [(ngModel)]="monthFilter">
        <option [ngValue]="null">ทุกเดือน</option>
        @for (m of monthOptions(); track m.value) {
          <option [ngValue]="m.value">{{ m.label }}</option>
        }
      </select>
      <select class="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700" [(ngModel)]="statusFilter">
        <option [ngValue]="null">ทุกสถานะ</option>
        @for (s of statusList; track s.value) {
          <option [ngValue]="s.value">{{ s.label }}</option>
        }
      </select>
      <select class="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700" [(ngModel)]="typeFilter">
        <option [ngValue]="null">ทุกประเภท</option>
        @for (t of workTypes; track t) {
          <option [ngValue]="t">{{ t }}</option>
        }
      </select>
      <div class="flex-grow"></div>
      @if (expandablePlans().length > 0) {
        <button type="button" class="text-sm font-semibold text-blue-600" (click)="toggleAll()">
          {{ allExpanded() ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด' }}
        </button>
      }
      <span class="text-sm text-slate-500">
        ปีงบประมาณ {{ selectedYear() }} ({{ fiscalRange(selectedYear()) }}) · ทั้งหมด {{ filteredPlans().length }} รายการ
      </span>
    </div>

    <div class="flex-grow overflow-auto p-4 md:p-8">
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table class="w-full min-w-[820px] text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-left">
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">ชื่อโครงการ</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">ประเภท</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">ผู้รับผิดชอบ</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">เริ่ม</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">สิ้นสุด</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">สถานะ</th>
              <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            @for (item of filteredPlans(); track item.id) {
              <tr class="border-b border-slate-100 last:border-b-0">
                <td class="px-4 py-3.5">
                  <div class="flex items-start gap-2">
                    @if (countActivities(item) > 0) {
                      <button
                        type="button"
                        class="w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                        [attr.aria-label]="(isExpanded(item.id) ? 'ย่อ' : 'ขยาย') + 'กิจกรรมย่อยของ ' + item.name"
                        [attr.aria-expanded]="isExpanded(item.id)"
                        (click)="toggleExpanded(item.id)"
                      >
                        <span class="inline-block text-[10px] transition-transform" [class.rotate-90]="isExpanded(item.id)" aria-hidden="true">▶</span>
                      </button>
                    } @else {
                      <span class="w-6 shrink-0"></span>
                    }
                    <div class="min-w-0">
                      <a
                        [routerLink]="['/plans', item.id]"
                        class="block w-fit font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                        title="ดูรายละเอียดโครงการและจัดการกิจกรรม"
                      >
                        {{ item.name }}
                      </a>
                      @if (countActivities(item) > 0) {
                        <button
                          type="button"
                          class="mt-0.5 text-xs text-slate-500 hover:text-blue-600"
                          (click)="toggleExpanded(item.id)"
                        >
                          กิจกรรมย่อย {{ countDone(item) }}/{{ countActivities(item) }} เสร็จสิ้น
                        </button>
                      }
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3.5 text-slate-600">{{ item.type }}</td>
                <td class="px-4 py-3.5 text-slate-600">{{ item.responsible }}</td>
                <td class="px-4 py-3.5 text-slate-600">{{ formatMonth(item.startDate) }}</td>
                <td class="px-4 py-3.5 text-slate-600">{{ formatMonth(item.endDate) }}</td>
                <td class="px-4 py-3.5"><app-status-badge [status]="item.status" /></td>
                <td class="px-4 py-3.5 text-right whitespace-nowrap">
                  <a [routerLink]="['/plans', item.id]" class="text-slate-700 font-semibold px-1.5 hover:text-blue-600">รายละเอียด</a>
                  <button type="button" class="text-blue-600 font-semibold px-1.5" (click)="openEdit(item)">แก้ไข</button>
                  <button type="button" class="text-red-600 font-semibold px-1.5" (click)="askDelete(item)">ลบ</button>
                </td>
              </tr>
              @if (isExpanded(item.id)) {
                @for (a of item.activities; track a.id) {
                  <tr class="border-b border-slate-100 bg-slate-50">
                    <td class="pl-12 pr-4 py-2.5 text-slate-700">
                      <div>{{ a.name }}</div>
                      @if (a.description) {
                        <div class="text-xs text-slate-500 whitespace-pre-line">{{ a.description }}</div>
                      }
                      @if (a.note) {
                        <div class="text-xs text-amber-700 whitespace-pre-line">หมายเหตุ: {{ a.note }}</div>
                      }
                      @if (progress(a).total > 0) {
                        <div class="text-xs text-slate-500">To do {{ progress(a).done }}/{{ progress(a).total }} เสร็จแล้ว</div>
                      }
                    </td>
                    <td></td>
                    <td class="px-4 py-2.5 text-slate-600">{{ a.responsible }}</td>
                    <td class="px-4 py-2.5 text-slate-600">{{ formatDate(a.startDate) }}</td>
                    <td class="px-4 py-2.5 text-slate-600">{{ formatDate(a.endDate) }}</td>
                    <td class="px-4 py-2.5"><app-status-badge [status]="a.status" /></td>
                    <td></td>
                  </tr>
                }
              }
            } @empty {
              <tr>
                <td colspan="7" class="px-4 py-12 text-center text-slate-400">ยังไม่มีโครงการ — เริ่มเพิ่มโครงการแรกของคุณ</td>
              </tr>
            }
          </tbody>
        </table>
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

  readonly statusList = STATUS_LIST;
  readonly workTypes = WORK_TYPES;

  selectedYear = signal(currentFiscalYear());
  search = signal('');
  monthFilter = signal<number | null>(null);
  statusFilter = signal<WorkPlan['status'] | null>(null);
  typeFilter = signal<string | null>(null);

  formOpen = signal(false);
  editingPlan = signal<WorkPlan | null>(null);
  deleteTarget = signal<WorkPlan | null>(null);
  importPending = signal<WorkPlan[] | null>(null);
  expandedIds = signal<ReadonlySet<string>>(new Set());

  filteredPlans = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const month = this.monthFilter();
    const status = this.statusFilter();
    const type = this.typeFilter();

    return this.workPlanService
      .plans()
      .filter((p) => p.year === this.selectedYear())
      .filter(
        (p) =>
          !keyword ||
          p.name.toLowerCase().includes(keyword) ||
          p.responsible.toLowerCase().includes(keyword) ||
          (p.activities ?? []).some((a) => a.name.toLowerCase().includes(keyword)),
      )
      .filter((p) => !month || this.monthInRange(p, month))
      .filter((p) => !status || p.status === status)
      .filter((p) => !type || p.type === type);
  });

  expandablePlans = computed(() => this.filteredPlans().filter((p) => this.countActivities(p) > 0));

  allExpanded = computed(() => {
    const ids = this.expandedIds();
    const expandable = this.expandablePlans();
    return expandable.length > 0 && expandable.every((p) => ids.has(p.id));
  });

  // The months of the selected fiscal year, October first; the value is the month's position (1 = October).
  monthOptions = computed(() =>
    fiscalMonths(this.selectedYear()).map((m, i) => ({ value: i + 1, label: `${THAI_MONTHS_FULL[m.month]} ${m.year + 543}` })),
  );

  readonly fiscalRange = fiscalYearRangeLabel;
  readonly progress = todoProgress;
  formatDate = formatDateShort;
  formatMonth = formatMonthYearShort;

  countActivities(p: WorkPlan): number {
    return p.activities?.length ?? 0;
  }

  countDone(p: WorkPlan): number {
    return p.activities?.filter((a) => a.status === 'completed').length ?? 0;
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
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

  private monthInRange(p: WorkPlan, month: number): boolean {
    const span = monthSpanInFiscalYear(p.startDate, p.endDate, this.selectedYear());
    return !!span && month >= span[0] && month <= span[1];
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

  askDelete(plan: WorkPlan): void {
    this.deleteTarget.set(plan);
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
