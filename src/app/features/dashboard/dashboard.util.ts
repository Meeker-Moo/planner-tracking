import { STATUS_LIST } from '../../core/models/status.constant';
import { WorkPlan, WorkStatus } from '../../core/models/work-plan.model';
import { monthSpanInFiscalYear } from '../../shared/utils/date.util';

export interface AttentionItem {
  plan: WorkPlan;
  /** delayed: marked as delayed; overdue: still planned / in progress but its end date has passed. */
  reason: 'delayed' | 'overdue';
}

export interface ResponsibleRow {
  name: string;
  projects: number;
  completed: number;
  delayed: number;
  activitiesDone: number;
  activitiesTotal: number;
}

export interface YearSummary {
  projectCount: number;
  byStatus: Record<WorkStatus, number>;
  byType: { label: string; count: number }[];
  /** Projects running in each month of the fiscal year (index 0 = October … 11 = September). */
  byMonth: number[];
  byResponsible: ResponsibleRow[];
  activityTotal: number;
  activityDone: number;
  attention: AttentionItem[];
}

const UNSPECIFIED = 'ไม่ระบุ';

/** Summarises the projects of one fiscal year (พ.ศ.). `today` (yyyy-MM-dd) decides which projects are overdue. */
export function summarizeYear(plans: WorkPlan[], fiscalYear: number, today: string): YearSummary {
  const projects = plans.filter((p) => p.year === fiscalYear);

  const byStatus = Object.fromEntries(STATUS_LIST.map((s) => [s.value, 0])) as Record<WorkStatus, number>;
  const byMonth = Array<number>(12).fill(0);
  const types = new Map<string, number>();
  const responsibles = new Map<string, ResponsibleRow>();
  const attention: AttentionItem[] = [];
  let activityTotal = 0;
  let activityDone = 0;

  for (const p of projects) {
    if (p.status in byStatus) byStatus[p.status]++;

    const span = monthSpanInFiscalYear(p.startDate, p.endDate, fiscalYear);
    if (span) for (let m = span[0]; m <= span[1]; m++) byMonth[m - 1]++;

    const type = p.type || UNSPECIFIED;
    types.set(type, (types.get(type) ?? 0) + 1);

    const activities = p.activities ?? [];
    const done = activities.filter((a) => a.status === 'completed').length;
    activityTotal += activities.length;
    activityDone += done;

    const name = p.responsible.trim() || UNSPECIFIED;
    const row = responsibles.get(name) ?? {
      name,
      projects: 0,
      completed: 0,
      delayed: 0,
      activitiesDone: 0,
      activitiesTotal: 0,
    };
    row.projects++;
    if (p.status === 'completed') row.completed++;
    if (p.status === 'delayed') row.delayed++;
    row.activitiesDone += done;
    row.activitiesTotal += activities.length;
    responsibles.set(name, row);

    if (p.status === 'delayed') {
      attention.push({ plan: p, reason: 'delayed' });
    } else if ((p.status === 'planned' || p.status === 'in-progress') && p.endDate < today) {
      attention.push({ plan: p, reason: 'overdue' });
    }
  }

  attention.sort(
    (a, b) =>
      (a.reason === b.reason ? 0 : a.reason === 'delayed' ? -1 : 1) || a.plan.endDate.localeCompare(b.plan.endDate),
  );

  return {
    projectCount: projects.length,
    byStatus,
    byType: Array.from(types, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    byMonth,
    byResponsible: Array.from(responsibles.values()).sort((a, b) => b.projects - a.projects),
    activityTotal,
    activityDone,
    attention,
  };
}
