import { Activity, WorkPlan } from '../../core/models/work-plan.model';
import { overlapsQuarter } from './date.util';

/** How many of an activity's to-do items are done, out of how many there are. */
export function todoProgress(activity: Pick<Activity, 'todos'>): { done: number; total: number } {
  const todos = activity.todos ?? [];
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}

/** The sub-activities that run in some part of a quarter of a fiscal year. */
export function activitiesInQuarter(plan: Pick<WorkPlan, 'activities'>, fiscalYear: number, quarter: number): Activity[] {
  return (plan.activities ?? []).filter((a) => overlapsQuarter(a.startDate, a.endDate, fiscalYear, quarter));
}

/**
 * Whether a project belongs in a quarter: by its sub-activities when it has any (one of them runs in the
 * quarter), and by its own dates when it has none.
 */
export function planInQuarter(plan: WorkPlan, fiscalYear: number, quarter: number): boolean {
  return plan.activities?.length
    ? activitiesInQuarter(plan, fiscalYear, quarter).length > 0
    : overlapsQuarter(plan.startDate, plan.endDate, fiscalYear, quarter);
}
