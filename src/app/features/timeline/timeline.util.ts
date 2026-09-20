import { Activity, WorkPlan } from '../../core/models/work-plan.model';
import { fiscalYearOf, monthSpanInFiscalYears } from '../../shared/utils/date.util';

/** One row of the timeline: a project, or one of its sub-activities. */
export interface TimelineBar {
  id: string;
  name: string;
  plan: WorkPlan;
  /** Set for a sub-activity row. */
  activity?: Activity;
  status: WorkPlan['status'];
  /** The months the bar covers, 1-based from October of the first fiscal year; null if it has no bar. */
  span: [number, number] | null;
}

export interface TimelineLayout {
  firstYear: number;
  lastYear: number;
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
 */
export function buildTimelineLayout(plans: WorkPlan[], selectedYear: number): TimelineLayout {
  let firstYear = selectedYear;
  let lastYear = selectedYear;
  for (const plan of plans) {
    for (const item of [plan, ...(plan.activities ?? [])]) {
      const from = fiscalYearOf(item.startDate);
      const to = fiscalYearOf(item.endDate);
      if (from !== null) firstYear = Math.min(firstYear, from);
      if (to !== null) lastYear = Math.max(lastYear, to);
    }
  }

  const rows: TimelineBar[] = plans.flatMap((plan) => {
    const project: TimelineBar = {
      id: plan.id,
      name: plan.name,
      plan,
      status: plan.status,
      span: monthSpanInFiscalYears(plan.startDate, plan.endDate, firstYear, lastYear),
    };
    const activities = (plan.activities ?? []).flatMap((activity): TimelineBar[] => {
      const span = monthSpanInFiscalYears(activity.startDate, activity.endDate, firstYear, lastYear);
      // An activity with unreadable dates has nothing to draw.
      return span ? [{ id: `${plan.id}:${activity.id}`, name: activity.name, plan, activity, status: activity.status, span }] : [];
    });
    return [project, ...activities];
  });

  return { firstYear, lastYear, rows };
}
