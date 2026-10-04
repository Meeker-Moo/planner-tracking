import { WorkPlan, WorkStatus } from '../../core/models/work-plan.model';
import { ListSpan } from '../../core/services/fiscal-year-state.service';
import { STATUS_LIST } from '../../core/models/status.constant';
import { monthSpanInFiscalYear } from '../../shared/utils/date.util';

export interface PlanFilters {
  keyword: string;
  /** Month position in the fiscal year: 1 = October … 12 = September. */
  month: number | null;
  status: WorkStatus | null;
  type: string | null;
}

export const NO_FILTERS: PlanFilters = { keyword: '', month: null, status: null, type: null };

export interface PlanRow {
  plan: WorkPlan;
  /** The fiscal year the project started in, when it is shown under a later year it runs into; otherwise null. */
  carriedFrom: number | null;
}

export interface PlanGroup {
  fiscalYear: number;
  rows: PlanRow[];
}

/**
 * The fiscal years the list covers, newest first: the selected year alone, the selected year and the
 * ones before it, or every year that has a project.
 */
export function fiscalYearsInView(selectedYear: number, span: ListSpan, yearsWithPlans: number[]): number[] {
  if (span === 'all') return yearsWithPlans.length ? [...yearsWithPlans].sort((a, b) => b - a) : [selectedYear];
  return Array.from({ length: span }, (_, i) => selectedYear - i);
}

/** True when the project passes every filter; the month filter is read within `fiscalYear`. */
export function matchesFilters(p: WorkPlan, filters: PlanFilters, fiscalYear: number): boolean {
  const keyword = filters.keyword.trim().toLowerCase();
  if (
    keyword &&
    !p.name.toLowerCase().includes(keyword) &&
    !p.responsible.toLowerCase().includes(keyword) &&
    !(p.activities ?? []).some((a) => a.name.toLowerCase().includes(keyword))
  ) {
    return false;
  }
  if (filters.month) {
    const span = monthSpanInFiscalYear(p.startDate, p.endDate, fiscalYear);
    if (!span || filters.month < span[0] || filters.month > span[1]) return false;
  }
  if (filters.status && p.status !== filters.status) return false;
  if (filters.type && p.type !== filters.type) return false;
  return true;
}

/**
 * The projects to list, grouped by fiscal year (newest first).
 *
 * With one year, the group holds the projects that start in it plus those from earlier years still running
 * in it (marked with `carriedFrom`), and it is returned even when empty. With several years, each project
 * appears once, under the year it starts in, and years left with no project are dropped.
 */
export function buildPlanGroups(plans: WorkPlan[], years: number[], filters: PlanFilters): PlanGroup[] {
  if (years.length === 1) {
    const fiscalYear = years[0];
    const rows = plans
      .filter((p) => p.year === fiscalYear || (p.year < fiscalYear && monthSpanInFiscalYear(p.startDate, p.endDate, fiscalYear) !== null))
      .filter((p) => matchesFilters(p, filters, fiscalYear))
      .sort(byStartThenName)
      .map((plan) => ({ plan, carriedFrom: plan.year < fiscalYear ? plan.year : null }));
    return [{ fiscalYear, rows }];
  }

  return years
    .map((fiscalYear) => ({
      fiscalYear,
      rows: plans
        .filter((p) => p.year === fiscalYear && matchesFilters(p, filters, fiscalYear))
        .sort(byStartThenName)
        .map((plan) => ({ plan, carriedFrom: null })),
    }))
    .filter((g) => g.rows.length > 0);
}

/** How many projects the list would show for each status, and in all, with every filter but the status one. */
export function countByStatus(plans: WorkPlan[], years: number[], filters: PlanFilters): Record<WorkStatus | 'all', number> {
  const counts = { all: 0 } as Record<WorkStatus | 'all', number>;
  for (const s of STATUS_LIST) counts[s.value] = 0;
  for (const group of buildPlanGroups(plans, years, { ...filters, status: null })) {
    for (const { plan } of group.rows) {
      counts.all++;
      counts[plan.status]++;
    }
  }
  return counts;
}

export function hasActiveFilters(filters: PlanFilters): boolean {
  return !!filters.keyword.trim() || filters.month !== null || filters.status !== null || filters.type !== null;
}

function byStartThenName(a: WorkPlan, b: WorkPlan): number {
  return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'th');
}
