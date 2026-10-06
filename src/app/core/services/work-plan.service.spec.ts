import { TestBed } from '@angular/core/testing';
import { Activity, WorkPlanInput } from '../models/work-plan.model';
import { WorkPlanService } from './work-plan.service';
import { DataScopeService } from './data-scope.service';
import { currentFiscalYear } from '../../shared/utils/date.util';
import { backend, freshTestBed, resetBackend, settle } from '../auth/auth.testing';
import { AuthService } from '../auth/auth.service';

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

/** The WorkPlanService of a fresh page signed in as the account, loading what earlier pages sent. */
async function as(userId: string): Promise<WorkPlanService> {
  await freshTestBed(userId);
  return TestBed.inject(WorkPlanService);
}

describe('WorkPlanService activities', () => {
  let service: WorkPlanService;

  beforeEach(async () => {
    await resetBackend();
    service = await as('u-user1');
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

  it('records when the status of a project or an activity last changed', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
      const plan = service.add(input);
      service.saveActivity(plan.id, activity('a1'));
      expect(plan.statusUpdatedAt).toBe('2026-10-01T09:00:00.000Z');
      expect(service.getById(plan.id)?.activities?.[0].statusUpdatedAt).toBe('2026-10-01T09:00:00.000Z');

      vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
      service.update(plan.id, { ...input, name: 'ชื่อใหม่' });
      service.saveActivity(plan.id, { ...activity('a1'), name: 'ชื่อใหม่' });
      let saved = service.getById(plan.id)!;
      expect(saved.statusUpdatedAt).toBe('2026-10-01T09:00:00.000Z');
      expect(saved.activities![0].statusUpdatedAt).toBe('2026-10-01T09:00:00.000Z');

      vi.setSystemTime(new Date('2026-10-03T11:30:00Z'));
      service.update(plan.id, { ...input, status: 'in-progress' });
      service.saveActivity(plan.id, { ...activity('a1'), status: 'completed' });
      saved = service.getById(plan.id)!;
      expect(saved.statusUpdatedAt).toBe('2026-10-03T11:30:00.000Z');
      expect(saved.activities![0].statusUpdatedAt).toBe('2026-10-03T11:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends quick changes one after another, each from the version the last one returned', async () => {
    const plan = service.add(input);
    service.saveActivity(plan.id, activity('a1'));
    service.saveActivity(plan.id, activity('a2'));
    service.saveActivity(plan.id, { ...activity('a1'), todos: [{ id: 't1', text: 'x', done: true }] });
    await settle();

    expect(backend.plans).toHaveLength(1);
    expect(backend.plans[0].activities?.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(backend.plans[0].activities?.[0].todos?.[0].done).toBe(true);
    expect(backend.requests.filter((r) => r.path.startsWith('/plans') && r.method !== 'GET').map((r) => r.method)[0]).toBe('POST');
    expect(service.getById(plan.id)?.updatedAt).toBe(backend.plans[0].updatedAt);
  });

  it('deletes a project on the server even right after adding it', async () => {
    const plan = service.add(input);
    service.delete(plan.id);
    await settle();
    expect(backend.plans).toEqual([]);
  });

  it('tells the person when someone else saved first, and shows what is stored', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    try {
      const plan = service.add(input);
      await settle();
      backend.plans[0] = { ...backend.plans[0], name: 'แก้จากที่อื่น', updatedAt: 'changed elsewhere' };
      service.update(plan.id, { ...input, name: 'แก้ที่นี่' });
      await settle();
      await vi.waitFor(() => expect(service.getById(plan.id)?.name).toBe('แก้จากที่อื่น'));
      expect(alert).toHaveBeenCalledWith(expect.stringContaining('มีคนแก้ไขข้อมูลนี้ก่อนหน้า'));
    } finally {
      alert.mockRestore();
    }
  });
});

describe('WorkPlanService years', () => {
  let service: WorkPlanService;

  beforeEach(async () => {
    await resetBackend();
    service = await as('u-user1');
  });

  it('is just the current fiscal year when there are no projects', () => {
    expect(service.years()).toEqual([currentFiscalYear()]);
    expect(service.yearsWithPlans()).toEqual([]);
  });

  it('fills the gap between the oldest project and the current year, newest first', () => {
    const now = currentFiscalYear();
    service.add({ ...input, year: now - 3, startDate: `${now - 3 - 543}-01-01` });
    service.add({ ...input, year: now - 1, startDate: `${now - 1 - 543}-01-01` });
    expect(service.years()).toEqual([now, now - 1, now - 2, now - 3]);
    expect(service.yearsWithPlans()).toEqual([now - 1, now - 3]);
  });

  it('reaches forward to a project planned after the current year', () => {
    const now = currentFiscalYear();
    service.add({ ...input, year: now + 2, startDate: `${now + 2 - 543}-01-01` });
    expect(service.years()).toEqual([now + 2, now + 1, now]);
  });
});

describe('WorkPlanService ownership', () => {
  beforeEach(() => resetBackend());

  it('makes the signed-in account the owner of a new project, and keeps it on edits', async () => {
    const user1 = await as('u-user1');
    const plan = user1.add(input);
    expect(plan.ownerId).toBe('u-user1');
    user1.update(plan.id, { ...input, name: 'แก้ไข' });
    expect(user1.getById(plan.id)).toMatchObject({ name: 'แก้ไข', ownerId: 'u-user1' });
  });

  it('shows a User their own projects and the ones they are responsible for, or for one of its activities', async () => {
    const user1 = await as('u-user1');
    user1.add({ ...input, name: 'รับผิดชอบโครงการ', responsibleId: 'u-user2' });
    const withActivity = user1.add({ ...input, name: 'รับผิดชอบกิจกรรม' });
    user1.saveActivity(withActivity.id, { ...activity('a1'), responsibleId: 'u-user2' });
    user1.add({ ...input, name: 'ส่วนตัว' });
    (await as('u-user2')).add({ ...input, name: 'ของ user2' });

    const user2 = await as('u-user2');
    expect(user2.plans().map((p) => p.name).sort()).toEqual(['ของ user2', 'รับผิดชอบกิจกรรม', 'รับผิดชอบโครงการ'].sort());
  });

  it('lets the account a project is assigned to set its status and manage its activities, but not edit or delete it', async () => {
    const user1 = await as('u-user1');
    const plan = user1.add({ ...input, responsibleId: 'u-user2' });
    user1.saveActivity(plan.id, { ...activity('a1'), todos: [{ id: 't1', text: 'งาน', done: false }] });
    user1.saveActivity(plan.id, activity('a2'));

    const user2 = await as('u-user2');
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

  it('lets the account responsible for an activity change only that activity', async () => {
    const user1 = await as('u-user1');
    const plan = user1.add(input);
    user1.saveActivity(plan.id, { ...activity('mine'), responsibleId: 'u-user2' });
    user1.saveActivity(plan.id, activity('other'));

    const user2 = await as('u-user2');
    user2.update(plan.id, { ...input, status: 'cancelled' });
    user2.saveActivity(plan.id, { ...activity('mine', 'เปลี่ยนชื่อ'), status: 'delayed' });
    user2.saveActivity(plan.id, { ...activity('other'), status: 'delayed' });
    user2.saveActivity(plan.id, activity('new'));
    user2.deleteActivity(plan.id, 'other');

    const saved = user2.getById(plan.id)!;
    expect(saved.status).toBe('planned');
    expect(saved.activities!.map((a) => `${a.id}:${a.name}:${a.status}`)).toEqual(['mine:กิจกรรม:delayed', 'other:กิจกรรม:planned']);
  });

  it("gives the Dashboard every project's numbers, but not the projects themselves", async () => {
    (await as('u-user1')).add(input);
    (await as('u-admin')).add(input);
    const user2 = await as('u-user2');
    expect(user2.plans()).toEqual([]);
    const { summary } = await user2.summary(2569);
    expect(summary.projectCount).toBe(2);
  });

  it('ignores changes to a project the account cannot see', async () => {
    const plan = (await as('u-user1')).add(input);
    const user2 = await as('u-user2');
    user2.update(plan.id, { ...input, name: 'แอบแก้' });
    user2.delete(plan.id);
    expect((await as('u-user1')).getById(plan.id)?.name).toBe('โครงการ');
  });

  it('names the responsible account, follows its renames, and keeps a typed-in name without one', async () => {
    const user1 = await as('u-user1');
    const linked = user1.add({ ...input, responsibleId: 'u-user2', responsible: 'อะไรก็ได้' });
    expect(linked.responsible).toBe('ผู้ใช้ 2 (dev)');
    user1.saveActivity(linked.id, { ...activity('a1'), responsibleId: 'u-user1' });
    expect(user1.add(input)).toMatchObject({ responsibleId: undefined, responsible: 'ฝ่าย ก' });
    expect(user1.add({ ...input, responsibleId: 'u-superadmin' }).responsibleId).toBeUndefined();

    await settle();
    backend.users.find((u) => u.id === 'u-user2')!.displayName = 'ชื่อใหม่';
    const plan = (await as('u-user1')).getById(linked.id)!;
    expect(plan.responsible).toBe('ชื่อใหม่');
    expect(plan.activities?.[0].responsible).toBe('ผู้ใช้ 1 (dev)');
  });

  it('lets Admin see, edit and delete every project and change who is responsible, narrowed by the person filter', async () => {
    const own = (await as('u-user1')).add(input);
    const responsible = (await as('u-user2')).add({ ...input, responsibleId: 'u-user1' });
    const other = (await as('u-user2')).add(input);

    const admin = await as('u-admin');
    expect(admin.plans()).toHaveLength(3);
    TestBed.inject(DataScopeService).setOwnerFilter('u-user1');
    expect(admin.plans().map((p) => p.id).sort()).toEqual([own.id, responsible.id].sort());
    expect(admin.getById(other.id)).toBeTruthy();

    const admin2 = await as('u-admin');
    admin2.update(own.id, { ...input, name: 'Admin แก้', responsibleId: 'u-user2' });
    expect(admin2.getById(own.id)).toMatchObject({ name: 'Admin แก้', ownerId: 'u-user1', responsibleId: 'u-user2' });
    admin2.delete(own.id);
    expect(admin2.plans()).toHaveLength(2);
    expect((await as('u-admin')).plans()).toHaveLength(2);
  });

  it('shows Super Admin no projects', async () => {
    (await as('u-user1')).add(input);
    expect((await as('u-superadmin')).plans()).toEqual([]);
  });

  it('forgets the projects when the account signs out, and loads the next account’s', async () => {
    (await as('u-user1')).add(input);
    const user1 = await as('u-user1');
    expect(user1.plans()).toHaveLength(1);

    const auth = TestBed.inject(AuthService);
    auth.logout();
    TestBed.tick();
    expect(user1.plans()).toEqual([]);

    await auth.login('admin', 'admin1234', false);
    TestBed.tick();
    await user1.ready();
    expect(user1.plans()).toHaveLength(1);
  });
});
