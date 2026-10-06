import { TestBed } from '@angular/core/testing';
import { Activity, WorkPlanInput } from '../models/work-plan.model';
import { WorkPlanService } from './work-plan.service';
import { DataScopeService } from './data-scope.service';
import { currentFiscalYear } from '../../shared/utils/date.util';
import { freshTestBed } from '../auth/auth.testing';
import { UserStore } from '../auth/user-store.service';

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
    freshTestBed('u-user1');
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

describe('WorkPlanService years', () => {
  let service: WorkPlanService;

  beforeEach(() => {
    localStorage.clear();
    freshTestBed('u-user1');
    service = TestBed.inject(WorkPlanService);
  });

  it('is just the current fiscal year when there are no projects', () => {
    expect(service.years()).toEqual([currentFiscalYear()]);
    expect(service.yearsWithPlans()).toEqual([]);
  });

  it('fills the gap between the oldest project and the current year, newest first', () => {
    const now = currentFiscalYear();
    service.add({ ...input, year: now - 3 });
    service.add({ ...input, year: now - 1 });
    expect(service.years()).toEqual([now, now - 1, now - 2, now - 3]);
    expect(service.yearsWithPlans()).toEqual([now - 1, now - 3]);
  });

  it('reaches forward to a project planned after the current year', () => {
    const now = currentFiscalYear();
    service.add({ ...input, year: now + 2 });
    expect(service.years()).toEqual([now + 2, now + 1, now]);
  });
});

/** The WorkPlanService of a fresh page signed in as the account, reading what earlier ones saved. */
function as(userId: string): WorkPlanService {
  freshTestBed(userId);
  return TestBed.inject(WorkPlanService);
}

