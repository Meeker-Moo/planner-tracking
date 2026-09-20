import { CalendarEvent } from '../../core/models/calendar-event.model';
import { parseEventsFile, serializeEvents } from './event-file.util';

const event: CalendarEvent = {
  id: 'e1',
  date: '2026-09-17',
  startTime: '09:00',
  endTime: '10:30',
  title: 'ประชุมติดตามโครงการ',
  description: 'ทบทวนความคืบหน้า',
  projectId: 'p1',
  projectName: 'โครงการ ก',
  activityId: 'a1',
  activityName: 'กิจกรรม 1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

describe('events file', () => {
  it('round-trips through serialize and parse', () => {
    const text = serializeEvents([event], new Date('2026-09-19T00:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({ type: 'monthly-report-events', version: 1, exportedAt: '2026-09-19T00:00:00.000Z' });
    expect(parseEventsFile(text)).toEqual([event]);
  });

  it('accepts a bare array and a leading BOM', () => {
    expect(parseEventsFile('﻿' + JSON.stringify([event]))).toEqual([event]);
  });

  it('fills in an id, timestamps and drops blank optional fields', () => {
    const [e] = parseEventsFile(
      JSON.stringify({ events: [{ date: '2026-09-17', startTime: '09:00', endTime: '10:00', title: ' งาน ', description: '  ', projectId: '' }] }),
    );
    expect(e.id).toBeTruthy();
    expect(e.title).toBe('งาน');
    expect(e.description).toBeUndefined();
    expect(e.projectId).toBeUndefined();
    expect(e.createdAt).toBeTruthy();
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseEventsFile('{oops')).toThrowError(/JSON/);
  });

  it('rejects a file that has no list of events', () => {
    expect(() => parseEventsFile('{"hello":1}')).toThrowError(/รูปแบบไฟล์/);
    expect(() => parseEventsFile('null')).toThrowError(/รูปแบบไฟล์/);
  });

  it('names the event that is not valid', () => {
    const bad = (patch: object) => JSON.stringify([event, { ...event, ...patch }]);
    expect(() => parseEventsFile(bad({ date: '2026-13-40' }))).toThrowError(/ลำดับที่ 2/);
    expect(() => parseEventsFile(bad({ startTime: '9:00' }))).toThrowError(/ลำดับที่ 2/);
    expect(() => parseEventsFile(bad({ endTime: '25:00' }))).toThrowError(/ลำดับที่ 2/);
    expect(() => parseEventsFile(bad({ title: '  ' }))).toThrowError(/ลำดับที่ 2/);
  });

  it('rejects a file of projects (not events)', () => {
    expect(() => parseEventsFile(JSON.stringify([{ id: 'p', name: 'โครงการ', startDate: '2026-01-01', endDate: '2026-02-01' }]))).toThrowError(
      /ลำดับที่ 1/,
    );
  });
});
