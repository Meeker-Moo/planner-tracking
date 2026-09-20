import { TestBed } from '@angular/core/testing';
import { Activity, WorkPlanInput } from '../models/work-plan.model';
import { WorkPlanService } from './work-plan.service';

const input: WorkPlanInput = {
  year: 2569,
  name: 'โครงการ',
  type: 'กิจกรรม',
  responsible: 'ฝ่าย ก',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  status: 'planned',
};

function activity(id: string, name = 'กิจกรรม'): Activity {
  return { id, name, startDate: '2026-01-01', endDate: '2026-01-31', status: 'planned' };
}

describe('WorkPlanService activities', () => {
  let service: WorkPlanService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkPlanService);
  });

  it('adds an activity to a project', () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1'));
    expect(service.getById(plan.id)?.activities?.map((a) => a.id)).toEqual(['a1']);
  });

  it('replaces an activity with the same id, keeping the others in place', () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1', 'เดิม'));
    service.saveActivity(plan.id, activity('a2'));
    service.saveActivity(plan.id, { ...activity('a1', 'ใหม่'), todos: [{ id: 't1', text: 'x', done: true }] });
    const activities = service.getById(plan.id)?.activities ?? [];
    expect(activities.map((a) => [a.id, a.name])).toEqual([
      ['a1', 'ใหม่'],
      ['a2', 'กิจกรรม'],
    ]);
    expect(activities[0].todos?.[0].done).toBe(true);
  });

  it('deletes an activity, and drops the list when the last one goes', () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1'));
    service.saveActivity(plan.id, activity('a2'));
    service.deleteActivity(plan.id, 'a1');
    expect(service.getById(plan.id)?.activities?.map((a) => a.id)).toEqual(['a2']);
    service.deleteActivity(plan.id, 'a2');
    expect(service.getById(plan.id)?.activities).toBeUndefined();
  });

  it('leaves other projects alone and ignores an unknown project', () => {
    const one = service.add(input);
    const two = service.add({ ...input, name: 'อีกโครงการ' });
    service.saveActivity(one.id, activity('a1'));
    service.saveActivity('missing', activity('a9'));
    expect(service.getById(two.id)?.activities).toBeUndefined();
    expect(service.plans()).toHaveLength(2);
  });

  it('keeps activities when the project itself is edited without them', () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1'));
    service.update(plan.id, { ...input, name: 'ชื่อใหม่' });
    const updated = service.getById(plan.id);
    expect(updated?.name).toBe('ชื่อใหม่');
    expect(updated?.activities?.map((a) => a.id)).toEqual(['a1']);
  });

  it('saves to localStorage', () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1'));
    const stored = JSON.parse(localStorage.getItem('awp:plans:v1') ?? '[]');
    expect(stored[0].activities[0].id).toBe('a1');
  });
});