describe('WorkPlanService ownership', () => {
  beforeEach(() => localStorage.clear());

  it('makes the signed-in account the owner of a new project, and keeps it on edits', () => {
    const user1 = as('u-user1');
    const plan = user1.add(input);
    expect(plan.ownerId).toBe('u-user1');
    user1.update(plan.id, { ...input, name: 'แก้ไข' });
    expect(user1.getById(plan.id)).toMatchObject({ name: 'แก้ไข', ownerId: 'u-user1' });
  });

  it('shows a User their own projects and the ones they are responsible for, or for one of its activities', () => {
    const user1 = as('u-user1');
    user1.add({ ...input, name: 'รับผิดชอบโครงการ', responsibleId: 'u-user2' });
    const withActivity = user1.add({ ...input, name: 'รับผิดชอบกิจกรรม' });
    user1.saveActivity(withActivity.id, { ...activity('a1'), responsibleId: 'u-user2' });
    user1.add({ ...input, name: 'ส่วนตัว' });
    as('u-user2').add({ ...input, name: 'ของ user2' });

    expect(as('u-user2').plans().map((p) => p.name).sort()).toEqual(['ของ user2', 'รับผิดชอบกิจกรรม', 'รับผิดชอบโครงการ'].sort());
  });

  it('lets the account a project is assigned to set its status and manage its activities, but not edit or delete it', () => {
    const user1 = as('u-user1');
    const plan = user1.add({ ...input, responsibleId: 'u-user2' });
    user1.saveActivity(plan.id, { ...activity('a1'), todos: [{ id: 't1', text: 'งาน', done: false }] });
    user1.saveActivity(plan.id, activity('a2'));

    const user2 = as('u-user2');
    user2.update(plan.id, { ...input, name: 'แก้โดย user2', status: 'in-progress', responsibleId: 'u-admin' });
    user2.saveActivity(plan.id, {
      ...activity('a1', 'เปลี่ยนชื่อ'),
      status: 'completed',
      responsibleId: 'u-user1',
      todos: [{ id: 't1', text: 'แก้ข้อความ', done: true }, { id: 't2', text: 'เพิ่ม', done: false }],
    });
    user2.saveActivity(plan.id, activity('a3', 'เพิ่มโดย user2'));
    user2.deleteActivity(plan.id, 'a2');
    user2.delete(plan.id);

    const saved = user2.getById(plan.id)!;
    expect(saved).toMatchObject({ name: 'โครงการ', status: 'in-progress', ownerId: 'u-user1', responsibleId: 'u-user2' });
    expect(saved.activities!.map((a) => a.name)).toEqual(['เปลี่ยนชื่อ', 'เพิ่มโดย user2']);
    expect(saved.activities![0]).toMatchObject({ status: 'completed', responsibleId: 'u-user1', responsible: 'ผู้ใช้ 1 (dev)' });
    expect(saved.activities![0].todos?.map((t) => t.text)).toEqual(['แก้ข้อความ', 'เพิ่ม']);
  });

  it('lets the account responsible for an activity change only that activity', () => {
    const user1 = as('u-user1');
    const plan = user1.add(input);
    user1.saveActivity(plan.id, { ...activity('mine'), responsibleId: 'u-user2' });
    user1.saveActivity(plan.id, activity('other'));

    const user2 = as('u-user2');
    user2.update(plan.id, { ...input, status: 'cancelled' });
    user2.saveActivity(plan.id, { ...activity('mine', 'เปลี่ยนชื่อ'), status: 'delayed' });
    user2.saveActivity(plan.id, { ...activity('other'), status: 'delayed' });
    user2.saveActivity(plan.id, activity('new'));
    user2.deleteActivity(plan.id, 'other');

    const saved = user2.getById(plan.id)!;
    expect(saved.status).toBe('planned');
    expect(saved.activities!.map((a) => `${a.id}:${a.name}:${a.status}`)).toEqual(['mine:กิจกรรม:delayed', 'other:กิจกรรม:planned']);
  });

  it('shows every project in the Dashboard overview, but none to Super Admin', () => {
    as('u-user1').add(input);
    as('u-admin').add(input);
    const user2 = as('u-user2');
    expect(user2.plans()).toEqual([]);
    expect(user2.allPlans()).toHaveLength(2);
    expect(as('u-superadmin').allPlans()).toEqual([]);
  });

  it('ignores changes to a project the account cannot see', () => {
    const plan = as('u-user1').add(input);
    const user2 = as('u-user2');
    user2.update(plan.id, { ...input, name: 'แอบแก้' });
    user2.delete(plan.id);
    expect(as('u-user1').getById(plan.id)?.name).toBe('โครงการ');
  });

  it('names the responsible account, follows its renames, and keeps a typed-in name without one', async () => {
    const user1 = as('u-user1');
    const linked = user1.add({ ...input, responsibleId: 'u-user2', responsible: 'อะไรก็ได้' });
    expect(linked.responsible).toBe('ผู้ใช้ 2 (dev)');
    user1.saveActivity(linked.id, { ...activity('a1'), responsibleId: 'u-user1' });
    expect(user1.add(input)).toMatchObject({ responsibleId: undefined, responsible: 'ฝ่าย ก' });
    expect(user1.add({ ...input, responsibleId: 'u-superadmin' }).responsibleId).toBeUndefined();

    await TestBed.inject(UserStore).update({ id: 'u-admin', role: 'ADMIN' }, 'u-user2', { displayName: 'ชื่อใหม่' });
    const plan = user1.getById(linked.id)!;
    expect(plan.responsible).toBe('ชื่อใหม่');
    expect(plan.activities?.[0].responsible).toBe('ผู้ใช้ 1 (dev)');
  });

  it('lets Admin see, edit and delete every project and change who is responsible, narrowed by the person filter', () => {
    const own = as('u-user1').add(input);
    const responsible = as('u-user2').add({ ...input, responsibleId: 'u-user1' });
    const other = as('u-user2').add(input);

    const admin = as('u-admin');
    expect(admin.plans()).toHaveLength(3);
    TestBed.inject(DataScopeService).setOwnerFilter('u-user1');
    expect(admin.plans().map((p) => p.id).sort()).toEqual([own.id, responsible.id].sort());
    expect(admin.getById(other.id)).toBeTruthy();

    const admin2 = as('u-admin');
    admin2.update(own.id, { ...input, name: 'Admin แก้', responsibleId: 'u-user2' });
    expect(admin2.getById(own.id)).toMatchObject({ name: 'Admin แก้', ownerId: 'u-user1', responsibleId: 'u-user2' });
    admin2.delete(own.id);
    expect(admin2.plans()).toHaveLength(2);
  });

  it('shows Super Admin no projects', () => {
    as('u-user1').add(input);
    expect(as('u-superadmin').plans()).toEqual([]);
  });

  it('gives projects saved before accounts existed to the admin account', () => {
    localStorage.setItem('awp:plans:v1', JSON.stringify([{ ...input, id: 'old', createdAt: '', updatedAt: '' }]));
    expect(as('u-admin').getById('old')?.ownerId).toBe('u-admin');
    expect(JSON.parse(localStorage.getItem('awp:plans:v1')!)[0].ownerId).toBe('u-admin');
    expect(as('u-user1').plans()).toEqual([]);
  });

  it('drops the assignees of the version before responsible accounts', () => {
    localStorage.setItem('awp:plans:v1', JSON.stringify([{ ...input, id: 'p', ownerId: 'u-user1', assigneeIds: ['u-user2'], createdAt: '', updatedAt: '' }]));
    expect(as('u-user1').getById('p')).not.toHaveProperty('assigneeIds');
    expect(as('u-user2').plans()).toEqual([]);
  });
});
