import { Activity, WorkPlan, WorkStatus } from '../../core/models/work-plan.model';
import {
  buildActivityTimeline,
  countByStatus,
  daysBetween,
  filterActivities,
  groupByStartQuarter,
  quarterOf,
  quartersOf,
  scheduleNote,
  sortActivities,
} from './project-detail.util';

function activity(name: string, startDate: string, endDate: string, status: WorkStatus = 'planned'): Activity {
  return { id: name, name, startDate, endDate, status };
}

// November 2025 – February 2026: fiscal year 2569, quarters 1 and 2.
const project: WorkPlan = {
  id: 'p',
  year: 2569,
  name: 'โครงการ',
  type: '',
  responsible: '',
  startDate: '2025-11-01',
  endDate: '2026-02-28',
  status: 'in-progress',
  createdAt: '',
  updatedAt: '',
};

const nov = activity('พ.ย.', '2025-11-01', '2025-11-30', 'completed');
const decJan = activity('ธ.ค.–ม.ค.', '2025-12-16', '2026-01-15', 'in-progress');
const feb = activity('ก.พ.', '2026-02-01', '2026-02-28');

describe('daysBetween', () => {
  it('counts whole days either way, across months', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(daysBetween('2026-02-02', '2026-01-30')).toBe(-3);
    expect(daysBetween('bad', '2026-01-01')).toBeNull();
  });
});

describe('quarters', () => {
  it('finds the fiscal quarter of a date', () => {
    expect(quarterOf('2025-10-01')).toEqual({ fiscalYear: 2569, quarter: 1 });
    expect(quarterOf('2026-01-31')).toEqual({ fiscalYear: 2569, quarter: 2 });
    expect(quarterOf('2026-09-30')).toEqual({ fiscalYear: 2569, quarter: 4 });
    expect(quarterOf('')).toBeNull();
  });

  it('lists every quarter the project or an activity runs in, across fiscal years', () => {
    const late = activity('ต่อปีหน้า', '2026-09-01', '2026-10-15');
    expect(quartersOf(project, [nov, late]).map((q) => q.key)).toEqual(['2569-1', '2569-2', '2569-4', '2570-1']);
    expect(quartersOf(project, [])[1].label).toBe('ไตรมาส 2/2569 (ม.ค. – มี.ค. 2569)');
  });

  it('filters by status and by the quarters an activity runs in', () => {
    const all = [nov, decJan, feb];
    expect(filterActivities(all, { status: null, quarter: '2569-2' }).map((a) => a.name)).toEqual(['ธ.ค.–ม.ค.', 'ก.พ.']);
    expect(filterActivities(all, { status: 'completed', quarter: null }).map((a) => a.name)).toEqual(['พ.ย.']);
    expect(filterActivities(all, { status: 'completed', quarter: '2569-2' })).toEqual([]);
  });

  it('groups activities by the quarter they start in, keeping their order', () => {
    const groups = groupByStartQuarter([nov, decJan, feb]);
    expect(groups.map((g) => [g.quarter?.key, g.activities.map((a) => a.name)])).toEqual([
      ['2569-1', ['พ.ย.', 'ธ.ค.–ม.ค.']],
      ['2569-2', ['ก.พ.']],
    ]);
  });
});

describe('sortActivities and countByStatus', () => {
  it('orders by start date without touching the input', () => {
    const input = [feb, nov, decJan];
    expect(sortActivities(input).map((a) => a.name)).toEqual(['พ.ย.', 'ธ.ค.–ม.ค.', 'ก.พ.']);
    expect(input[0]).toBe(feb);
  });

  it('counts each status', () => {
    expect(countByStatus([nov, decJan, feb])).toEqual({ planned: 1, 'in-progress': 1, completed: 1, delayed: 0, cancelled: 0 });
  });
});

describe('scheduleNote', () => {
  it('reads the time left from today', () => {
    expect(scheduleNote(project, '2025-10-20')).toEqual({ text: 'เริ่มในอีก 12 วัน', tone: 'info' });
    expect(scheduleNote(project, '2026-01-01')).toEqual({ text: 'เหลืออีก 58 วัน', tone: 'info' });
    expect(scheduleNote(project, '2026-02-20')).toEqual({ text: 'เหลืออีก 8 วัน', tone: 'warn' });
    expect(scheduleNote(project, '2026-02-28')).toEqual({ text: 'ครบกำหนดวันนี้', tone: 'warn' });
    expect(scheduleNote(project, '2026-03-05')).toEqual({ text: 'เลยกำหนด 5 วัน', tone: 'danger' });
  });

  it('does not count down for a finished or cancelled project', () => {
    expect(scheduleNote({ ...project, status: 'completed' }, '2026-03-05')?.text).toBe('เสร็จสิ้นแล้ว');
    expect(scheduleNote({ ...project, status: 'cancelled' }, '2026-01-01')?.text).toBe('ยกเลิกแล้ว');
  });
});

describe('buildActivityTimeline', () => {
  it('spans the months of the project and its activities, and places bars to the day', () => {
    const tl = buildActivityTimeline(project, [nov, decJan], '2026-01-01')!;
    expect(tl.months.map((m) => m.label)).toEqual(['พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.']);
    expect(tl.months[2].current).toBe(true);
    expect(tl.currentMonth).toBe(2);
    expect(tl.quarters).toEqual([
      { label: 'Q1 ปีงบ 69', months: 2 },
      { label: 'Q2 ปีงบ 69', months: 2 },
    ]);
    // The project fills the axis; November is its first quarter.
    expect(tl.rows[0].bar).toEqual({ left: 0, width: 100, elapsed: 0.5 });
    expect(tl.rows[1].bar).toEqual({ left: 0, width: 25, elapsed: 1 });
    // 16 December to 15 January: from the middle of month 2 to the middle of month 3.
    const bar = tl.rows[2].bar!;
    expect(bar.left).toBeCloseTo(((1 + 15 / 31) / 4) * 100);
    expect(bar.left + bar.width).toBeCloseTo(((2 + 15 / 31) / 4) * 100);
    expect(tl.today).toBe(50);
  });

  it('keeps the axis of every activity when only some are shown', () => {
    const tl = buildActivityTimeline({ ...project, endDate: '2025-11-30' }, [nov], '2025-11-01', [nov, feb])!;
    expect(tl.months).toHaveLength(4);
    expect(tl.rows.map((r) => r.name)).toEqual(['โครงการ', 'พ.ย.']);
  });

  it('has no today line outside the axis, and no bar for unreadable dates', () => {
    const tl = buildActivityTimeline(project, [activity('?', '', '')], '2027-01-01')!;
    expect(tl.today).toBeNull();
    expect(tl.currentMonth).toBeNull();
    expect(tl.rows[1].bar).toBeNull();
  });

  it('is nothing for a project without activities', () => {
    expect(buildActivityTimeline(project, [], '2026-01-01')).toBeNull();
  });
});
