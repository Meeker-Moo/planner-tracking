import {
  Actor,
  assignableRoles,
  canReassign,
  canDelete,
  canEdit,
  canEditPlan,
  canManageActivities,
  canManageUser,
  canManageUsers,
  canSetActivityStatus,
  canSetPlanStatus,
  canUseEvents,
  canUseProjects,
  canView,
  canViewPlan,
} from './permissions';

const superAdmin: Actor = { id: 's', role: 'SUPER_ADMIN' };
const otherSuper: Actor = { id: 's2', role: 'SUPER_ADMIN' };
const admin: Actor = { id: 'a', role: 'ADMIN' };
const otherAdmin: Actor = { id: 'a2', role: 'ADMIN' };
const user: Actor = { id: 'u', role: 'USER' };
const otherUser: Actor = { id: 'u2', role: 'USER' };

describe('permissions: accounts', () => {
  it('lets Super Admin give any role, Admin only User, and User none', () => {
    expect(assignableRoles(superAdmin)).toEqual(['SUPER_ADMIN', 'ADMIN', 'USER']);
    expect(assignableRoles(admin)).toEqual(['USER']);
    expect(assignableRoles(user)).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it('lets Super Admin manage every other account', () => {
    for (const target of [otherSuper, admin, user]) expect(canManageUser(superAdmin, target)).toBe(true);
  });

  it('lets Admin manage only User accounts', () => {
    expect(canManageUser(admin, user)).toBe(true);
    expect(canManageUser(admin, otherAdmin)).toBe(false);
    expect(canManageUser(admin, superAdmin)).toBe(false);
  });

  it('lets a User manage nobody, and nobody manage their own account', () => {
    expect(canManageUser(user, otherUser)).toBe(false);
    expect(canManageUser(null, user)).toBe(false);
    for (const self of [superAdmin, admin, user]) expect(canManageUser(self, self)).toBe(false);
  });

  it('opens user management to Super Admin and Admin, and the project pages to Admin and User', () => {
    expect([superAdmin, admin, user, null].map(canManageUsers)).toEqual([true, true, false, false]);
    expect([superAdmin, admin, user, null].map(canUseProjects)).toEqual([false, true, true, false]);
  });
});

describe('permissions: events', () => {
  const own = { ownerId: 'u' };
  const assigned = { ownerId: 'u2', assigneeIds: ['u'] };
  const others = { ownerId: 'u2', assigneeIds: ['u3'] };

  it('lets a User see and edit what they created or were assigned, and nothing else', () => {
    expect([own, assigned, others].map((item) => canView(user, item))).toEqual([true, true, false]);
    expect([own, assigned, others].map((item) => canEdit(user, item))).toEqual([true, true, false]);
  });

  it('keeps deleting and choosing assignees for the owner', () => {
    expect([own, assigned, others].map((item) => canDelete(user, item))).toEqual([true, false, false]);
    expect([own, assigned, others].map((item) => canReassign(user, item))).toEqual([true, false, false]);
  });

  it('lets Admin do everything with anyone’s items', () => {
    for (const item of [own, assigned, others, {}]) {
      expect([canView, canEdit, canDelete, canReassign].map((rule) => rule(admin, item))).toEqual([true, true, true, true]);
    }
  });

  it('gives Super Admin and signed-out visitors nothing', () => {
    for (const actor of [superAdmin, null]) {
      expect([canView, canEdit, canDelete].map((rule) => rule(actor, { ownerId: 's' }))).toEqual([false, false, false]);
    }
  });
});

describe('permissions: projects', () => {
  const activityOfUser = { responsibleId: 'u' };
  const otherActivity = { responsibleId: 'u2' };
  const own = { ownerId: 'u' };
  const responsibleFor = { ownerId: 'u2', responsibleId: 'u', activities: [otherActivity] };
  const hasMyActivity = { ownerId: 'u2', responsibleId: 'u2', activities: [otherActivity, activityOfUser] };
  const others = { ownerId: 'u2', responsibleId: 'u2', activities: [otherActivity] };

  it('shows a User their own projects and the ones they or one of their activities are responsible for', () => {
    expect([own, responsibleFor, hasMyActivity, others].map((p) => canViewPlan(user, p))).toEqual([true, true, true, false]);
  });

  it('lets only the owner and Admin edit a project in full', () => {
    expect([own, responsibleFor, hasMyActivity, others].map((p) => canEditPlan(user, p))).toEqual([true, false, false, false]);
    expect([own, responsibleFor, hasMyActivity, others].map((p) => canEditPlan(admin, p))).toEqual([true, true, true, true]);
  });

  it('lets the account a project is assigned to set its status and manage its activities, but not edit or delete it', () => {
    expect([own, responsibleFor, hasMyActivity, others].map((p) => canSetPlanStatus(user, p))).toEqual([true, true, false, false]);
    expect([own, responsibleFor, hasMyActivity, others].map((p) => canManageActivities(user, p))).toEqual([true, true, false, false]);
    expect(canSetActivityStatus(user, responsibleFor, otherActivity)).toBe(true);
    expect(canEditPlan(user, responsibleFor)).toBe(false);
  });

  it('lets the account responsible for an activity set the status of that activity only', () => {
    expect(canSetActivityStatus(user, hasMyActivity, activityOfUser)).toBe(true);
    expect(canSetActivityStatus(user, hasMyActivity, otherActivity)).toBe(false);
    expect(canSetActivityStatus(user, others, activityOfUser)).toBe(true);
  });

  it('gives Super Admin no project, and Monthly Report to Admin only', () => {
    expect([canViewPlan, canEditPlan, canSetPlanStatus].map((rule) => rule(superAdmin, { ownerId: 's', responsibleId: 's' }))).toEqual([false, false, false]);
    expect([superAdmin, admin, user, null].map(canUseEvents)).toEqual([false, true, false, false]);
  });
});
