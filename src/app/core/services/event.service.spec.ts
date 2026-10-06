import { TestBed } from '@angular/core/testing';
import { CalendarEventInput } from '../models/calendar-event.model';
import { EventService, upgradeSavedEvent } from './event.service';
import { freshTestBed } from '../auth/auth.testing';

const input: CalendarEventInput = {
  startDate: '2026-09-17',
  endDate: '2026-09-17',
  title: 'ประชุมทีม',
};

describe('EventService', () => {
  let service: EventService;

  beforeEach(() => {
    localStorage.clear();
    freshTestBed('u-admin');
    service = TestBed.inject(EventService);
  });

  it('adds an event with an id and timestamps', () => {
    const event = service.add(input);
    expect(event.id).toBeTruthy();
    expect(event.createdAt).toBe(event.updatedAt);
    expect(service.events()).toEqual([event]);
  });

  it('updates only the chosen event', () => {
    const one = service.add(input);
    const two = service.add({ ...input, title: 'อีกงาน' });
    service.update(one.id, { ...input, title: 'ประชุมทีม (เลื่อน)', endDate: '2026-09-19' });
    expect(service.events().find((e) => e.id === one.id)).toMatchObject({ title: 'ประชุมทีม (เลื่อน)', endDate: '2026-09-19' });
    expect(service.events().find((e) => e.id === two.id)?.title).toBe('อีกงาน');
  });

  it('deletes an event', () => {
    const one = service.add(input);
    service.add({ ...input, title: 'อีกงาน' });
    service.delete(one.id);
    expect(service.events().map((e) => e.title)).toEqual(['อีกงาน']);
  });

  it('keeps the link fields it is given', () => {
    const event = service.add({ ...input, projectId: 'p1', projectName: 'โครงการ', activityId: 'a1', activityName: 'กิจกรรม' });
    expect(service.events()[0]).toMatchObject({ id: event.id, projectId: 'p1', activityId: 'a1' });
  });

  it('marks only the chosen event done and back', () => {
    const one = service.add({ ...input, priority: 'urgent' });
    const two = service.add(input);
    service.setDone(one.id, true);
    expect(service.events().find((e) => e.id === one.id)).toMatchObject({ done: true, priority: 'urgent' });
    expect(service.events().find((e) => e.id === two.id)?.done).toBeUndefined();
    service.setDone(one.id, false);
    expect(service.events().find((e) => e.id === one.id)?.done).toBe(false);
  });

  it('saves to localStorage and reads it back', () => {
    service.add(input);
    expect(JSON.parse(localStorage.getItem('awp:events:v1') ?? '[]')).toHaveLength(1);

    freshTestBed('u-admin');
    const reloaded = TestBed.inject(EventService);
    expect(reloaded.events()).toHaveLength(1);
  });

  it('reads events saved before date ranges and the four priorities', () => {
    const old = { id: 'o', date: '2026-09-17', startTime: '09:00', endTime: '10:00', title: 'เก่า', priority: 'high', createdAt: '', updatedAt: '' };
    localStorage.setItem('awp:events:v1', JSON.stringify([old, { ...old, id: 'm', priority: 'medium' }]));
    freshTestBed('u-admin');
    const [first, second] = TestBed.inject(EventService).events();
    expect(first).toEqual({ id: 'o', startDate: '2026-09-17', endDate: '2026-09-17', title: 'เก่า', priority: 'urgent', ownerId: 'u-admin', createdAt: '', updatedAt: '' });
    expect(second.priority).toBe('normal');
  });

  it('leaves an event already in the current shape alone', () => {
    const current = { ...input, id: 'c', priority: 'adhoc' as const, endDate: '2026-09-20', createdAt: '', updatedAt: '' };
    expect(upgradeSavedEvent(current)).toEqual(current);
  });
});

describe('EventService ownership', () => {
  function as(userId: string): EventService {
    freshTestBed(userId);
    return TestBed.inject(EventService);
  }

  beforeEach(() => localStorage.clear());

  it('shows a User their own and assigned events, and lets an assignee tick but not delete', () => {
    const user1 = as('u-user1');
    const shared = user1.add({ ...input, assigneeIds: ['u-user2'] });
    user1.add({ ...input, title: 'ส่วนตัว' });

    const user2 = as('u-user2');
    expect(user2.events().map((e) => e.id)).toEqual([shared.id]);
    user2.setDone(shared.id, true);
    user2.update(shared.id, { ...input, title: 'แก้โดย user2', done: true, assigneeIds: [] });
    user2.delete(shared.id);
    expect(user2.events()[0]).toMatchObject({ title: 'แก้โดย user2', done: true, ownerId: 'u-user1', assigneeIds: ['u-user2'] });
  });

  it('lets the owner and Admin delete', () => {
    const event = as('u-user1').add(input);
    const admin = as('u-admin');
    expect(admin.events()).toHaveLength(1);
    admin.delete(event.id);
    expect(as('u-user1').events()).toEqual([]);
  });
});
