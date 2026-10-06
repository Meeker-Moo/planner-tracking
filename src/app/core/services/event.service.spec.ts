import { TestBed } from '@angular/core/testing';
import { CalendarEventInput } from '../models/calendar-event.model';
import { EventService, upgradeSavedEvent } from './event.service';
import { backend, freshTestBed, resetBackend, settle } from '../auth/auth.testing';

const input: CalendarEventInput = {
  startDate: '2026-09-17',
  endDate: '2026-09-17',
  title: 'ประชุมทีม',
};

/** The EventService of a fresh page signed in as the account, loading what earlier pages sent. */
async function as(userId: string): Promise<EventService> {
  await freshTestBed(userId);
  return TestBed.inject(EventService);
}

describe('EventService', () => {
  let service: EventService;

  beforeEach(async () => {
    await resetBackend();
    service = await as('u-admin');
  });

  it('adds an event with an id and timestamps', () => {
    const event = service.add(input)!;
    expect(event.id).toBeTruthy();
    expect(event.createdAt).toBe(event.updatedAt);
    expect(service.events()).toEqual([event]);
  });

  it('updates only the chosen event', () => {
    const one = service.add(input)!;
    const two = service.add({ ...input, title: 'อีกงาน' })!;
    service.update(one.id, { ...input, title: 'ประชุมทีม (เลื่อน)', endDate: '2026-09-19' });
    expect(service.events().find((e) => e.id === one.id)).toMatchObject({ title: 'ประชุมทีม (เลื่อน)', endDate: '2026-09-19' });
    expect(service.events().find((e) => e.id === two.id)?.title).toBe('อีกงาน');
  });

  it('deletes an event', () => {
    const one = service.add(input)!;
    service.add({ ...input, title: 'อีกงาน' });
    service.delete(one.id);
    expect(service.events().map((e) => e.title)).toEqual(['อีกงาน']);
  });

  it('keeps the link fields it is given', () => {
    const event = service.add({ ...input, projectId: 'p1', projectName: 'โครงการ', activityId: 'a1', activityName: 'กิจกรรม' })!;
    expect(service.events()[0]).toMatchObject({ id: event.id, projectId: 'p1', activityId: 'a1' });
  });

  it('marks only the chosen event done and back', () => {
    const one = service.add({ ...input, priority: 'urgent' })!;
    const two = service.add(input)!;
    service.setDone(one.id, true);
    expect(service.events().find((e) => e.id === one.id)).toMatchObject({ done: true, priority: 'urgent' });
    expect(service.events().find((e) => e.id === two.id)?.done).toBeUndefined();
    service.setDone(one.id, false);
    expect(service.events().find((e) => e.id === one.id)?.done).toBe(false);
  });

  it('sends events to the API, and the next page loads them', async () => {
    const event = service.add(input)!;
    service.setDone(event.id, true);
    await settle();
    expect(backend.events).toHaveLength(1);
    expect(backend.events[0]).toMatchObject({ id: event.id, done: true });
    expect((await as('u-admin')).events()).toHaveLength(1);
  });

  it('reads events saved before date ranges and the four priorities', () => {
    // As read from older JSON, whose priorities the type no longer has.
    type Saved = Parameters<typeof upgradeSavedEvent>[0];
    const old = { id: 'o', date: '2026-09-17', startTime: '09:00', endTime: '10:00', title: 'เก่า', priority: 'high', createdAt: '', updatedAt: '' };
    expect(upgradeSavedEvent(old as unknown as Saved)).toEqual({ id: 'o', startDate: '2026-09-17', endDate: '2026-09-17', title: 'เก่า', priority: 'urgent', createdAt: '', updatedAt: '' });
    expect(upgradeSavedEvent({ ...old, priority: 'medium' } as unknown as Saved).priority).toBe('normal');
  });

  it('leaves an event already in the current shape alone', () => {
    const current = { ...input, id: 'c', priority: 'adhoc' as const, endDate: '2026-09-20', createdAt: '', updatedAt: '' };
    expect(upgradeSavedEvent(current)).toEqual(current);
  });
});

describe('EventService ownership', () => {
  beforeEach(() => resetBackend());

  it('lets only Admin create events (Monthly Report is Admin’s)', async () => {
    expect((await as('u-user1')).add(input)).toBeUndefined();
    await settle();
    expect(backend.events).toEqual([]);
  });

  it('shows a User the events assigned to them, and lets an assignee tick but not delete or reassign', async () => {
    const admin = await as('u-admin');
    const shared = admin.add({ ...input, assigneeIds: ['u-user2'] })!;
    admin.add({ ...input, title: 'ส่วนตัว' });

    const user2 = await as('u-user2');
    expect(user2.events().map((e) => e.id)).toEqual([shared.id]);
    user2.setDone(shared.id, true);
    user2.update(shared.id, { ...input, title: 'แก้โดย user2', done: true, assigneeIds: [] });
    user2.delete(shared.id);
    expect(user2.events()[0]).toMatchObject({ title: 'แก้โดย user2', done: true, ownerId: 'u-admin', assigneeIds: ['u-user2'] });
    expect((await as('u-user2')).events()[0]).toMatchObject({ title: 'แก้โดย user2', assigneeIds: ['u-user2'] });
  });

  it('lets Admin delete', async () => {
    const event = (await as('u-admin')).add(input)!;
    const admin = await as('u-admin');
    expect(admin.events()).toHaveLength(1);
    admin.delete(event.id);
    expect((await as('u-admin')).events()).toEqual([]);
  });
});
