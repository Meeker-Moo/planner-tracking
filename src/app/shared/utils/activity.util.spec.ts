import { Activity, WorkPlan } from '../../core/models/work-plan.model';
import { activitiesInQuarter, planInQuarter, todoProgress } from './activity.util';

function activity(name: string, startDate: string, endDate: string): Activity {
  return { id: name, name, startDate, endDate, status: 'planned' };
}

// Fiscal year 2569, from October 2025 to September 2026.
function project(activities: Activity[] | undefined, startDate = '2025-10-01', endDate = '2026-09-30'): WorkPlan {
  return {
    id: 'p',
    year: 2569,
    name: 'p',
    type: '',
    responsible: '',
    startDate,
    endDate,
    status: 'planned',
    activities,
    createdAt: '',
    updatedAt: '',
  };
}

describe('todoProgress', () => {
  it('counts done items out of all items', () => {
    const todos = [
      { id: '1', text: 'a', done: true },
      { id: '2', text: 'b', done: false },
      { id: '3', text: 'c', done: true },
    ];
    expect(todoProgress({ todos })).toEqual({ done: 2, total: 3 });
  });

  it('is 0 of 0 for an activity without a to-do list', () => {
    expect(todoProgress({})).toEqual({ done: 0, total: 0 });
    expect(todoProgress({ todos: [] })).toEqual({ done: 0, total: 0 });
  });
});

describe('quarters by sub-activity', () => {
  const p = project([activity('ต.ค.', '2025-10-05', '2025-10-20'), activity('ธ.ค.–ก.พ.', '2025-12-15', '2026-02-10')]);

  it('lists the sub-activities that run in some part of the quarter', () => {
    expect(activitiesInQuarter(p, 2569, 1).map((a) => a.name)).toEqual(['ต.ค.', 'ธ.ค.–ก.พ.']);
    expect(activitiesInQuarter(p, 2569, 2).map((a) => a.name)).toEqual(['ธ.ค.–ก.พ.']);
    expect(activitiesInQuarter(p, 2569, 3)).toEqual([]);
  });

  it('places a project by its sub-activities, not its own dates', () => {
    expect(planInQuarter(p, 2569, 2)).toBe(true);
    expect(planInQuarter(p, 2569, 3)).toBe(false);
  });

  it('places a project with no sub-activities by its own dates', () => {
    expect(planInQuarter(project(undefined, '2026-04-01', '2026-05-31'), 2569, 3)).toBe(true);
    expect(planInQuarter(project([], '2026-04-01', '2026-05-31'), 2569, 4)).toBe(false);
  });
});
