import { THAI_MONTHS } from '../../core/models/status.constant';
import { Activity, WorkPlan, WorkStatus } from '../../core/models/work-plan.model';
import { daysInMonth, overlapsQuarter, parseIsoDate, quarterMonthsLabel } from '../../shared/utils/date.util';

/** A quarter of a fiscal year, e.g. the second quarter of 2569 (January–March 2026). */
export interface FiscalQuarter {
  /** "2569-2"; what the quarter filter holds. */
  key: string;
  fiscalYear: number;
  quarter: number;
  /** "ไตรมาส 2/2569 (ม.ค. – มี.ค. 2569)" */
  label: string;
}

export interface ActivityGroup {
  /** The quarter its activities start in; null when the list is not grouped (or a start date is unreadable). */
  quarter: FiscalQuarter | null;
  activities: Activity[];
}

export interface ActivityFilters {
  status: WorkStatus | null;
  /** A FiscalQuarter key; activities that run in some part of it. */
  quarter: string | null;
}

/** One row of the project's own timeline: the project itself on top, then each activity. */
export interface TimelineRow {
  id: string;
  name: string;
  status: WorkStatus;
  /** Set for an activity row. */
  activity?: Activity;
  /** Where the bar sits, in percent of the axis; null when the dates cannot be read. */
  bar: { left: number; width: number; elapsed: number } | null;
}

export interface ActivityTimeline {
  months: { label: string; year: string; current: boolean }[];
  /** Consecutive months grouped by fiscal quarter, for the header row above the months. */
  quarters: { label: string; months: number }[];
  rows: TimelineRow[];
  /** Today's place on the axis in percent; null when today is outside it. */
  today: number | null;
  /** The current month's column, 0-based; null when it is outside the axis. */
  currentMonth: number | null;
}

/** How the time left reads next to a project's dates, and in what tone. */
export interface ScheduleNote {
  text: string;
  tone: 'muted' | 'info' | 'warn' | 'danger';
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (negative when `to` is earlier); null for an unreadable date. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / DAY_MS);
}

/** The fiscal quarter a date falls in. */
export function quarterOf(iso: string): Omit<FiscalQuarter, 'key' | 'label'> | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const fiscalMonth = (p.month + 3) % 12; // 0 = October … 11 = September
  return { fiscalYear: p.year + (p.month >= 9 ? 1 : 0) + 543, quarter: Math.floor(fiscalMonth / 3) + 1 };
}

function toFiscalQuarter(fiscalYear: number, quarter: number): FiscalQuarter {
  return {
    key: `${fiscalYear}-${quarter}`,
    fiscalYear,
    quarter,
    label: `ไตรมาส ${quarter}/${fiscalYear} (${quarterMonthsLabel(quarter, fiscalYear)})`,
  };
}

/** Activities in the order they start, then by name. */
export function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'th'));
}

/** Every fiscal quarter that the project or one of its activities runs in, in order. */
export function quartersOf(plan: WorkPlan, activities: Activity[]): FiscalQuarter[] {
  const quarters = new Map<string, FiscalQuarter>();
  for (const item of [plan, ...activities]) {
    const start = quarterOf(item.startDate);
    const end = quarterOf(item.endDate);
    if (!start || !end) continue;
    for (let n = start.fiscalYear * 4 + start.quarter - 1; n <= end.fiscalYear * 4 + end.quarter - 1; n++) {
      const q = toFiscalQuarter(Math.floor(n / 4), (n % 4) + 1);
      quarters.set(q.key, q);
    }
  }
  return [...quarters.values()].sort((a, b) => a.fiscalYear - b.fiscalYear || a.quarter - b.quarter);
}

/** The activities that have the status and run in some part of the quarter (either left out: any). */
export function filterActivities(activities: Activity[], filters: ActivityFilters): Activity[] {
  const quarter = filters.quarter?.split('-').map(Number) ?? null;
  return activities.filter(
    (a) =>
      (!filters.status || a.status === filters.status) &&
      (!quarter || overlapsQuarter(a.startDate, a.endDate, quarter[0], quarter[1])),
  );
}

/** Activities (already in order) grouped by the quarter each one starts in, keeping their order. */
export function groupByStartQuarter(activities: Activity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const activity of activities) {
    const q = quarterOf(activity.startDate);
    const quarter = q ? toFiscalQuarter(q.fiscalYear, q.quarter) : null;
    const group = groups.find((g) => g.quarter?.key === quarter?.key);
    if (group) group.activities.push(activity);
    else groups.push({ quarter, activities: [activity] });
  }
  return groups;
}

