import { CalendarEvent } from '../../core/models/calendar-event.model';
import { THAI_MONTHS_FULL } from '../../core/models/status.constant';
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

/** Earliest first: by start time, then end time, then title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.title.localeCompare(b.title, 'th');
}

/** The events of each day, in time order. */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort(compareEvents)) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }
  return byDate;
}

/** e.g. "วันพฤหัสบดีที่ 17 กันยายน 2569" */
export function formatWeekdayDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `วัน${WEEKDAYS_FULL[new Date(p.year, p.month, p.day).getDay()]}ที่ ${p.day} ${THAI_MONTHS_FULL[p.month]} ${p.year + 543}`;
}
