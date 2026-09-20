import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { formatWeekdayDate } from './calendar.util';

/** An event together with what its project / activity link resolves to right now. */
export interface EventView {
  event: CalendarEvent;
  projectLabel: string | null;
  activityLabel: string | null;
  /** Route to the project page; null when unlinked or the project no longer exists. */
  projectLink: string[] | null;
  projectMissing: boolean;
}

/** The events of one day, with add / edit / delete. */
@Component({
  selector: 'app-day-events-dialog',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div class="min-w-0">
              <div class="text-xs font-semibold text-slate-500">Event ประจำวัน</div>
              <div class="text-lg font-bold text-slate-900">{{ heading() }}</div>
            </div>
            <button type="button" aria-label="ปิด" class="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-500 text-base" (click)="close.emit()">
              ×
            </button>
          </div>

          <div class="p-6 flex flex-col gap-3 overflow-y-auto">
            @for (v of views(); track v.event.id) {
              <article class="border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                <div class="flex items-start gap-3">
                  <div class="min-w-0 grow">
                    <div class="text-xs font-semibold text-blue-700 tabular-nums">{{ v.event.startTime }} – {{ v.event.endTime }}</div>
                    <h3 class="text-sm font-bold text-slate-900">{{ v.event.title }}</h3>
                  </div>
                  <div class="flex gap-1 shrink-0">
                    <button type="button" class="px-2 py-1 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="edit.emit(v.event)">แก้ไข</button>
                    <button type="button" class="px-2 py-1 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="remove.emit(v.event)">ลบ</button>
                  </div>
                </div>

                @if (v.event.description) {
                  <p class="text-sm text-slate-700 whitespace-pre-line">{{ v.event.description }}</p>
                }

                @if (v.projectLabel) {
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <span aria-hidden="true">🔗</span>
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
              </article>
            } @empty {
              <p class="py-8 text-center text-sm text-slate-400">ยังไม่มี Event ในวันนี้</p>
            }
          </div>

          <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="close.emit()">
              ปิด
            </button>
            <button type="button" class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="add.emit()">
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
  /** That day's events in time order. */
  views = input<EventView[]>([]);

  add = output<void>();
  edit = output<CalendarEvent>();
  remove = output<CalendarEvent>();
  close = output<void>();

  heading = () => formatWeekdayDate(this.date());
}
