import { WorkPlan } from '../../core/models/work-plan.model';
import { buildTimelineLayout, elapsedBarBackground, elapsedFraction } from './timeline.util';

function plan(overrides: Partial<WorkPlan>): WorkPlan {
  return {
    id: 'p',
    year: 2569,
    name: 'โครงการ',
    type: 'กิจกรรม',
    responsible: '',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    status: 'planned',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('buildTimelineLayout', () => {
  it('covers just the selected fiscal year when everything fits in it', () => {
    const layout = buildTimelineLayout([plan({})], 2569);
    expect([layout.firstYear, layout.lastYear]).toEqual([2569, 2569]);
    // January to March are the 4th to 6th months after October
    expect(layout.rows[0].span).toEqual([4, 6]);
  });

  it('widens the axis to the whole span of a project that crosses fiscal years', () => {
    // June 2025 (FY 2568) to March 2027 (FY 2570)
    const layout = buildTimelineLayout([plan({ startDate: '2025-06-01', endDate: '2027-03-31' })], 2569);
    expect([layout.firstYear, layout.lastYear]).toEqual([2568, 2570]);
    // FY 2568 starts October 2024, so June 2025 is month 9; March 2027 is month 30
    expect(layout.rows[0].span).toEqual([9, 30]);
  });

  it('also widens for an activity that runs beyond its project', () => {
    const layout = buildTimelineLayout(
      [plan({ activities: [{ id: 'a', name: 'x', startDate: '2026-11-01', endDate: '2026-12-31', status: 'planned' }] })],
      2569,
    );
    expect([layout.firstYear, layout.lastYear]).toEqual([2569, 2570]);
  });

  it('puts each project first, then its activities, and drops activities with unreadable dates', () => {
    const layout = buildTimelineLayout(
      [
        plan({
          id: 'p1',
          activities: [
            { id: 'a1', name: 'ok', startDate: '2026-01-01', endDate: '2026-02-28', status: 'completed' },
            { id: 'a2', name: 'bad', startDate: '', endDate: '', status: 'planned' },
          ],
        }),
        plan({ id: 'p2' }),
      ],
      2569,
    );
    expect(layout.rows.map((r) => r.id)).toEqual(['p1', 'p1:a1', 'p2']);
    expect(layout.rows[1].activity?.name).toBe('ok');
    expect(layout.rows[1].status).toBe('completed');
  });

  it('keeps a project without readable dates as a row with no bar', () => {
    const layout = buildTimelineLayout([plan({ startDate: '', endDate: '' })], 2569);
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].span).toBeNull();
  });

  it('is an empty axis of the selected year with no projects', () => {
    expect(buildTimelineLayout([], 2570)).toEqual({ firstYear: 2570, lastYear: 2570, rows: [] });
  });
});

describe('elapsedFraction', () => {
  // a bar over months 4-6 of the axis, i.e. from position 3 to 6
  const span: [number, number] = [4, 6];

  it('is 0 before the bar starts and 1 after it ends', () => {
    expect(elapsedFraction(span, 2.9)).toBe(0);
    expect(elapsedFraction(span, -5)).toBe(0);
    expect(elapsedFraction(span, 6.0)).toBe(1);
    expect(elapsedFraction(span, 40)).toBe(1);
  });

  it('is the share of the bars months that have already passed', () => {
    expect(elapsedFraction(span, 3)).toBe(0);
    expect(elapsedFraction(span, 4.5)).toBeCloseTo(0.5, 5);
    expect(elapsedFraction([1, 12], 6)).toBeCloseTo(0.5, 5);
  });
});

describe('elapsedBarBackground', () => {
  it('splits the solid part from the hatched part at the elapsed share', () => {
    const css = elapsedBarBackground('#D1FAE5', 0.4);
    expect(css).toContain('#D1FAE5 40.00%, transparent 40.00%');
    expect(css).toContain('repeating-linear-gradient');
  });

  it('is all solid when finished and all hatched when not started', () => {
    expect(elapsedBarBackground('#fff', 1)).toContain('#fff 100.00%, transparent 100.00%');
    expect(elapsedBarBackground('#fff', 0)).toContain('#fff 0.00%, transparent 0.00%');
  });
});
