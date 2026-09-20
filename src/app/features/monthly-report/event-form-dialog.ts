import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarEvent, CalendarEventInput } from '../../core/models/calendar-event.model';
import { WorkPlan } from '../../core/models/work-plan.model';
import { ThaiDatePicker } from '../../shared/components/thai-date-picker/thai-date-picker';
import { TimeField } from '../../shared/components/time-field/time-field';

const DEFAULT_START = '09:00';
const DEFAULT_END = '10:00';

interface Option {
  id: string;
  label: string;
}

/** Add or edit one event: when it happens, what it is, and which project / activity it belongs to. */
@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [FormsModule, ThaiDatePicker, TimeField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4">
        <div class="w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span class="text-lg font-bold text-slate-900">{{ editing() ? 'แก้ไข Event' : 'เพิ่ม Event' }}</span>
            <button type="button" aria-label="ปิด" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 text-base" (click)="cancel.emit()">
              ×
            </button>
          </div>

          <div class="p-6 flex flex-col gap-4 overflow-y-auto">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อ Event</span>
              <input
                type="text"
                placeholder="เช่น ประชุมติดตามความคืบหน้า"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                [(ngModel)]="title"
              />
            </label>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">วันที่</span>
                <app-thai-date-picker ariaLabel="วันที่ของ Event" [(value)]="date" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">เวลาเริ่ม</span>
                <app-time-field ariaLabel="เวลาเริ่ม" [(value)]="startTime" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">เวลาสิ้นสุด</span>
                <app-time-field ariaLabel="เวลาสิ้นสุด" [invalid]="!!timeError()" [(value)]="endTime" />
              </div>
            </div>
            @if (timeError()) {
              <span class="-mt-2 text-xs text-red-600">{{ timeError() }}</span>
            }

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">รายละเอียด</span>
              <textarea
                rows="3"
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500"
                [(ngModel)]="description"
              ></textarea>
            </label>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
              <span class="text-sm font-semibold text-slate-700">เชื่อมโยงกับโครงการ <span class="font-normal text-slate-400">(ไม่บังคับ)</span></span>
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-500">โครงการ</span>
                <select
                  class="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  [ngModel]="projectId()"
                  (ngModelChange)="onProjectChange($event)"
                >
                  <option value="">— ไม่เชื่อมโยง —</option>
                  @for (p of projectOptions(); track p.id) {
                    <option [value]="p.id">{{ p.label }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-500">กิจกรรมย่อย</span>
                <select
                  class="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  [disabled]="!projectId()"
                  [ngModel]="activityId()"
                  (ngModelChange)="activityId.set($event)"
                >
                  <option value="">— ทั้งโครงการ (ไม่ระบุกิจกรรม) —</option>
                  @for (a of activityOptions(); track a.id) {
                    <option [value]="a.id">{{ a.label }}</option>
                  }
                </select>
              </label>
              @if (projectId() && activityOptions().length === 0) {
                <span class="text-xs text-slate-500">โครงการนี้ยังไม่มีกิจกรรมย่อย</span>
              }
            </div>
          </div>

          <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="cancel.emit()">
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-40"
              [disabled]="!canSave()"
              (click)="onSave()"
            >
              บันทึก Event
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class EventFormDialog {
  open = input(false);
  /** The event being edited; null when adding a new one. */
  editing = input<CalendarEvent | null>(null);
  /** The day a new event starts out on (the day that was clicked). */
  defaultDate = input('');
  /** Projects an event can be linked to. */
  projects = input<WorkPlan[]>([]);

  save = output<CalendarEventInput>();
  cancel = output<void>();

  title = signal('');
  description = signal('');
  date = signal('');
  startTime = signal(DEFAULT_START);
  endTime = signal(DEFAULT_END);
  projectId = signal('');
  activityId = signal('');

  timeError = computed(() =>
    this.startTime() && this.endTime() && this.endTime() < this.startTime() ? 'เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม' : '',
  );

  canSave = computed(() => !!this.title().trim() && !!this.date() && !!this.startTime() && !!this.endTime() && !this.timeError());

  /** Newest fiscal year first. A project that was linked but no longer exists stays selectable so the link is not lost silently. */
  projectOptions = computed<Option[]>(() => {
    const options = [...this.projects()]
      .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'th'))
      .map((p) => ({ id: p.id, label: `${p.name} (ปีงบ ${p.year})` }));
    const linked = this.projectId();
    if (linked && !options.some((o) => o.id === linked)) {
      options.unshift({ id: linked, label: `${this.editing()?.projectName ?? 'โครงการ'} (ไม่พบในระบบแล้ว)` });
    }
    return options;
  });

  activityOptions = computed<Option[]>(() => {
    const project = this.projects().find((p) => p.id === this.projectId());
    const options = (project?.activities ?? []).map((a) => ({ id: a.id, label: a.name }));
    const linked = this.activityId();
    if (linked && !options.some((o) => o.id === linked)) {
      options.unshift({ id: linked, label: `${this.editing()?.activityName ?? 'กิจกรรม'} (ไม่พบในระบบแล้ว)` });
    }
    return options;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const e = this.editing();
      if (e) {
        this.title.set(e.title);
        this.description.set(e.description ?? '');
        this.date.set(e.date);
        this.startTime.set(e.startTime);
        this.endTime.set(e.endTime);
        this.projectId.set(e.projectId ?? '');
        this.activityId.set(e.activityId ?? '');
      } else {
        this.title.set('');
        this.description.set('');
        this.date.set(this.defaultDate());
        this.startTime.set(DEFAULT_START);
        this.endTime.set(DEFAULT_END);
        this.projectId.set('');
        this.activityId.set('');
      }
    });
  }

  // An activity belongs to one project, so changing the project clears the activity.
  onProjectChange(id: string): void {
    this.projectId.set(id);
    this.activityId.set('');
  }

  onSave(): void {
    if (!this.canSave()) return;
    const projectId = this.projectId();
    const activityId = projectId ? this.activityId() : '';
    const project = this.projects().find((p) => p.id === projectId);
    const activity = project?.activities?.find((a) => a.id === activityId);
    // The name comes from the live project when it exists, otherwise the one saved with the event.
    const original = this.editing();
    const sameProject = original?.projectId === projectId;
    const sameActivity = original?.activityId === activityId;
    const description = this.description().trim();

    this.save.emit({
      date: this.date(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      title: this.title().trim(),
      description: description || undefined,
      projectId: projectId || undefined,
      projectName: projectId ? (project?.name ?? (sameProject ? original?.projectName : undefined)) : undefined,
      activityId: activityId || undefined,
      activityName: activityId ? (activity?.name ?? (sameActivity ? original?.activityName : undefined)) : undefined,
    });
  }
}
