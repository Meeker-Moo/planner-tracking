import { Role } from './user.model';

/** The parts of an account the rules look at. */
export interface Actor {
  id: string;
  role: Role;
  active?: boolean;
}

/** An event: who created it and who it is assigned to. (Projects follow their own rules below.) */
export interface Owned {
  ownerId?: string;
  assigneeIds?: string[];
}

/** The roles an account may give when creating or editing another one. */
export function assignableRoles(actor: Actor | null): Role[] {
  if (actor?.role === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', 'USER'];
  if (actor?.role === 'ADMIN') return ['USER'];
  return [];
}

/**
 * Whether the actor may edit, deactivate or reset the password of the target account: Super Admin any
 * other account, Admin only USER accounts, User none. Nobody manages their own account here (a password
 * is changed on the change-password page), which also keeps the last Super Admin from locking themselves out.
 */
export function canManageUser(actor: Actor | null, target: Actor): boolean {
  if (!actor || actor.id === target.id) return false;
  if (actor.role === 'SUPER_ADMIN') return true;
  return actor.role === 'ADMIN' && target.role === 'USER';
}

/** Whether the user management page is open to the account. */
export function canManageUsers(user: Actor | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
}

/** Projects, Timeline, Monthly Report and the Dashboard: every role except Super Admin, which only manages accounts. */
export function canUseProjects(user: Actor | null): user is Actor {
  return !!user && user.role !== 'SUPER_ADMIN';
}

function isOwner(user: Actor, item: Owned): boolean {
  return item.ownerId === user.id;
}

function isAssignee(user: Actor, item: Owned): boolean {
  return !!item.assigneeIds?.includes(user.id);
}

/** Admin sees everything; a User sees what they created or were assigned. */
export function canView(user: Actor | null, item: Owned): boolean {
  if (!canUseProjects(user)) return false;
  return user.role === 'ADMIN' || isOwner(user, item) || isAssignee(user, item);
}

/** Whoever can see an item can edit it, including its activities and to-dos. */
export function canEdit(user: Actor | null, item: Owned): boolean {
  return canView(user, item);
}

/** Deleting is for the owner and Admin; an assignee cannot. */
export function canDelete(user: Actor | null, item: Owned): boolean {
  if (!canUseProjects(user)) return false;
  return user.role === 'ADMIN' || isOwner(user, item);
}

/** Choosing who is assigned or responsible is for the owner and Admin, like deleting. */
export function canReassign(user: Actor | null, item: Owned): boolean {
  return canDelete(user, item);
}

/** The parts of a project the project rules look at. */
export interface PlanAccess {
  ownerId?: string;
  responsibleId?: string;
  activities?: { responsibleId?: string }[];
}

/** Monthly Report (events) is for Admin; a User has the project list, Timeline and Dashboard. */
export function canUseEvents(user: Actor | null): boolean {
  return user?.role === 'ADMIN';
}

/**
 * Admin sees every project; a User the ones they created, the ones they are responsible for, and the ones
 * where they are responsible for an activity. (The Dashboard shows every project to both: see WorkPlanService.)
 */
export function canViewPlan(user: Actor | null, plan: PlanAccess): boolean {
  if (!canUseProjects(user)) return false;
  return (
    user.role === 'ADMIN' ||
    plan.ownerId === user.id ||
    plan.responsibleId === user.id ||
    !!plan.activities?.some((a) => a.responsibleId === user.id)
  );
}

/** The project itself (its details, who is responsible, deleting it): the owner and Admin. */
export function canEditPlan(user: Actor | null, plan: PlanAccess): boolean {
  if (!canUseProjects(user)) return false;
  return user.role === 'ADMIN' || plan.ownerId === user.id;
}

/**
 * The project's activities and their to-dos (adding, editing, removing): also the account the project is
 * assigned to, i.e. responsible for it. It still may not change the project's details or delete it.
 */
export function canManageActivities(user: Actor | null, plan: PlanAccess): boolean {
  return canEditPlan(user, plan) || (canUseProjects(user) && plan.responsibleId === user.id);
}

/** The project's status: the owner, Admin and the account responsible for the project. */
export function canSetPlanStatus(user: Actor | null, plan: PlanAccess): boolean {
  return canManageActivities(user, plan);
}

/**
 * An activity's status, note and to-do ticks: also the account responsible for that activity alone,
 * which may change nothing else.
 */
export function canSetActivityStatus(user: Actor | null, plan: PlanAccess, activity: { responsibleId?: string }): boolean {
  return canManageActivities(user, plan) || (canUseProjects(user) && activity.responsibleId === user.id);
}
