import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarEvent, CalendarEventInput, EventPriority } from '../../core/models/calendar-event.model';
import { DEFAULT_EVENT_PRIORITY, EVENT_PRIORITY_LIST } from '../../core/models/status.constant';
import { WorkPlan } from '../../core/models/work-plan.model';
import { ThaiDatePicker } from '../../shared/components/thai-date-picker/thai-date-picker';
import { eventDayCount } from './calendar.util';

interface Option {
  id: string;
  label: string;
}

/** Add or edit one event: the days it covers, how pressing it is, what it is, and which project / activity it belongs to. */
@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [FormsModule, ThaiDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-60 p-4">
        <div
          role="dialog"
          aria-modal="true"
          class="w-full max-w-xl max-h-[90vh] bg-white rounded-3xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
        >
          <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <span class="text-lg font-bold text-slate-900">{{ editing() ? 'แก้ไข Event' : 'เพิ่ม Event' }}</span>
            <button
              type="button"
              aria-label="ปิด"
              class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              (click)="cancel.emit()"
            >
              <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="p-6 flex flex-col gap-4 overflow-y-auto">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อ Event</span>
              <input
                type="text"
                placeholder="เช่น ประชุมติดตามความคืบหน้า"
                class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                [(ngModel)]="title"
              />
            </label>

            <div class="flex flex-col gap-1.5">
              <span id="event-priority-label" class="text-sm font-semibold text-slate-700">ความสำคัญ (Priority)</span>
              <div role="radiogroup" aria-labelledby="event-priority-label" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                @for (p of priorities; track p.value) {
                  <button
                    type="button"
                    role="radio"
                    class="flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition"
                    [attr.aria-checked]="priority() === p.value"
                    [style.border-color]="priority() === p.value ? p.dot : 'transparent'"
                    [style.background]="priority() === p.value ? p.bg : '#F8FAFC'"
                    [style.color]="priority() === p.value ? p.text : '#64748B'"
                    (click)="priority.set(p.value)"
                  >
                    <span class="w-2.5 h-2.5 rounded-full" [style.background]="p.dot"></span>
                    {{ p.label }}
                  </button>
                }
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">วันเริ่มต้น</span>
                <app-thai-date-picker ariaLabel="วันเริ่มต้นของ Event" [value]="startDate()" (valueChange)="onStartDateChange($event)" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">วันสิ้นสุด</span>
                <app-thai-date-picker ariaLabel="วันสิ้นสุดของ Event" [(value)]="endDate" />
              </div>
            </div>
            @if (dateError()) {
              <span class="-mt-2 text-xs text-red-600">{{ dateError() }}</span>
            } @else if (dayCount() > 1) {
              <span class="-mt-2 text-xs text-slate-500">รวม {{ dayCount() }} วัน</span>
            }

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">รายละเอียด</span>
              <textarea
                rows="3"
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                [(ngModel)]="description"
              ></textarea>
            </label>

            <button
              type="button"
              role="switch"
              class="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition"
              [class]="done() ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
              [attr.aria-checked]="done()"
              (click)="done.set(!done())"
            >
              <span class="relative w-10 h-6 shrink-0 rounded-full transition" [class]="done() ? 'bg-emerald-500' : 'bg-slate-300'">
                <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition" [class.translate-x-4]="done()"></span>
              </span>
              <span class="flex flex-col">
                <span class="text-sm font-semibold text-slate-700">ทำแล้ว</span>
                <span class="text-xs text-slate-500">Event ที่ทำแล้วจะแสดงเป็นขีดฆ่าบนปฏิทิน</span>
              </span>
            </button>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
              <span class="text-sm font-semibold text-slate-700">เชื่อมโยงกับโครงการ <span class="font-normal text-slate-400">(ไม่บังคับ)</span></span>
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-500">โครงการ</span>
                <select
                  class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500"
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
                  class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
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

          <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              (click)="cancel.emit()"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none"
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

  readonly priorities = EVENT_PRIORITY_LIST;

  title = signal('');
  priority = signal<EventPriority>(DEFAULT_EVENT_PRIORITY);
  done = signal(false);
  description = signal('');
  startDate = signal('');
  endDate = signal('');
  projectId = signal('');
  activityId = signal('');

  dateError = computed(() =>
    this.startDate() && this.endDate() && this.endDate() < this.startDate() ? 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น' : '',
  );

  dayCount = computed(() =>
    this.startDate() && this.endDate() ? eventDayCount({ startDate: this.startDate(), endDate: this.endDate() }) : 0,
  );

  canSave = computed(() => !!this.title().trim() && !!this.startDate() && !!this.endDate() && !this.dateError());

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
        this.priority.set(e.priority ?? DEFAULT_EVENT_PRIORITY);
        this.done.set(!!e.done);
        this.startDate.set(e.startDate);
        this.endDate.set(e.endDate);
        this.projectId.set(e.projectId ?? '');
        this.activityId.set(e.activityId ?? '');
      } else {
        this.title.set('');
        this.description.set('');
        this.priority.set(DEFAULT_EVENT_PRIORITY);
        this.done.set(false);
        this.startDate.set(this.defaultDate());
        this.endDate.set(this.defaultDate());
        this.projectId.set('');
        this.activityId.set('');
      }
    });
  }

  // A one-day event stays one day when its start moves, and the end never ends up before the start.
  onStartDateChange(iso: string): void {
    const end = this.endDate();
    if (!end || end === this.startDate() || end < iso) this.endDate.set(iso);
    this.startDate.set(iso);
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
      startDate: this.startDate(),
      endDate: this.endDate(),
      title: this.title().trim(),
      description: description || undefined,
      priority: this.priority(),
      done: this.done(),
      projectId: projectId || undefined,
      projectName: projectId ? (project?.name ?? (sameProject ? original?.projectName : undefined)) : undefined,
      activityId: activityId || undefined,
      activityName: activityId ? (activity?.name ?? (sameActivity ? original?.activityName : undefined)) : undefined,
    });
  }
}
