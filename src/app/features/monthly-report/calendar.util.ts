import { CalendarEvent } from '../../core/models/calendar-event.model';
import { eventPriority, EVENT_PRIORITY_LIST, THAI_MONTHS, THAI_MONTHS_FULL } from '../../core/models/status.constant';
import { daysInMonth, parseIsoDate, toIsoDate } from '../../shared/utils/date.util';

export interface CalendarDay {
  iso: string;
  day: number;
  /** False for the days of the neighbouring months that fill out the first and last week. */
  inMonth: boolean;
}

const WEEKDAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** The weeks (Sunday first) that make up a month; `month` is 0-based. */
export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  const leading = new Date(year, month, 1).getDay();
  const weekCount = Math.ceil((leading + daysInMonth(year, month)) / 7);
  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(year, month, week * 7 + weekday - leading + 1);
      return {
        iso: toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
      };
    }),
  );
}

/** The day after `iso`. */
function nextDay(iso: string): string {
  const p = parseIsoDate(iso)!;
  const d = new Date(p.year, p.month, p.day + 1);
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

/** By priority (ด่วน, งานแทรก, ปกติ, ไม่ด่วน), then the earlier start, then title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  const rank = (e: CalendarEvent) => EVENT_PRIORITY_LIST.indexOf(eventPriority(e));
  return rank(a) - rank(b) || a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'th');
}

/** Whether the event covers the day (start and end days included). */
export function eventCoversDay(event: CalendarEvent, iso: string): boolean {
  return event.startDate <= iso && iso <= event.endDate;
}

/** Whether the event covers any day from `from` to `to`. */
export function eventOverlaps(event: CalendarEvent, from: string, to: string): boolean {
  return event.startDate <= to && event.endDate >= from;
}

/** The events of one day, in order. */
export function eventsOnDay(events: CalendarEvent[], iso: string): CalendarEvent[] {
  return events.filter((e) => eventCoversDay(e, iso)).sort(compareEvents);
}

/**
 * The events of each day from `from` to `to`, in order. An event that spans several days is listed on
 * each of them; days outside the range are left out so a long event does not fill in months not shown.
 */
export function groupEventsByDate(events: CalendarEvent[], from: string, to: string): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort(compareEvents)) {
    if (!eventOverlaps(event, from, to)) continue;
    const last = event.endDate < to ? event.endDate : to;
    for (let day = event.startDate > from ? event.startDate : from; day <= last; day = nextDay(day)) {
      const list = byDate.get(day);
      if (list) list.push(event);
      else byDate.set(day, [event]);
    }
  }
  return byDate;
}

/** e.g. "24 ก.ย. 69" */
function formatShort(iso: string): string {
  const p = parseIsoDate(iso);
  return p ? `${p.day} ${THAI_MONTHS[p.month]} ${String((p.year + 543) % 100).padStart(2, '0')}` : '';
}

/** e.g. "24 ก.ย. 69 – 2 ต.ค. 69"; just the one day when the event does not span several. */
export function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatShort(startDate) : `${formatShort(startDate)} – ${formatShort(endDate)}`;
}

/** How many days the event covers, both ends included. */
export function eventDayCount(event: Pick<CalendarEvent, 'startDate' | 'endDate'>): number {
  const a = parseIsoDate(event.startDate);
  const b = parseIsoDate(event.endDate);
  if (!a || !b) return 1;
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000) + 1;
}

/** e.g. "วันพฤหัสบดีที่ 17 กันยายน 2569" */
export function formatWeekdayDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `วัน${WEEKDAYS_FULL[new Date(p.year, p.month, p.day).getDay()]}ที่ ${p.day} ${THAI_MONTHS_FULL[p.month]} ${p.year + 543}`;
}
