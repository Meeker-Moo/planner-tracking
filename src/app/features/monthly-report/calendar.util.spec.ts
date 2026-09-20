import { CalendarEvent } from '../../core/models/calendar-event.model';
import { buildMonthGrid, compareEvents, formatWeekdayDate, groupEventsByDate } from './calendar.util';

function event(id: string, date: string, startTime: string, endTime = '23:00', title = id): CalendarEvent {
  return { id, date, startTime, endTime, title, createdAt: '', updatedAt: '' };
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
  it('sorts by start time, then end time, then title', () => {
    const sorted = [event('c', '2026-09-17', '10:00', '11:00', 'ข'), event('a', '2026-09-17', '09:00'), event('b', '2026-09-17', '10:00', '10:30', 'ก')].sort(
      compareEvents,
    );
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('groups by date with each day in time order', () => {
    const grouped = groupEventsByDate([event('late', '2026-09-17', '15:00'), event('other', '2026-09-18', '08:00'), event('early', '2026-09-17', '08:00')]);
    expect(grouped.get('2026-09-17')?.map((e) => e.id)).toEqual(['early', 'late']);
    expect(grouped.get('2026-09-18')?.map((e) => e.id)).toEqual(['other']);
    expect(grouped.get('2026-09-19')).toBeUndefined();
  });
});

describe('formatWeekdayDate', () => {
  it('names the weekday with a Buddhist year', () => {
    expect(formatWeekdayDate('2026-09-17')).toBe('วันพฤหัสบดีที่ 17 กันยายน 2569');
    expect(formatWeekdayDate('2026-09-20')).toBe('วันอาทิตย์ที่ 20 กันยายน 2569');
    expect(formatWeekdayDate('')).toBe('');
  });
});
