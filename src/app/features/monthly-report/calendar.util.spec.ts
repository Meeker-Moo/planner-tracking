import { CalendarEvent, EventPriority } from '../../core/models/calendar-event.model';
import {
  buildMonthGrid,
  compareEvents,
  eventDayCount,
  eventsOnDay,
  formatDateRange,
  formatWeekdayDate,
  groupEventsByDate,
} from './calendar.util';

function event(id: string, startDate: string, priority?: EventPriority, endDate = startDate, title = id): CalendarEvent {
  return { id, startDate, endDate, title, priority, createdAt: '', updatedAt: '' };
}

describe('buildMonthGrid', () => {
  it('lays September 2026 (starts on a Tuesday) out in 5 weeks, Sunday first', () => {
    const weeks = buildMonthGrid(2026, 8);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // the first week starts on Sunday 30 August and 1 September is the third cell
    expect(weeks[0][0]).toEqual({ iso: '2026-08-30', day: 30, inMonth: false });
    expect(weeks[0][2]).toEqual({ iso: '2026-09-01', day: 1, inMonth: true });
    // the last week runs to Saturday 3 October
    expect(weeks[4][6]).toEqual({ iso: '2026-10-03', day: 3, inMonth: false });
  });

  it('has every day of the month exactly once', () => {
    const inMonth = buildMonthGrid(2026, 8).flat().filter((d) => d.inMonth);
    expect(inMonth.map((d) => d.day)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('needs only 4 weeks for a February that starts on Sunday, and 6 for a long month that starts late', () => {
    expect(buildMonthGrid(2026, 1)).toHaveLength(4); // 1 Feb 2026 is a Sunday
    expect(buildMonthGrid(2026, 7)).toHaveLength(6); // 1 Aug 2026 is a Saturday, 31 days
  });

  it('crosses a year end', () => {
    const weeks = buildMonthGrid(2026, 11);
    expect(weeks.flat().some((d) => d.iso === '2027-01-01' && !d.inMonth)).toBe(true);
  });
});

describe('events order', () => {
  it('sorts ด่วน, งานแทรก, ปกติ, ไม่ด่วน, treating a missing priority as ปกติ', () => {
    const sorted = [
      event('low', '2026-09-17', 'low'),
      event('none', '2026-09-17'),
      event('adhoc', '2026-09-17', 'adhoc'),
      event('urgent', '2026-09-17', 'urgent'),
    ].sort(compareEvents);
    expect(sorted.map((e) => e.id)).toEqual(['urgent', 'adhoc', 'none', 'low']);
  });

  it('breaks a tie by the earlier start, then title', () => {
    const sorted = [
      event('c', '2026-09-17', 'normal', '2026-09-17', 'ข'),
      event('b', '2026-09-17', 'normal', '2026-09-17', 'ก'),
      event('a', '2026-09-15', 'normal'),
    ].sort(compareEvents);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('groups by date, listing a multi-day event on every day it covers', () => {
    const grouped = groupEventsByDate(
      [event('trip', '2026-09-16', 'low', '2026-09-18'), event('fire', '2026-09-17', 'urgent'), event('other', '2026-09-20', 'normal')],
      '2026-08-30',
      '2026-10-03',
    );
    expect(grouped.get('2026-09-16')?.map((e) => e.id)).toEqual(['trip']);
    expect(grouped.get('2026-09-17')?.map((e) => e.id)).toEqual(['fire', 'trip']);
    expect(grouped.get('2026-09-18')?.map((e) => e.id)).toEqual(['trip']);
    expect(grouped.get('2026-09-19')).toBeUndefined();
    expect(grouped.get('2026-09-20')?.map((e) => e.id)).toEqual(['other']);
  });

  it('only fills in the days asked for, across a month end', () => {
    const grouped = groupEventsByDate([event('long', '2026-01-01', 'normal', '2026-12-31')], '2026-09-29', '2026-10-02');
    expect([...grouped.keys()]).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('finds the events of one day', () => {
    const events = [event('trip', '2026-09-16', 'low', '2026-09-18'), event('fire', '2026-09-17', 'urgent'), event('later', '2026-09-19')];
    expect(eventsOnDay(events, '2026-09-18').map((e) => e.id)).toEqual(['trip']);
    expect(eventsOnDay(events, '2026-09-17').map((e) => e.id)).toEqual(['fire', 'trip']);
  });
});

describe('date ranges', () => {
  it('counts the days with both ends included, across a month end', () => {
    expect(eventDayCount({ startDate: '2026-09-17', endDate: '2026-09-17' })).toBe(1);
    expect(eventDayCount({ startDate: '2026-09-29', endDate: '2026-10-02' })).toBe(4);
  });

  it('formats one day or a range', () => {
    expect(formatDateRange('2026-09-17', '2026-09-17')).toBe('17 ก.ย. 69');
    expect(formatDateRange('2026-09-29', '2026-10-02')).toBe('29 ก.ย. 69 – 2 ต.ค. 69');
  });
});

describe('formatWeekdayDate', () => {
  it('names the weekday with a Buddhist year', () => {
    expect(formatWeekdayDate('2026-09-17')).toBe('วันพฤหัสบดีที่ 17 กันยายน 2569');
    expect(formatWeekdayDate('2026-09-20')).toBe('วันอาทิตย์ที่ 20 กันยายน 2569');
    expect(formatWeekdayDate('')).toBe('');
  });
});
