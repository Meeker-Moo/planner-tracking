import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EventService } from '../../core/services/event.service';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { CalendarEvent, CalendarEventInput } from '../../core/models/calendar-event.model';
import {
  EVENT_PRIORITY_LIST,
  eventPriority,
  PriorityMeta,
  THAI_MONTHS_FULL,
  THAI_WEEKDAYS_SHORT,
} from '../../core/models/status.constant';
import { monthEndIso, toIsoDate, todayIso } from '../../shared/utils/date.util';
import { downloadBlob } from '../../shared/utils/file.util';
import { buildMonthGrid, CalendarDay, eventDayCount, eventOverlaps, eventsOnDay, formatDateRange, groupEventsByDate } from './calendar.util';
import { parseEventsFile, serializeEvents } from './event-file.util';
import { DayEventsDialog, EventView } from './day-events-dialog';
import { EventFormDialog } from './event-form-dialog';

/** How many events a day cell lists before it says "+N more". */
const MAX_EVENTS_IN_CELL = 3;

/** A calendar, one month at a time: click a day to see, add, edit and delete its events. */
@Component({
  selector: 'app-monthly-report',
  standalone: true,
  imports: [Toolbar, ConfirmDialog, DayEventsDialog, EventFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar [showActions]="false" [showYear]="false" />

    <div class="grow overflow-auto p-4 md:p-8">
      <div class="max-w-6xl mx-auto flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-3 grow">
            <div
              class="w-11 h-11 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15" rx="3" />
                <path d="M3.5 10h17M8 3v4M16 3v4" stroke-linecap="round" />
              </svg>
            </div>
            <div>
              <h1 class="text-xl font-bold text-slate-900">Monthly Report</h1>
              <p class="text-sm text-slate-500">กดที่ช่องวันเพื่อดู เพิ่ม แก้ไข หรือลบ Event ของวันนั้น</p>
            </div>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            (click)="fileInput.click()"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M10 13V3M6 7l4-4 4 4M4 13v2.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V13" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            นำเข้า JSON
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            (click)="exportJson()"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M10 3v10M6 9l4 4 4-4M4 13v2.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V13" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            ส่งออก JSON
          </button>
          <input #fileInput type="file" accept="application/json,.json" class="hidden" (change)="onFileSelected($event)" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
            <div class="text-xs font-semibold text-slate-500">Event เดือนนี้</div>
            <div class="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{{ monthEvents().length }}</div>
            <div class="text-xs text-slate-400">{{ monthTitle() }}</div>
          </div>
          <div class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
            <div class="flex items-baseline justify-between">
              <span class="text-xs font-semibold text-slate-500">ทำแล้ว</span>
              <span class="text-xs font-semibold text-emerald-600 tabular-nums">{{ donePercent() }}%</span>
            </div>
            <div class="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
              {{ monthDoneCount() }}<span class="text-base font-semibold text-slate-400"> / {{ monthEvents().length }}</span>
            </div>
            <div class="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 transition-all" [style.width.%]="donePercent()"></div>
            </div>
          </div>
          <div class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
            <div class="text-xs font-semibold text-slate-500">ยังไม่ทำ แยกตาม Priority</div>
            <div class="mt-2 grid grid-cols-4 gap-1.5">
              @for (p of pendingByPriority(); track p.meta.value) {
                <div class="rounded-xl px-1 py-1.5 text-center" [style.background]="p.meta.bg" [style.color]="p.meta.text">
                  <div class="text-xl font-bold tabular-nums">{{ p.count }}</div>
                  <div class="text-[11px] font-semibold">{{ p.meta.label }}</div>
                </div>
              }
            </div>
          </div>
        </div>

        <section class="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
            <div class="flex items-center rounded-xl ring-1 ring-slate-200 overflow-hidden">
              <button
                type="button"
                aria-label="เดือนก่อนหน้า"
                class="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                (click)="shiftMonth(-1)"
              >
                <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12.5 4.5L7 10l5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                class="h-9 px-3 border-x border-slate-200 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                (click)="goToToday()"
              >
                วันนี้
              </button>
              <button
                type="button"
                aria-label="เดือนถัดไป"
                class="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                (click)="shiftMonth(1)"
              >
                <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M7.5 4.5L13 10l-5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
            <h2 class="ml-2 text-lg font-bold text-slate-900" aria-live="polite">{{ monthTitle() }}</h2>
          </div>

          <div class="grid grid-cols-7 bg-slate-50/80 border-b border-slate-100">
            @for (w of weekdays; track $index) {
              <div class="py-2.5 text-center text-xs font-bold" [class]="$index === 0 ? 'text-red-500' : 'text-slate-500'">{{ w }}</div>
            }
          </div>

          @for (week of weeks(); track $index) {
            <div class="grid grid-cols-7">
              @for (day of week; track day.iso; let col = $index) {
                <div
                  class="group min-h-32 p-1.5 flex flex-col gap-1 cursor-pointer border-t border-slate-100 transition-colors hover:bg-blue-50/60"
                  [class]="dayCellClass(day, col)"
                  (click)="openDay(day.iso)"
                >
                  <div class="flex items-center justify-between">
                    <button
                      type="button"
                      class="w-7 h-7 rounded-full text-sm font-semibold transition"
                      [class]="dayNumberClass(day, col)"
                      [attr.aria-label]="'ดู Event ของวันที่ ' + day.day + ' ' + monthTitle()"
                      [attr.aria-current]="day.iso === today ? 'date' : null"
                      (click)="openDay(day.iso); $event.stopPropagation()"
                    >
                      {{ day.day }}
                    </button>
                    <button
                      type="button"
                      class="w-6 h-6 rounded-lg flex items-center justify-center text-blue-600 bg-white ring-1 ring-blue-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-blue-600 hover:text-white transition"
                      [attr.aria-label]="'เพิ่ม Event วันที่ ' + day.day"
                      title="เพิ่ม Event"
                      (click)="openAddOn(day.iso); $event.stopPropagation()"
                    >
                      <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                        <path d="M10 4.5v11M4.5 10h11" stroke-linecap="round" />
                      </svg>
                    </button>
                  </div>

                  @for (e of shownEvents(day.iso); track e.id) {
                    @let p = priority(e);
                    <div
                      class="flex items-center gap-1 rounded-md pl-1 pr-1.5 py-0.5 text-[11px] leading-tight border-l-[3px]"
                      [style.border-left-color]="p.dot"
                      [style.background]="e.done ? '#F1F5F9' : p.bg"
                      [style.color]="e.done ? '#94A3B8' : p.text"
                      [title]="e.title + '  (' + p.label + (e.done ? ', ทำแล้ว' : '') + (isMultiDay(e) ? ', ' + range(e) : '') + ')'"
                    >
                      @if (e.done) {
                        <svg viewBox="0 0 20 20" class="w-3 h-3 shrink-0 text-emerald-500" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                          <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      }
                      <span class="truncate" [class.line-through]="e.done">
                        {{ e.title }}
                      </span>
                      @if (isMultiDay(e)) {
                        <svg viewBox="0 0 20 20" class="w-3 h-3 shrink-0 ml-auto opacity-60" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M3 10h14M6.5 6.5L3 10l3.5 3.5M13.5 6.5L17 10l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      }
                      @if (e.projectId) {
                        <svg viewBox="0 0 20 20" class="w-3 h-3 shrink-0 opacity-60" [class.ml-auto]="!isMultiDay(e)" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path
                            d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l.9-.9"
                            stroke-linecap="round"
                          />
                        </svg>
                      }
                    </div>
                  }
                  @if (hiddenCount(day.iso) > 0) {
                    <div class="px-1 text-[11px] font-semibold text-blue-600">+{{ hiddenCount(day.iso) }} รายการ</div>
                  }
                </div>
              }
            </div>
          }
        </section>

        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span class="font-semibold text-slate-600">Priority:</span>
          @for (p of priorities; track p.value) {
            <span class="flex items-center gap-1.5">
              <span class="w-4 h-3 rounded-sm border-l-[3px]" [style.background]="p.bg" [style.border-left-color]="p.dot"></span>{{ p.label }}
            </span>
          }
          <span><span class="line-through text-slate-400">ขีดฆ่า</span> = ทำแล้ว</span>
          <span class="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 10h14M6.5 6.5L3 10l3.5 3.5M13.5 6.5L17 10l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Event หลายวัน
          </span>
          <span class="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l.9-.9" stroke-linecap="round" />
            </svg>
            เชื่อมโยงกับโครงการแล้ว
          </span>
        </div>
      </div>
    </div>

    <app-day-events-dialog
      [open]="dayOpen() !== null"
      [date]="dayOpen() ?? ''"
      [views]="dayViews()"
      (add)="openAdd()"
      (edit)="openEdit($event)"
      (remove)="deleteTarget.set($event)"
      (toggleDone)="toggleDone($event)"
      (close)="dayOpen.set(null)"
    />

    <app-event-form-dialog
      [open]="formOpen()"
      [editing]="editingEvent()"
      [defaultDate]="formDate()"
      [projects]="workPlanService.plans()"
      (save)="onSaveEvent($event)"
      (cancel)="closeForm()"
    />

    <app-confirm-dialog
      [open]="deleteTarget() !== null"
      title="ลบ Event"
      [message]="'ต้องการลบ Event &quot;' + (deleteTarget()?.title ?? '') + '&quot; หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้'"
      confirmText="ลบ"
      (confirm)="confirmDelete()"
      (cancel)="deleteTarget.set(null)"
    />

    @if (importPending()) {
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-70 p-4">
        <div class="w-full max-w-sm bg-white rounded-3xl shadow-2xl ring-1 ring-slate-900/5 p-6 flex flex-col gap-4">
          <h2 class="text-lg font-bold text-slate-900">นำเข้า Event จาก JSON</h2>
          <p class="text-sm text-slate-600">
            พบ {{ importPending()!.length }} Event ในไฟล์ ต้องการแทนที่ Event เดิมทั้งหมด หรือผสานเข้ากับ Event ที่มีอยู่?
          </p>
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700"
              (click)="confirmImport('merge')"
            >
              ผสานกับข้อมูลเดิม
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              (click)="confirmImport('replace')"
            >
              แทนที่ทั้งหมด
            </button>
            <button type="button" class="px-4 py-2.5 text-sm font-semibold text-slate-500" (click)="importPending.set(null)">ยกเลิก</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MonthlyReport {
  private readonly eventService = inject(EventService);
  readonly workPlanService = inject(WorkPlanService);

  readonly weekdays = THAI_WEEKDAYS_SHORT;
  readonly priorities = EVENT_PRIORITY_LIST;
  readonly today = todayIso();

  private readonly now = new Date();
  viewYear = signal(this.now.getFullYear());
  viewMonth = signal(this.now.getMonth()); // 0-based

  dayOpen = signal<string | null>(null);
  formOpen = signal(false);
  editingEvent = signal<CalendarEvent | null>(null);
  formDate = signal('');
  deleteTarget = signal<CalendarEvent | null>(null);
  importPending = signal<CalendarEvent[] | null>(null);

  weeks = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  monthTitle = computed(() => `${THAI_MONTHS_FULL[this.viewMonth()]} ${this.viewYear() + 543}`);

  /** The events of each day shown on the grid, including the neighbouring months' days. */
  private eventsByDate = computed(() => {
    const days = this.weeks().flat();
    return groupEventsByDate(this.eventService.events(), days[0].iso, days[days.length - 1].iso);
  });

  /** Events that cover at least one day of the month shown. */
  monthEvents = computed(() => {
    const first = toIsoDate(this.viewYear(), this.viewMonth(), 1);
    return this.eventService.events().filter((e) => eventOverlaps(e, first, monthEndIso(first)));
  });

  monthDoneCount = computed(() => this.monthEvents().filter((e) => e.done).length);

  donePercent = computed(() => {
    const total = this.monthEvents().length;
    return total ? Math.round((this.monthDoneCount() / total) * 100) : 0;
  });

  /** This month's events that are not done yet, counted per priority (highest first). */
  pendingByPriority = computed(() => {
    const pending = this.monthEvents().filter((e) => !e.done);
    return EVENT_PRIORITY_LIST.map((meta) => ({ meta, count: pending.filter((e) => eventPriority(e) === meta).length }));
  });

  /** The events of the open day, each with what its project / activity link points at now. */
  dayViews = computed<EventView[]>(() => {
    const date = this.dayOpen();
    return (date ? eventsOnDay(this.eventService.events(), date) : []).map((event) => this.toView(event));
  });

  shownEvents(iso: string): CalendarEvent[] {
    return (this.eventsByDate().get(iso) ?? []).slice(0, MAX_EVENTS_IN_CELL);
  }

  hiddenCount(iso: string): number {
    return Math.max(0, (this.eventsByDate().get(iso)?.length ?? 0) - MAX_EVENTS_IN_CELL);
  }

  priority(event: CalendarEvent): PriorityMeta {
    return eventPriority(event);
  }

  isMultiDay(event: CalendarEvent): boolean {
    return eventDayCount(event) > 1;
  }

  range(event: CalendarEvent): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  dayCellClass(day: CalendarDay, col: number): string {
    const border = col > 0 ? 'border-l ' : '';
    if (day.iso === this.today) return border + 'bg-blue-50/40';
    return border + (day.inMonth ? '' : 'bg-slate-50/70');
  }

  dayNumberClass(day: CalendarDay, col: number): string {
    if (day.iso === this.today) return 'bg-blue-600 text-white shadow-sm shadow-blue-600/40';
    if (!day.inMonth) return 'text-slate-300 hover:bg-slate-100';
    return col === 0 ? 'text-red-500 hover:bg-red-50' : 'text-slate-800 hover:bg-slate-100';
  }

  shiftMonth(delta: number): void {
    const d = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(d.getFullYear());
    this.viewMonth.set(d.getMonth());
  }

  goToToday(): void {
    const d = new Date();
    this.viewYear.set(d.getFullYear());
    this.viewMonth.set(d.getMonth());
  }

  openDay(iso: string): void {
    this.dayOpen.set(iso);
  }

  openAdd(): void {
    this.editingEvent.set(null);
    this.formDate.set(this.dayOpen() ?? this.today);
    this.formOpen.set(true);
  }

  /** Straight to the add form for a day, without opening the day's list first. */
  openAddOn(iso: string): void {
    this.editingEvent.set(null);
    this.formDate.set(iso);
    this.formOpen.set(true);
  }

  openEdit(event: CalendarEvent): void {
    this.editingEvent.set(event);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingEvent.set(null);
  }

  onSaveEvent(input: CalendarEventInput): void {
    const editing = this.editingEvent();
    if (editing) {
      this.eventService.update(editing.id, input);
    } else {
      this.eventService.add(input);
    }
    // Keep showing the open day if the event still covers it, otherwise follow the event to its first day.
    const open = this.dayOpen();
    if (open && (open < input.startDate || open > input.endDate)) this.dayOpen.set(input.startDate);
    this.closeForm();
  }

  toggleDone(event: CalendarEvent): void {
    this.eventService.setDone(event.id, !event.done);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target) this.eventService.delete(target.id);
    this.deleteTarget.set(null);
  }

  exportJson(): void {
    const blob = new Blob([serializeEvents(this.eventService.events())], { type: 'application/json' });
    downloadBlob(blob, `monthly-report-events-${this.today}.json`);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.importPending.set(parseEventsFile(await file.text()));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'นำเข้าไฟล์ไม่สำเร็จ');
    }
  }

  confirmImport(mode: 'merge' | 'replace'): void {
    const events = this.importPending();
    if (!events) return;
    if (mode === 'replace') {
      this.eventService.replaceAll(events);
    } else {
      this.eventService.mergeAll(events);
    }
    this.importPending.set(null);
  }

  private toView(event: CalendarEvent): EventView {
    const project = this.workPlanService.plans().find((p) => p.id === event.projectId);
    const activity = project?.activities?.find((a) => a.id === event.activityId);
    return {
      event,
      projectLabel: event.projectId ? (project?.name ?? event.projectName ?? 'โครงการที่ไม่พบในระบบ') : null,
      activityLabel: event.activityId ? (activity?.name ?? event.activityName ?? 'กิจกรรมที่ไม่พบในระบบ') : null,
      projectLink: project ? ['/plans', project.id] : null,
      projectMissing: !!event.projectId && !project,
    };
  }
}