/** How many activities have each status. */
export function countByStatus(activities: Activity[]): Record<WorkStatus, number> {
  const counts: Record<WorkStatus, number> = { planned: 0, 'in-progress': 0, completed: 0, delayed: 0, cancelled: 0 };
  for (const a of activities) counts[a.status]++;
  return counts;
}

/** "เริ่มในอีก 12 วัน", "เหลืออีก 30 วัน", "เลยกำหนด 5 วัน" or "สิ้นสุดแล้ว", seen from `today`. */
export function scheduleNote(plan: Pick<WorkPlan, 'startDate' | 'endDate' | 'status'>, today: string): ScheduleNote | null {
  const toStart = daysBetween(today, plan.startDate);
  const toEnd = daysBetween(today, plan.endDate);
  if (toStart === null || toEnd === null) return null;
  if (plan.status === 'completed') return { text: 'เสร็จสิ้นแล้ว', tone: 'muted' };
  if (plan.status === 'cancelled') return { text: 'ยกเลิกแล้ว', tone: 'muted' };
  if (toStart > 0) return { text: `เริ่มในอีก ${toStart} วัน`, tone: 'info' };
  if (toEnd >= 0) return { text: toEnd === 0 ? 'ครบกำหนดวันนี้' : `เหลืออีก ${toEnd} วัน`, tone: toEnd <= 14 ? 'warn' : 'info' };
  return { text: `เลยกำหนด ${-toEnd} วัน`, tone: 'danger' };
}

/**
 * The project and `activities` as bars on a monthly axis from the first month that the project or one of
 * `axis` starts in to the last month one of them ends in (`axis` is every activity, so filtering the bars
 * leaves the axis as it is). Bars are placed to the day: a bar runs from the start of its first day to the
 * end of its last. Null when the project has no activities.
 */
export function buildActivityTimeline(plan: WorkPlan, activities: Activity[], today: string, axis: Activity[] = activities): ActivityTimeline | null {
  if (axis.length === 0) return null;
  const dates = [plan, ...axis]
    .flatMap((x) => [parseIsoDate(x.startDate), parseIsoDate(x.endDate)])
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (dates.length === 0) return null;

  const index = (p: { year: number; month: number }) => p.year * 12 + p.month;
  const first = Math.min(...dates.map(index));
  const count = Math.max(...dates.map(index)) - first + 1;
  // Months from the start of the axis to the start (or, with `endOfDay`, the end) of a day.
  const position = (iso: string, endOfDay: boolean): number | null => {
    const p = parseIsoDate(iso);
    return p ? index(p) - first + (p.day - (endOfDay ? 0 : 1)) / daysInMonth(p.year, p.month) : null;
  };
  const percent = (months: number) => (months / count) * 100;

  const now = position(today, false);
  const bar = (startDate: string, endDate: string): TimelineRow['bar'] => {
    const start = position(startDate, false);
    const end = position(endDate, true);
    if (start === null || end === null || end <= start) return null;
    const elapsed = now === null ? 0 : Math.min(1, Math.max(0, (now - start) / (end - start)));
    return { left: percent(start), width: percent(end - start), elapsed };
  };

  const currentMonth = now !== null && now >= 0 && now < count ? Math.floor(now) : null;
  const months = Array.from({ length: count }, (_, i) => {
    const year = Math.floor((first + i) / 12);
    const month = (first + i) % 12;
    return { label: THAI_MONTHS[month], year: ((year + 543) % 100).toString().padStart(2, '0'), current: i === currentMonth };
  });

  const quarters: ActivityTimeline['quarters'] = [];
  for (let i = 0; i < count; i++) {
    const year = Math.floor((first + i) / 12);
    const month = (first + i) % 12;
    const q = quarterOf(`${year}-${String(month + 1).padStart(2, '0')}-01`)!;
    const label = `Q${q.quarter} ปีงบ ${q.fiscalYear % 100}`;
    const last = quarters[quarters.length - 1];
    if (last?.label === label) last.months++;
    else quarters.push({ label, months: 1 });
  }

  return {
    months,
    quarters,
    rows: [
      { id: plan.id, name: plan.name, status: plan.status, bar: bar(plan.startDate, plan.endDate) },
      ...activities.map((a) => ({ id: a.id, name: a.name, status: a.status, activity: a, bar: bar(a.startDate, a.endDate) })),
    ],
    today: now !== null && now >= 0 && now <= count ? percent(now) : null,
    currentMonth,
  };
}
