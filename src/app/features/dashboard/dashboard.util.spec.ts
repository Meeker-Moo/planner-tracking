import { WorkPlan } from '../../core/models/work-plan.model';
import { summarizeYear } from './dashboard.util';

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

describe('summarizeYear', () => {
  const today = '2026-09-19';

  it('is empty for a fiscal year with no projects', () => {
    const s = summarizeYear([plan({ year: 2568 })], 2569, today);
    expect(s.projectCount).toBe(0);
    expect(s.byMonth).toEqual(Array(12).fill(0));
    expect(s.byStatus.completed).toBe(0);
    expect(s.attention).toEqual([]);
  });

  it('counts only the chosen fiscal year, by status, type and responsible', () => {
    const s = summarizeYear(
      [
        plan({ status: 'completed', type: 'การเงิน', responsible: 'ฝ่าย ก' }),
        plan({ status: 'in-progress', type: 'การเงิน', responsible: 'ฝ่าย ข' }),
        plan({ status: 'in-progress', type: 'ตรวจสอบ', responsible: '  ' }),
        plan({ year: 2568, status: 'completed' }),
      ],
      2569,
      today,
    );
    expect(s.projectCount).toBe(3);
    expect(s.byStatus).toEqual({ planned: 0, 'in-progress': 2, completed: 1, delayed: 0, cancelled: 0 });
    expect(s.byType).toEqual([
      { label: 'การเงิน', count: 2 },
      { label: 'ตรวจสอบ', count: 1 },
    ]);
    expect(s.byResponsible.map((r) => [r.name, r.projects])).toEqual([
      ['ฝ่าย ก', 1],
      ['ฝ่าย ข', 1],
      ['ไม่ระบุ', 1],
    ]);
  });

  it('counts projects per month of the fiscal year, October first', () => {
    const s = summarizeYear(
      [
        // Nov 2025 – Jan 2026: fiscal months 2-4
        plan({ startDate: '2025-11-10', endDate: '2026-01-31' }),
        // starts in the previous fiscal year, so it is clipped to Oct – Nov
        plan({ startDate: '2025-08-01', endDate: '2025-11-30' }),
        // runs on into the next fiscal year: clipped to Aug – Sep
        plan({ startDate: '2026-08-01', endDate: '2026-12-31' }),
      ],
      2569,
      today,
    );
    expect(s.byMonth).toEqual([1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('totals sub-activities and how many are completed', () => {
    const a = (status: 'planned' | 'completed') => ({ id: Math.random().toString(), name: 'x', startDate: '', endDate: '', status });
    const s = summarizeYear(
      [plan({ activities: [a('completed'), a('planned'), a('completed')] }), plan({ activities: [a('planned')] }), plan({})],
      2569,
      today,
    );
    expect(s.activityTotal).toBe(4);
    expect(s.activityDone).toBe(2);
    expect(s.byResponsible[0].activitiesTotal).toBe(4);
  });

  it('flags delayed and overdue projects, delayed first then by end date', () => {
    const late = plan({ name: 'late', status: 'in-progress', endDate: '2026-03-31' });
    const later = plan({ name: 'later', status: 'planned', endDate: '2026-06-30' });
    const delayed = plan({ name: 'delayed', status: 'delayed', endDate: '2026-09-30' });
    const doneOld = plan({ name: 'done', status: 'completed', endDate: '2026-01-31' });
    const cancelledOld = plan({ name: 'cancelled', status: 'cancelled', endDate: '2026-01-31' });
    const future = plan({ name: 'future', status: 'planned', endDate: '2026-09-30' });

    const s = summarizeYear([later, doneOld, future, delayed, cancelledOld, late], 2569, today);
    expect(s.attention.map((i) => [i.plan.name, i.reason])).toEqual([
      ['delayed', 'delayed'],
      ['late', 'overdue'],
      ['later', 'overdue'],
    ]);
  });
});
