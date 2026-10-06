import { describe, expect, it } from 'vitest';
import { Actor } from '../src/app/core/auth/permissions';
import { CalendarEvent } from '../src/app/core/models/calendar-event.model';
import { Directory } from './db';
import { createEvent, updateEvent } from './event-rules';
import { ApiError } from './http';
import { EventBody } from './validate';

const admin: Actor = { id: 'u-admin', role: 'ADMIN' };
const user1: Actor = { id: 'u-user1', role: 'USER' };
const user2: Actor = { id: 'u-user2', role: 'USER' };

const dir: Directory = new Map(
  [
    { id: 'u-admin', displayName: 'Admin', role: 'ADMIN' as const },
    { id: 'u-admin2', displayName: 'Admin 2', role: 'ADMIN' as const },
    { id: 'u-user1', displayName: 'User 1', role: 'USER' as const },
    { id: 'u-user2', displayName: 'User 2', role: 'USER' as const },
  ].map((u) => [u.id, { ...u, active: true }]),
);

const T0 = '2026-01-01T00:00:00.000Z';
const NOW = '2026-02-01T00:00:00.000Z';

const stored: CalendarEvent = {
  id: 'e1',
  startDate: '2026-01-05',
  endDate: '2026-01-05',
  title: 'Meeting',
  ownerId: 'u-admin',
  assigneeIds: ['u-user1'],
  createdAt: T0,
  updatedAt: T0,
};

const body = (changes: Partial<EventBody> = {}): EventBody => ({
  startDate: stored.startDate,
  endDate: stored.endDate,
  title: stored.title,
  updatedAt: T0,
  ...changes,
});

describe('createEvent', () => {
  it('keeps only USER accounts other than the owner as assignees', () => {
    const event = createEvent(admin, body({ assigneeIds: ['u-user1', 'u-user1', 'u-admin', 'u-admin2', 'u-nobody'] }), dir, 'e2', NOW);
    expect(event).toMatchObject({ id: 'e2', ownerId: 'u-admin', assigneeIds: ['u-user1'], createdAt: NOW, updatedAt: NOW });
  });
});

describe('updateEvent', () => {
  it('lets an assignee edit the event but not change who is assigned', () => {
    const event = updateEvent(user1, stored, body({ title: 'Renamed', done: true, assigneeIds: ['u-user2'] }), dir, NOW);
    expect(event).toMatchObject({ title: 'Renamed', done: true, ownerId: 'u-admin', assigneeIds: ['u-user1'], createdAt: T0 });
  });

  it('lets the owner reassign, and keeps the assignees when the body leaves them out', () => {
    expect(updateEvent(admin, stored, body({ assigneeIds: ['u-user2'] }), dir, NOW).assigneeIds).toEqual(['u-user2']);
    expect(updateEvent(admin, stored, body(), dir, NOW).assigneeIds).toEqual(['u-user1']);
  });

  it('refuses a User who is neither the owner nor assigned', () => {
    expect(() => updateEvent(user2, stored, body(), dir, NOW)).toThrow(ApiError);
  });
});
