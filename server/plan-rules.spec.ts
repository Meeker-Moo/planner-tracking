import { describe, expect, it } from 'vitest';
import { Actor } from '../src/app/core/auth/permissions';
import { Activity, WorkPlan } from '../src/app/core/models/work-plan.model';
import { Directory } from './db';
import { ApiError } from './http';
import { createPlan, planMembers, updatePlan, withNames } from './plan-rules';
import { PlanBody } from './validate';

const admin: Actor = { id: 'u-admin', role: 'ADMIN' };
const owner: Actor = { id: 'u-owner', role: 'USER' };
const lead: Actor = { id: 'u-lead', role: 'USER' }; // responsible for the project
const helper: Actor = { id: 'u-helper', role: 'USER' }; // responsible for activity a1 only
const stranger: Actor = { id: 'u-stranger', role: 'USER' };

const dir: Directory = new Map(
  [
    { id: 'u-admin', displayName: 'Admin', role: 'ADMIN' as const },
    { id: 'u-owner', displayName: 'Owner', role: 'USER' as const },
    { id: 'u-lead', displayName: 'Lead', role: 'USER' as const },
    { id: 'u-helper', displayName: 'Helper', role: 'USER' as const },
    { id: 'u-stranger', displayName: 'Stranger', role: 'USER' as const },
    { id: 'u-super', displayName: 'Super', role: 'SUPER_ADMIN' as const },
  ].map((u) => [u.id, { ...u, active: true }]),
);

const T0 = '2026-01-01T00:00:00.000Z';
const NOW = '2026-02-01T00:00:00.000Z';

const a1: Activity = {
  id: 'a1',
  name: 'Activity 1',
  responsibleId: 'u-helper',
  responsible: 'Helper',
  startDate: '2025-11-01',
  endDate: '2025-11-30',
  status: 'planned',
  statusUpdatedAt: T0,
  todos: [{ id: 't1', text: 'Todo', done: false }],
};
const a2: Activity = { id: 'a2', name: 'Activity 2', startDate: '2025-12-01', endDate: '2025-12-31', status: 'planned', statusUpdatedAt: T0 };

const stored: WorkPlan = {
  id: 'p1',
  year: 2569,
  name: 'Project',
  type: 'อื่นๆ',
  responsible: 'Lead',
  responsibleId: 'u-lead',
  startDate: '2025-10-01',
  endDate: '2026-03-31',
  status: 'planned',
  statusUpdatedAt: T0,
  activities: [a1, a2],
  ownerId: 'u-owner',
  createdAt: T0,
  updatedAt: T0,
};

/** The body the app sends: the whole project after the change. */
function body(changes: Partial<PlanBody> = {}): PlanBody {
  const { id, ownerId: _o, createdAt: _c, statusUpdatedAt: _s, ...rest } = stored;
  return { ...rest, id, ...changes };
}

const everythingChanged = () =>
  body({
    name: 'Renamed',
    status: 'in-progress',
    responsibleId: 'u-stranger',
    activities: [
      { ...a1, name: 'Renamed activity', status: 'completed', note: 'done', todos: [{ id: 't1', text: 'Changed', done: true }] },
      { id: 'a3', name: 'New', startDate: '2026-01-01', endDate: '2026-01-31', status: 'planned' },
    ],
  });

describe('createPlan', () => {
  it('belongs to the actor, takes the name of the responsible account and stamps the times', () => {
    const plan = createPlan(owner, body({ responsible: 'typed', responsibleId: 'u-lead' }), dir, 'new', NOW);
    expect(plan).toMatchObject({ id: 'new', ownerId: 'u-owner', responsible: 'Lead', createdAt: NOW, updatedAt: NOW, statusUpdatedAt: NOW });
  });

  it('keeps a typed-in name when the responsible id is not an Admin or User account', () => {
    const plan = createPlan(owner, body({ responsible: 'Someone', responsibleId: 'u-super' }), dir, 'new', NOW);
    expect(plan.responsibleId).toBeUndefined();
    expect(plan.responsible).toBe('Someone');
  });

  it('recomputes the fiscal year from the start date', () => {
    expect(createPlan(owner, body({ year: 2000 }), dir, 'new', NOW).year).toBe(2569);
  });
});

describe('updatePlan', () => {
  it('lets the owner and Admin change everything, but never the owner', () => {
    for (const actor of [owner, admin]) {
      const plan = updatePlan(actor, stored, everythingChanged(), dir, NOW);
      expect(plan.name).toBe('Renamed');
      expect(plan.responsibleId).toBe('u-stranger');
      expect(plan.ownerId).toBe('u-owner');
      expect(plan.activities!.map((a) => a.id)).toEqual(['a1', 'a3']);
      expect(plan.statusUpdatedAt).toBe(NOW);
      expect(plan.updatedAt).toBe(NOW);
    }
  });

  it('drops optional details the owner removed', () => {
    const withDescription = { ...stored, description: 'old' };
    expect(updatePlan(owner, withDescription, body(), dir, NOW).description).toBeUndefined();
  });

  it('lets the account responsible for the project change its status and activities, not its details', () => {
    const plan = updatePlan(lead, stored, everythingChanged(), dir, NOW);
    expect(plan.name).toBe('Project');
    expect(plan.responsibleId).toBe('u-lead');
    expect(plan.status).toBe('in-progress');
    expect(plan.activities!.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(plan.activities![0].name).toBe('Renamed activity');
  });

  it("lets the account responsible for an activity change only that activity's status, note and ticks", () => {
    const plan = updatePlan(helper, stored, everythingChanged(), dir, NOW);
    expect(plan.name).toBe('Project');
    expect(plan.status).toBe('planned');
    expect(plan.activities!.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(plan.activities![0]).toMatchObject({
      name: 'Activity 1',
      status: 'completed',
      note: 'done',
      statusUpdatedAt: NOW,
      todos: [{ id: 't1', text: 'Todo', done: true }],
    });
    expect(plan.activities![1]).toEqual(a2);
  });

  it('refuses an account that cannot see the project', () => {
    expect(() => updatePlan(stranger, stored, everythingChanged(), dir, NOW)).toThrow(ApiError);
    expect(() => updatePlan({ id: 'u-super', role: 'SUPER_ADMIN' }, stored, body(), dir, NOW)).toThrow(ApiError);
  });

  it('keeps the status time when the status did not change', () => {
    const plan = updatePlan(owner, stored, body({ name: 'Renamed' }), dir, NOW);
    expect(plan.statusUpdatedAt).toBe(T0);
    expect(plan.activities![0].statusUpdatedAt).toBe(T0);
  });
});

describe('planMembers', () => {
  it('lists the responsible accounts of the project and its activities once each', () => {
    const plan = { ...stored, activities: [a1, { ...a2, responsibleId: 'u-lead' }] };
    expect(planMembers(plan).sort()).toEqual(['u-helper', 'u-lead']);
  });
});

describe('withNames', () => {
  it('shows the current names of the responsible accounts', () => {
    const renamed: Directory = new Map(dir);
    renamed.set('u-lead', { id: 'u-lead', displayName: 'New lead name', role: 'USER', active: true });
    expect(withNames(stored, renamed).responsible).toBe('New lead name');
  });
});
