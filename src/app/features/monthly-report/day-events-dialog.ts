import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { eventPriority, PriorityMeta } from '../../core/models/status.constant';
import { eventDayCount, formatDateRange, formatWeekdayDate } from './calendar.util';

/** An event together with what its project / activity link resolves to right now. */
export interface EventView {
  event: CalendarEvent;
  projectLabel: string | null;
  activityLabel: string | null;
  /** Route to the project page; null when unlinked or the project no longer exists. */
  projectLink: string[] | null;
  projectMissing: boolean;
}

/** The events of one day, with add / edit / delete and marking them done. */
@Component({
  selector: 'app-day-events-dialog',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div
          role="dialog"
          aria-modal="true"
          class="w-full max-w-xl max-h-[90vh] bg-white rounded-3xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
        >
          <div class="px-6 pt-5 pb-4 bg-linear-to-br from-blue-600 to-indigo-600 text-white shrink-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-xs font-medium text-blue-100">Event ประจำวัน</div>
                <div class="text-lg font-bold">{{ heading() }}</div>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                class="w-8 h-8 shrink-0 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                (click)="close.emit()"
              >
                <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            @if (views().length > 0) {
              <div class="mt-3 flex items-center gap-3">
                <div class="grow h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div class="h-full rounded-full bg-white transition-all" [style.width.%]="donePercent()"></div>
                </div>
                <span class="text-xs font-semibold tabular-nums">ทำแล้ว {{ doneCount() }}/{{ views().length }}</span>
              </div>
            }
          </div>

          <div class="p-5 flex flex-col gap-3 overflow-y-auto bg-slate-50/60">
            @for (v of views(); track v.event.id) {
              @let p = priority(v.event);
              <article
                class="group relative bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 pl-4 pr-3 py-3.5 flex gap-3 overflow-hidden transition hover:shadow-md"
                [class.opacity-70]="v.event.done"
              >
                <span class="absolute left-0 inset-y-0 w-1.5" [style.background]="p.dot" aria-hidden="true"></span>

                <button
                  type="button"
                  role="checkbox"
                  class="mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition"
                  [class]="v.event.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-300'"
                  [attr.aria-checked]="!!v.event.done"
                  [attr.aria-label]="'ทำแล้ว: ' + v.event.title"
                  [title]="v.event.done ? 'ยกเลิกสถานะทำแล้ว' : 'ทำเครื่องหมายว่าทำแล้ว'"
                  (click)="toggleDone.emit(v.event)"
                >
                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>

                <div class="min-w-0 grow flex flex-col gap-1.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      [style.background]="p.bg"
                      [style.color]="p.text"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" [style.background]="p.dot"></span>
                      {{ p.label }}
                    </span>
                    @if (v.event.done) {
                      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">ทำแล้ว</span>
                    }
                    @if (dayCount(v.event) > 1) {
                      <span class="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
                          <path d="M3 8.5h14M7 3v3M13 3v3" stroke-linecap="round" />
                        </svg>
                        {{ range(v.event) }} ({{ dayCount(v.event) }} วัน)
                      </span>
                    }
                  </div>
                  <h3
                    class="text-sm font-bold wrap-break-word"
                    [class]="v.event.done ? 'line-through text-slate-400' : 'text-slate-900'"
                  >
                    {{ v.event.title }}
                  </h3>

                  @if (v.event.description) {
                    <p class="text-sm whitespace-pre-line" [class]="v.event.done ? 'text-slate-400 line-through' : 'text-slate-600'">
                      {{ v.event.description }}
                    </p>
                  }

                  @if (v.projectLabel) {
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l.9-.9" stroke-linecap="round" />
                      </svg>
                      @if (v.projectLink) {
                        <a [routerLink]="v.projectLink" class="font-semibold text-blue-600 hover:underline">{{ v.projectLabel }}</a>
                      } @else {
                        <span class="font-semibold">{{ v.projectLabel }}</span>
                      }
                      @if (v.activityLabel) {
                        <span class="text-slate-400">›</span>
                        <span>{{ v.activityLabel }}</span>
                      }
                      @if (v.projectMissing) {
                        <span class="text-amber-700">(ไม่พบโครงการนี้ในระบบ)</span>
                      }
                    </div>
                  }
                </div>

                <div class="flex gap-0.5 shrink-0 self-start">
                  <button
                    type="button"
                    class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    [attr.aria-label]="'แก้ไข ' + v.event.title"
                    title="แก้ไข"
                    (click)="edit.emit(v.event)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
                    [attr.aria-label]="'ลบ ' + v.event.title"
                    title="ลบ"
                    (click)="remove.emit(v.event)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>
              </article>
            } @empty {
              <div class="py-10 flex flex-col items-center gap-2 text-slate-400">
                <svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="15" rx="3" />
                  <path d="M3.5 10h17M8 3v4M16 3v4" stroke-linecap="round" />
                </svg>
                <p class="text-sm">ยังไม่มี Event ในวันนี้</p>
              </div>
            }
          </div>

          <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-white">
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              (click)="close.emit()"
            >
              ปิด
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700"
              (click)="add.emit()"
            >
              + เพิ่ม Event
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DayEventsDialog {
  open = input(false);
  /** The day shown, yyyy-MM-dd. */
  date = input('');
  /** That day's events, most pressing first. */
  views = input<EventView[]>([]);

  add = output<void>();
  edit = output<CalendarEvent>();
  remove = output<CalendarEvent>();
  toggleDone = output<CalendarEvent>();
  close = output<void>();

  heading = () => formatWeekdayDate(this.date());

  doneCount = computed(() => this.views().filter((v) => v.event.done).length);
  donePercent = computed(() => (this.views().length ? (this.doneCount() / this.views().length) * 100 : 0));

  priority(event: CalendarEvent): PriorityMeta {
    return eventPriority(event);
  }

  range(event: CalendarEvent): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  dayCount(event: CalendarEvent): number {
    return eventDayCount(event);
  }
}
