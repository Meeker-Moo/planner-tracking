import { WorkPlan } from '../../core/models/work-plan.model';
import { NO_FILTERS, buildPlanGroups, countByStatus, fiscalYearsInView, hasActiveFilters, matchesFilters } from './plan-list.util';

// Fiscal year 2569 runs from October 2025 to September 2026.
function plan(overrides: Partial<WorkPlan>): WorkPlan {
  return {
    id: Math.random().toString(36).slice(2),
    year: 2569,
    name: 'โครงการ',
    type: 'กิจกรรม',
    responsible: 'ฝ่าย ก',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: 'planned',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const names = (groups: ReturnType<typeof buildPlanGroups>) => groups.map((g) => [g.fiscalYear, g.rows.map((r) => r.plan.name)]);

describe('fiscalYearsInView', () => {
  it('counts back from the selected year', () => {
    expect(fiscalYearsInView(2569, 1, [2560])).toEqual([2569]);
    expect(fiscalYearsInView(2569, 3, [])).toEqual([2569, 2568, 2567]);
  });

  it('is every year with a project for "all", or the selected year when there are none', () => {
    expect(fiscalYearsInView(2569, 'all', [2565, 2568])).toEqual([2568, 2565]);
    expect(fiscalYearsInView(2569, 'all', [])).toEqual([2569]);
  });
});

describe('buildPlanGroups — one year', () => {
  it('lists projects that start in the year, sorted by start date', () => {
    const plans = [
      plan({ name: 'ข', startDate: '2026-03-01', endDate: '2026-03-31' }),
      plan({ name: 'ก', startDate: '2025-11-01', endDate: '2025-11-30' }),
      plan({ name: 'อื่น', year: 2570, startDate: '2026-10-01', endDate: '2026-10-31' }),
    ];
    expect(names(buildPlanGroups(plans, [2569], NO_FILTERS))).toEqual([[2569, ['ก', 'ข']]]);
  });

  it('includes projects from earlier years still running, marked with the year they started', () => {
    const carried = plan({ name: 'ต่อเนื่อง', year: 2569, startDate: '2026-08-01', endDate: '2026-12-31' });
    const ended = plan({ name: 'จบแล้ว', year: 2569, startDate: '2026-01-01', endDate: '2026-09-30' });
    const [group] = buildPlanGroups([carried, ended], [2570], NO_FILTERS);
    expect(group.rows.map((r) => [r.plan.name, r.carriedFrom])).toEqual([['ต่อเนื่อง', 2569]]);
  });

  it('returns the group even when nothing matches', () => {
    expect(buildPlanGroups([], [2569], NO_FILTERS)).toEqual([{ fiscalYear: 2569, rows: [] }]);
  });

  it('keeps a project with a broken date under its own year', () => {
    const [group] = buildPlanGroups([plan({ name: 'x', startDate: 'bad', endDate: 'bad' })], [2569], NO_FILTERS);
    expect(group.rows.map((r) => r.plan.name)).toEqual(['x']);
  });
});

describe('buildPlanGroups — several years', () => {
  it('groups by the year each project starts in, newest first, without repeating a project', () => {
    const plans = [
      plan({ name: 'ปี68', year: 2568, startDate: '2025-01-01', endDate: '2025-01-31' }),
      plan({ name: 'ปี69-70', year: 2569, startDate: '2026-08-01', endDate: '2026-12-31' }),
      plan({ name: 'ปี70', year: 2570, startDate: '2026-11-01', endDate: '2026-11-30' }),
    ];
    const groups = buildPlanGroups(plans, [2570, 2569, 2568], NO_FILTERS);
    expect(names(groups)).toEqual([
      [2570, ['ปี70']],
      [2569, ['ปี69-70']],
      [2568, ['ปี68']],
    ]);
    expect(groups.every((g) => g.rows.every((r) => r.carriedFrom === null))).toBe(true);
  });

  it('drops years with no matching project', () => {
    const plans = [plan({ name: 'a', year: 2569 })];
    expect(names(buildPlanGroups(plans, [2570, 2569, 2568], NO_FILTERS))).toEqual([[2569, ['a']]]);
  });

  it('reads the month filter within each group’s own year', () => {
    // Month 4 = January: January 2025 is in fiscal 2568, January 2026 in fiscal 2569.
    const plans = [
      plan({ name: 'ม.ค.68', year: 2568, startDate: '2025-01-01', endDate: '2025-01-31' }),
      plan({ name: 'ม.ค.69', year: 2569, startDate: '2026-01-01', endDate: '2026-01-31' }),
      plan({ name: 'มี.ค.69', year: 2569, startDate: '2026-03-01', endDate: '2026-03-31' }),
    ];
    expect(names(buildPlanGroups(plans, [2569, 2568], { ...NO_FILTERS, month: 4 }))).toEqual([
      [2569, ['ม.ค.69']],
      [2568, ['ม.ค.68']],
    ]);
  });
});

describe('matchesFilters', () => {
  const p = plan({
    name: 'อบรมบุคลากร',
    responsible: 'ฝ่ายบุคคล',
    type: 'พัฒนาบุคลากร',
    status: 'in-progress',
    startDate: '2025-11-01',
    endDate: '2026-01-31',
    activities: [{ id: 'a', name: 'จัดซื้ออุปกรณ์', startDate: '2025-11-01', endDate: '2025-11-30', status: 'planned' }],
  });

  it('searches the name, the responsible person and the activity names, ignoring case and spaces', () => {
    expect(matchesFilters(p, { ...NO_FILTERS, keyword: ' อบรม ' }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, keyword: 'บุคคล' }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, keyword: 'จัดซื้อ' }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, keyword: 'ไม่มี' }, 2569)).toBe(false);
  });

  it('keeps projects running in the chosen month (November–January = 2–4)', () => {
    expect(matchesFilters(p, { ...NO_FILTERS, month: 2 }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, month: 4 }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, month: 5 }, 2569)).toBe(false);
  });

  it('filters by status and type', () => {
    expect(matchesFilters(p, { ...NO_FILTERS, status: 'in-progress' }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, status: 'completed' }, 2569)).toBe(false);
    expect(matchesFilters(p, { ...NO_FILTERS, type: 'พัฒนาบุคลากร' }, 2569)).toBe(true);
    expect(matchesFilters(p, { ...NO_FILTERS, type: 'การเงิน' }, 2569)).toBe(false);
  });
});

describe('countByStatus', () => {
  it('counts what the other filters leave, ignoring the status filter', () => {
    const plans = [
      plan({ status: 'completed', type: 'การเงิน' }),
      plan({ status: 'completed' }),
      plan({ status: 'delayed' }),
    ];
    const counts = countByStatus(plans, [2569], { ...NO_FILTERS, status: 'delayed', type: 'กิจกรรม' });
    expect(counts.all).toBe(2);
    expect(counts.completed).toBe(1);
    expect(counts.delayed).toBe(1);
    expect(counts.planned).toBe(0);
  });
});

describe('hasActiveFilters', () => {
  it('ignores a keyword of only spaces', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, keyword: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, month: 1 })).toBe(true);
  });
});
