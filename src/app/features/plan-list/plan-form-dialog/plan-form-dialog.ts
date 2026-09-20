import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkPlan, WorkPlanInput, WorkStatus } from '../../../core/models/work-plan.model';
import { STATUS_LIST, WORK_TYPES } from '../../../core/models/status.constant';
import { ThaiMonthPicker } from '../../../shared/components/thai-month-picker/thai-month-picker';
import { fiscalYearOf, fiscalYearRangeLabel, monthEndIso, monthStartIso, todayIso } from '../../../shared/utils/date.util';

/**
 * Add or edit a project. Its activities are managed on the project's detail page, so saving here
 * never touches them (the emitted value has no `activities`, and the service keeps the existing ones).
 */
@Component({
  selector: 'app-plan-form-dialog',
  standalone: true,
  imports: [FormsModule, ThaiMonthPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span class="text-lg font-bold text-slate-900">{{ editing() ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่' }}</span>
            <button
              type="button"
              aria-label="ปิด"
              class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 text-base"
              (click)="cancel.emit()"
            >
              ×
            </button>
          </div>

          <div class="p-6 flex flex-col gap-4 overflow-y-auto">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อโครงการ</span>
              <input
                type="text"
                required
                placeholder="เช่น จัดทำแผนปฏิบัติการประจำปี"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                [(ngModel)]="name"
              />
            </label>

            <div class="flex gap-4">
              <label class="flex flex-col gap-1.5 flex-1">
                <span class="text-sm font-semibold text-slate-700">ประเภทโครงการ</span>
                <select class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500" [(ngModel)]="type">
                  @for (t of workTypes; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1.5 flex-1">
                <span class="text-sm font-semibold text-slate-700">ผู้รับผิดชอบ</span>
                <input
                  type="text"
                  placeholder="เช่น ฝ่ายยุทธศาสตร์"
                  class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  [(ngModel)]="responsible"
                />
              </label>
            </div>

            <div class="flex flex-col gap-1.5">
              <div class="flex gap-4">
                <div class="flex flex-col gap-1.5 flex-1">
                  <span class="text-sm font-semibold text-slate-700">เดือน/ปีที่เริ่ม</span>
                  <app-thai-month-picker
                    ariaLabel="เดือนและปีที่เริ่มโครงการ"
                    edge="start"
                    [value]="startDate()"
                    (valueChange)="onStartChange($event)"
                  />
                </div>
                <div class="flex flex-col gap-1.5 flex-1">
                  <span class="text-sm font-semibold text-slate-700">เดือน/ปีที่สิ้นสุด</span>
                  <app-thai-month-picker
                    ariaLabel="เดือนและปีที่สิ้นสุดโครงการ"
                    edge="end"
                    [value]="endDate()"
                    (valueChange)="onEndChange($event)"
                  />
                </div>
              </div>
              @if (fiscalYear(); as fy) {
                <span class="text-xs text-slate-500">อยู่ในปีงบประมาณ {{ fy }} ({{ fiscalRange(fy) }})</span>
              }
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">สถานะ</span>
              <div class="flex gap-2 flex-wrap">
                @for (s of statusList; track s.value) {
                  <button
                    type="button"
                    class="px-3.5 py-1.5 rounded-full text-sm font-semibold border"
                    [style.background]="status() === s.value ? s.bg : '#FFFFFF'"
                    [style.color]="status() === s.value ? s.text : '#6B7280'"
                    [style.border-color]="status() === s.value ? s.dot : '#E2E5EA'"
                    (click)="status.set(s.value)"
                  >
                    {{ s.label }}
                  </button>
                }
              </div>
            </div>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">รายละเอียด</span>
              <textarea
                rows="3"
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500"
                [(ngModel)]="description"
              ></textarea>
            </label>
          </div>

          <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
              (click)="cancel.emit()"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-40"
              [disabled]="!name() || !startDate() || !endDate()"
              (click)="onSave()"
            >
              บันทึกโครงการ
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlanFormDialog {
  open = input(false);
  editing = input<WorkPlan | null>(null);

  save = output<WorkPlanInput>();
  cancel = output<void>();

  readonly workTypes = WORK_TYPES;
  readonly statusList = STATUS_LIST;
  readonly fiscalRange = fiscalYearRangeLabel;

  name = signal('');
  type = signal(WORK_TYPES[0]);
  responsible = signal('');
  startDate = signal(monthStartIso(todayIso()));
  endDate = signal(monthEndIso(todayIso()));
  status = signal<WorkStatus>('planned');
  description = signal('');

  fiscalYear = computed(() => fiscalYearOf(this.startDate()));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const p = this.editing();
      if (p) {
        this.name.set(p.name);
        this.type.set(p.type);
        this.responsible.set(p.responsible);
        this.startDate.set(p.startDate);
        this.endDate.set(p.endDate);
        this.status.set(p.status);
        this.description.set(p.description ?? '');
      } else {
        this.name.set('');
        this.type.set(WORK_TYPES[0]);
        this.responsible.set('');
        this.startDate.set(monthStartIso(todayIso()));
        this.endDate.set(monthEndIso(todayIso()));
        this.status.set('planned');
        this.description.set('');
      }
    });
  }

  // Keeps the range valid: moving the start past the end pushes the end along, and the other way round.
  onStartChange(value: string): void {
    this.startDate.set(value);
    if (this.endDate() < value) this.endDate.set(monthEndIso(value));
  }

  onEndChange(value: string): void {
    this.endDate.set(value);
    if (this.startDate() > value) this.startDate.set(monthStartIso(value));
  }

  onSave(): void {
    if (!this.name() || !this.startDate() || !this.endDate()) return;
    // Projects are planned by month: the range always runs from the 1st of the start month to the end of the end month.
    const startDate = monthStartIso(this.startDate());
    const endDate = monthEndIso(this.endDate());
    const year = fiscalYearOf(startDate);
    if (year === null) return;
    this.save.emit({
      year,
      name: this.name(),
      type: this.type(),
      responsible: this.responsible(),
      startDate,
      endDate,
      status: this.status(),
      description: this.description() || undefined,
    });
  }
}
