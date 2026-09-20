import { TestBed } from '@angular/core/testing';
import { CalendarEventInput } from '../models/calendar-event.model';
import { EventService } from './event.service';

const input: CalendarEventInput = {
  date: '2026-09-17',
  startTime: '09:00',
  endTime: '10:00',
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
    service.update(one.id, { ...input, title: 'ประชุมทีม (เลื่อน)', endTime: '11:00' });
    expect(service.events().find((e) => e.id === one.id)).toMatchObject({ title: 'ประชุมทีม (เลื่อน)', endTime: '11:00' });
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
});
