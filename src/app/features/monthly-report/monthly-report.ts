import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EventService } from '../../core/services/event.service';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { CalendarEvent, CalendarEventInput } from '../../core/models/calendar-event.model';
import { THAI_MONTHS_FULL, THAI_WEEKDAYS_SHORT } from '../../core/models/status.constant';
import { toIsoDate, todayIso } from '../../shared/utils/date.util';
import { downloadBlob } from '../../shared/utils/file.util';
import { buildMonthGrid, CalendarDay, groupEventsByDate } from './calendar.util';
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
      <div class="max-w-6xl mx-auto flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="grow">
            <h1 class="text-xl font-bold text-slate-900">Monthly Report</h1>
            <p class="text-sm text-slate-500">กดที่ช่องวันเพื่อดู เพิ่ม แก้ไข หรือลบ Event ของวันนั้น</p>
          </div>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            (click)="fileInput.click()"
          >
            นำเข้า JSON
          </button>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            (click)="exportJson()"
          >
            ส่งออก JSON
          </button>
          <input #fileInput type="file" accept="application/json,.json" class="hidden" (change)="onFileSelected($event)" />
        </div>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              class="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              (click)="shiftMonth(-1)"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              class="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              (click)="shiftMonth(1)"
            >
              ›
            </button>
            <h2 class="ml-1 text-lg font-bold text-slate-900" aria-live="polite">{{ monthTitle() }}</h2>
            <button
              type="button"
              class="ml-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-blue-600 hover:bg-blue-50"
              (click)="goToToday()"
            >
              วันนี้
            </button>
            <div class="grow"></div>
            <span class="text-sm text-slate-500">เดือนนี้ {{ monthEventCount() }} Event</span>
          </div>

          <div class="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            @for (w of weekdays; track $index) {
              <div class="py-2 text-center text-xs font-bold text-slate-500">{{ w }}</div>
            }
          </div>

          @for (week of weeks(); track $index) {
            <div class="grid grid-cols-7">
              @for (day of week; track day.iso; let col = $index) {
                <div
                  class="min-h-28 p-1.5 flex flex-col gap-1 cursor-pointer border-t border-slate-100 hover:bg-blue-50/50"
                  [class]="(col > 0 ? 'border-l ' : '') + (day.inMonth ? '' : 'bg-slate-50/70')"
                  (click)="openDay(day.iso)"
                >
                  <div>
                    <button
                      type="button"
                      class="w-7 h-7 rounded-full text-sm font-semibold"
                      [class]="dayNumberClass(day)"
                      [attr.aria-label]="'ดู Event ของวันที่ ' + day.day + ' ' + monthTitle()"
                      [attr.aria-current]="day.iso === today ? 'date' : null"
                      (click)="openDay(day.iso); $event.stopPropagation()"
                    >
                      {{ day.day }}
                    </button>
                  </div>

                  @for (e of shownEvents(day.iso); track e.id) {
                    <div
                      class="truncate rounded px-1.5 py-0.5 text-[11px] leading-tight"
                      [class]="e.projectId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'"
                      [title]="e.startTime + ' – ' + e.endTime + '  ' + e.title"
                    >
                      <span class="font-semibold tabular-nums">{{ e.startTime }}</span> {{ e.title }}
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

        <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-blue-100"></span>เชื่อมโยงกับโครงการแล้ว</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-slate-100 border border-slate-200"></span>ไม่ได้เชื่อมโยง</span>
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
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] p-4">
        <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
          <h2 class="text-lg font-bold text-slate-900">นำเข้า Event จาก JSON</h2>
          <p class="text-sm text-slate-600">
            พบ {{ importPending()!.length }} Event ในไฟล์ ต้องการแทนที่ Event เดิมทั้งหมด หรือผสานเข้ากับ Event ที่มีอยู่?
          </p>
          <div class="flex flex-col gap-2">
            <button type="button" class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="confirmImport('merge')">
              ผสานกับข้อมูลเดิม
            </button>
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="confirmImport('replace')">
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

  private eventsByDate = computed(() => groupEventsByDate(this.eventService.events()));

  monthEventCount = computed(() => {
    const prefix = toIsoDate(this.viewYear(), this.viewMonth(), 1).slice(0, 7);
    return this.eventService.events().filter((e) => e.date.startsWith(prefix)).length;
  });

  /** The events of the open day, each with what its project / activity link points at now. */
  dayViews = computed<EventView[]>(() => {
    const date = this.dayOpen();
    return (date ? (this.eventsByDate().get(date) ?? []) : []).map((event) => this.toView(event));
  });

  shownEvents(iso: string): CalendarEvent[] {
    return (this.eventsByDate().get(iso) ?? []).slice(0, MAX_EVENTS_IN_CELL);
  }

  hiddenCount(iso: string): number {
    return Math.max(0, (this.eventsByDate().get(iso)?.length ?? 0) - MAX_EVENTS_IN_CELL);
  }

  dayNumberClass(day: CalendarDay): string {
    if (day.iso === this.today) return 'bg-blue-600 text-white';
    return day.inMonth ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-100';
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
    // Show the day the event ended up on, in case it was moved.
    if (this.dayOpen()) this.dayOpen.set(input.date);
    this.closeForm();
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
