import { TestBed } from '@angular/core/testing';
import { CalendarEventInput } from '../models/calendar-event.model';
import { EventService, upgradeSavedEvent } from './event.service';

const input: CalendarEventInput = {
  startDate: '2026-09-17',
  endDate: '2026-09-17',
  title: 'ประชุมทีม',
};

describe('EventService', () => {
  let service: EventService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
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

  it('merges by id and replaces everything', () => {
    const one = service.add(input);
    const incoming = [
      { ...one, title: 'เปลี่ยนชื่อ' },
      { ...one, id: 'new', title: 'ใหม่' },
    ];
    service.mergeAll(incoming);
    expect(service.events().map((e) => e.title)).toEqual(['เปลี่ยนชื่อ', 'ใหม่']);
    service.replaceAll([incoming[1]]);
    expect(service.events().map((e) => e.id)).toEqual(['new']);
  });

  it('saves to localStorage and reads it back', () => {
    service.add(input);
    expect(JSON.parse(localStorage.getItem('awp:events:v1') ?? '[]')).toHaveLength(1);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(EventService);
    expect(reloaded.events()).toHaveLength(1);
  });

  it('reads events saved before date ranges and the four priorities', () => {
    const old = { id: 'o', date: '2026-09-17', startTime: '09:00', endTime: '10:00', title: 'เก่า', priority: 'high', createdAt: '', updatedAt: '' };
    localStorage.setItem('awp:events:v1', JSON.stringify([old, { ...old, id: 'm', priority: 'medium' }]));
    TestBed.resetTestingModule();
    const [first, second] = TestBed.inject(EventService).events();
    expect(first).toEqual({ id: 'o', startDate: '2026-09-17', endDate: '2026-09-17', title: 'เก่า', priority: 'urgent', createdAt: '', updatedAt: '' });
    expect(second.priority).toBe('normal');
  });

  it('leaves an event already in the current shape alone', () => {
    const current = { ...input, id: 'c', priority: 'adhoc' as const, endDate: '2026-09-20', createdAt: '', updatedAt: '' };
    expect(upgradeSavedEvent(current)).toEqual(current);
  });
});
