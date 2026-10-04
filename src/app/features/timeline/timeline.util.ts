import { Activity, WorkPlan } from '../../core/models/work-plan.model';
import { activitiesInQuarter } from '../../shared/utils/activity.util';
import { fiscalYearOf, monthSpanInFiscalYears, quarterMonths } from '../../shared/utils/date.util';

/** One row of the timeline: a project, or one of its sub-activities. */
export interface TimelineBar {
  id: string;
  name: string;
  plan: WorkPlan;
  /** Set for a sub-activity row. */
  activity?: Activity;
  status: WorkPlan['status'];
  /** The months the bar covers, 1-based from the first month on the axis; null if it has no bar. */
  span: [number, number] | null;
}

export interface TimelineLayout {
  firstYear: number;
  lastYear: number;
  /** How many months from October of `firstYear` the axis starts: 0 unless it shows one quarter. */
  monthOffset: number;
  /** How many months the axis shows: 12 per fiscal year, or 3 for a quarter. */
  monthCount: number;
  rows: TimelineBar[];
}

/**
 * How much of a bar has already gone by, from 0 (not started) to 1 (finished), given today's position
 * on the axis in months (see monthPositionInFiscalYears). A bar covers whole months.
 */
export function elapsedFraction(span: [number, number], todayPosition: number): number {
  const start = span[0] - 1;
  const length = span[1] - span[0] + 1;
  return Math.min(1, Math.max(0, (todayPosition - start) / length));
}

/**
 * CSS background for a bar split at "today": the part already gone by is solid, the part still to come is
 * hatched. `elapsed` runs from 0 to 1 across the bar; `color` is used for both parts.
 */
export function elapsedBarBackground(color: string, elapsed: number): string {
  const split = (elapsed * 100).toFixed(2);
  return (
    `linear-gradient(to right, ${color} ${split}%, transparent ${split}%), ` +
    `repeating-linear-gradient(135deg, ${color} 0 5px, rgb(255 255 255 / 0.7) 5px 10px)`
  );
}

/**
 * Lays out projects (each followed by its sub-activities) on a monthly axis of consecutive fiscal years.
 * The axis is the selected fiscal year, widened to take in the whole span of every project and activity
 * so that one running across two or three fiscal years is not cut off.
 *
 * With a quarter, the axis is that quarter's three months of the selected year alone: bars are cut at its
 * edges, and only the sub-activities that run in it are listed.
 */
export function buildTimelineLayout(plans: WorkPlan[], selectedYear: number, quarter: number | null = null): TimelineLayout {
  let firstYear = selectedYear;
  let lastYear = selectedYear;
  for (const plan of quarter === null ? plans : []) {
    for (const item of [plan, ...(plan.activities ?? [])]) {
      const from = fiscalYearOf(item.startDate);
      const to = fiscalYearOf(item.endDate);
      if (from !== null) firstYear = Math.min(firstYear, from);
      if (to !== null) lastYear = Math.max(lastYear, to);
    }
  }

  const [from, to] = quarter === null ? [1, (lastYear - firstYear + 1) * 12] : quarterMonths(quarter);
  // The months a date range covers on the axis, cut at its edges.
  const spanOf = (startDate: string, endDate: string): [number, number] | null => {
    const span = monthSpanInFiscalYears(startDate, endDate, firstYear, lastYear);
    const start = span ? Math.max(span[0], from) : 0;
    const end = span ? Math.min(span[1], to) : -1;
    return start > end ? null : [start - from + 1, end - from + 1];
  };

  const rows: TimelineBar[] = plans.flatMap((plan) => {
    const project: TimelineBar = {
      id: plan.id,
      name: plan.name,
      plan,
      status: plan.status,
      span: spanOf(plan.startDate, plan.endDate),
    };
    const shown = quarter === null ? (plan.activities ?? []) : activitiesInQuarter(plan, selectedYear, quarter);
    const activities = shown.flatMap((activity): TimelineBar[] => {
      const span = spanOf(activity.startDate, activity.endDate);
      // An activity with unreadable dates has nothing to draw.
      return span ? [{ id: `${plan.id}:${activity.id}`, name: activity.name, plan, activity, status: activity.status, span }] : [];
    });
    return [project, ...activities];
  });

  return { firstYear, lastYear, monthOffset: from - 1, monthCount: to - from + 1, rows };
}
