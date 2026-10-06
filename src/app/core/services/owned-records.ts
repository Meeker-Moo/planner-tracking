import { Owned, PlanAccess } from '../auth/permissions';

/** Assignee ids without repeats, the owner, or ids `isAssignable` rejects; undefined when none are left. */
export function cleanAssignees(
  ids: string[] | undefined,
  ownerId: string | undefined,
  isAssignable: (id: string) => boolean,
): string[] | undefined {
  const result = Array.from(new Set(ids ?? [])).filter((id) => id !== ownerId && isAssignable(id));
  return result.length ? result : undefined;
}

/** Admin's person filter for an event: the account created it or is assigned to it. */
export function belongsTo(item: Owned, userId: string): boolean {
  return item.ownerId === userId || !!item.assigneeIds?.includes(userId);
}

/** Admin's person filter for a project: the account created it, or is responsible for it or one of its activities. */
export function planBelongsTo(plan: PlanAccess, userId: string): boolean {
  return plan.ownerId === userId || plan.responsibleId === userId || !!plan.activities?.some((a) => a.responsibleId === userId);
}
