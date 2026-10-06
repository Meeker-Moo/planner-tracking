import { Actor, canEdit, canReassign } from '../src/app/core/auth/permissions';
import { CalendarEvent } from '../src/app/core/models/calendar-event.model';
import { cleanAssignees } from '../src/app/core/services/owned-records';
import { Directory } from './db';
import { forbidden } from './http';
import { compact, EventBody } from './validate';

// The event rules of permissions.ts applied to a change, as EventService does in the app. Pure (event-rules.spec.ts).

/** Assignees are USER accounts other than the owner. */
function assignees(ids: string[] | undefined, ownerId: string | undefined, dir: Directory): string[] | undefined {
  return cleanAssignees(ids, ownerId, (id) => dir.get(id)?.role === 'USER');
}

export function createEvent(actor: Actor, body: EventBody, dir: Directory, id: string, now: string): CalendarEvent {
  const { id: _id, updatedAt: _updatedAt, assigneeIds, ...input } = body;
  return compact({
    ...input,
    id,
    ownerId: actor.id,
    assigneeIds: assignees(assigneeIds, actor.id, dir),
    createdAt: now,
    updatedAt: now,
  });
}

/** The stored event after the actor's change; its owner never changes, its assignees only for the owner and Admin. */
export function updateEvent(actor: Actor, stored: CalendarEvent, body: EventBody, dir: Directory, now: string): CalendarEvent {
  if (!canEdit(actor, stored)) throw forbidden();
  const { id: _id, updatedAt: _updatedAt, assigneeIds, ...input } = body;
  return compact({
    ...input,
    id: stored.id,
    ownerId: stored.ownerId,
    assigneeIds: 'assigneeIds' in body && canReassign(actor, stored) ? assignees(assigneeIds, stored.ownerId, dir) : stored.assigneeIds,
    createdAt: stored.createdAt,
    updatedAt: now,
  });
}
