import {
  Actor,
  canEditPlan,
  canManageActivities,
  canSetActivityStatus,
  canViewPlan,
} from '../src/app/core/auth/permissions';
import { Activity, WorkPlan } from '../src/app/core/models/work-plan.model';
import { withFiscalYear } from '../src/app/shared/utils/date.util';
import { Directory } from './db';
import { forbidden } from './http';
import { compact, PlanBody } from './validate';

// The project rules of permissions.ts applied to a change, as WorkPlanService does in the app. Pure, so it is tested
// without a database (plan-rules.spec.ts). What the actor may not change is dropped, not refused.

/** The responsible account if it can be one (Admin or User) with its name; otherwise the typed-in name alone. */
function responsibleOf(item: { responsibleId?: string; responsible?: string }, dir: Directory) {
  const user = item.responsibleId ? dir.get(item.responsibleId) : undefined;
  return user && user.role !== 'SUPER_ADMIN'
    ? { responsibleId: user.id, responsible: user.displayName }
    : { responsibleId: undefined, responsible: item.responsible ?? '' };
}

function activityOf(activity: Activity, existing: Activity | undefined, dir: Directory, now: string): Activity {
  const { responsibleId, responsible } = responsibleOf(activity, dir);
  return compact({
    ...activity,
    responsibleId,
    responsible: responsible || undefined,
    statusUpdatedAt: existing && existing.status === activity.status ? existing.statusUpdatedAt : now,
  });
}

/** The whole activity list as sent (adding, editing, removing), for whoever may manage activities. */
function allActivities(stored: Activity[], incoming: Activity[], dir: Directory, now: string): Activity[] {
  const byId = new Map(stored.map((a) => [a.id, a]));
  return incoming.map((a) => activityOf(a, byId.get(a.id), dir, now));
}

/** Only the status, note and to-do ticks of the activities the actor is responsible for; nothing added or removed. */
function activityStatuses(actor: Actor, plan: WorkPlan, incoming: Activity[], now: string): Activity[] {
  const byId = new Map(incoming.map((a) => [a.id, a]));
  return (plan.activities ?? []).map((existing) => {
    const sent = byId.get(existing.id);
    if (!sent || !canSetActivityStatus(actor, plan, existing)) return existing;
    const ticks = new Map((sent.todos ?? []).map((t) => [t.id, t.done]));
    return compact({
      ...existing,
      status: sent.status,
      note: sent.note,
      todos: existing.todos?.map((t) => ({ ...t, done: ticks.get(t.id) ?? t.done })),
      statusUpdatedAt: existing.status === sent.status ? existing.statusUpdatedAt : now,
    });
  });
}

function finish(plan: WorkPlan): WorkPlan {
  return compact(withFiscalYear({ ...plan, activities: plan.activities?.length ? plan.activities : undefined }));
}

/** A new project of the actor's. */
export function createPlan(actor: Actor, body: PlanBody, dir: Directory, id: string, now: string): WorkPlan {
  const { id: _id, updatedAt: _updatedAt, activities, ...input } = body;
  return finish({
    ...input,
    ...responsibleOf(input, dir),
    activities: allActivities([], activities ?? [], dir, now),
    id,
    ownerId: actor.id,
    statusUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * The stored project after the actor's change: the owner and Admin change anything; the account responsible for the
 * project its status and activities; the account responsible for an activity only that activity's status, note and
 * to-do ticks. Throws FORBIDDEN when the actor may not see the project at all.
 */
export function updatePlan(actor: Actor, stored: WorkPlan, body: PlanBody, dir: Directory, now: string): WorkPlan {
  if (!canViewPlan(actor, stored)) throw forbidden();
  const incoming = body.activities ?? [];
  let next: WorkPlan;
  if (canEditPlan(actor, stored)) {
    const { id: _id, updatedAt: _updatedAt, activities: _activities, ...input } = body;
    next = {
      ...input,
      ...responsibleOf(input, dir),
      activities: allActivities(stored.activities ?? [], incoming, dir, now),
      id: stored.id,
      ownerId: stored.ownerId,
      createdAt: stored.createdAt,
      updatedAt: now,
    };
  } else if (canManageActivities(actor, stored)) {
    next = { ...stored, status: body.status, activities: allActivities(stored.activities ?? [], incoming, dir, now) };
  } else {
    next = { ...stored, activities: activityStatuses(actor, stored, incoming, now) };
  }
  return finish({
    ...next,
    statusUpdatedAt: next.status === stored.status ? stored.statusUpdatedAt : now,
    updatedAt: now,
  });
}

/** The accounts that take part in a project (plan_members): responsible for it or for one of its activities. */
export function planMembers(plan: WorkPlan): string[] {
  const ids = [plan.responsibleId, ...(plan.activities ?? []).map((a) => a.responsibleId)];
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}

/** The project with the current names of the accounts responsible for it and its activities. */
export function withNames(plan: WorkPlan, dir: Directory): WorkPlan {
  const name = (id: string | undefined) => (id ? dir.get(id)?.displayName : undefined);
  return {
    ...plan,
    responsible: name(plan.responsibleId) ?? plan.responsible,
    activities: plan.activities?.map((a) => {
      const current = name(a.responsibleId);
      return current ? { ...a, responsible: current } : a;
    }),
  };
}
