import { CalendarEvent } from '../../core/models/calendar-event.model';
import { parseEventsFile, serializeEvents } from './event-file.util';

const event: CalendarEvent = {
  id: 'e1',
  startDate: '2026-09-17',
  endDate: '2026-09-19',
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
    expect(JSON.parse(text)).toMatchObject({ type: 'monthly-report-events', version: 2, exportedAt: '2026-09-19T00:00:00.000Z' });
    expect(parseEventsFile(text)).toEqual([event]);
  });

  it('accepts a bare array and a leading BOM', () => {
    expect(parseEventsFile('﻿' + JSON.stringify([event]))).toEqual([event]);
  });

  it('fills in an id, timestamps and drops blank optional fields', () => {
    const [e] = parseEventsFile(
      JSON.stringify({ events: [{ startDate: '2026-09-17', title: ' งาน ', description: '  ', projectId: '' }] }),
    );
    expect(e.id).toBeTruthy();
    expect(e.endDate).toBe('2026-09-17');
    expect(e.title).toBe('งาน');
    expect(e.description).toBeUndefined();
    expect(e.projectId).toBeUndefined();
    expect(e.createdAt).toBeTruthy();
  });

  it('reads a file of the first version (one date plus times, three priorities)', () => {
    const [e] = parseEventsFile(
      JSON.stringify({ version: 1, events: [{ id: 'o', date: '2026-09-17', startTime: '09:00', endTime: '10:00', title: 'เก่า', priority: 'high' }] }),
    );
    expect(e).toMatchObject({ id: 'o', startDate: '2026-09-17', endDate: '2026-09-17', priority: 'urgent' });
    expect(e).not.toHaveProperty('startTime');
  });

  it('keeps a known priority and done, and drops anything else', () => {
    const text = (patch: object) => JSON.stringify([{ ...event, ...patch }]);
    expect(parseEventsFile(text({ priority: 'adhoc', done: true }))[0]).toMatchObject({ priority: 'adhoc', done: true });
    const [e] = parseEventsFile(text({ priority: 'critical', done: 'yes' }));
    expect(e.priority).toBeUndefined();
    expect(e.done).toBeUndefined();
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
    expect(() => parseEventsFile(bad({ startDate: '2026-13-40' }))).toThrowError(/ลำดับที่ 2/);
    expect(() => parseEventsFile(bad({ endDate: '2026-02-30' }))).toThrowError(/ลำดับที่ 2/);
    expect(() => parseEventsFile(bad({ endDate: '2026-09-16' }))).toThrowError(/ลำดับที่ 2.*วันสิ้นสุด/);
    expect(() => parseEventsFile(bad({ title: '  ' }))).toThrowError(/ลำดับที่ 2/);
  });

  it('rejects a file of projects (not events)', () => {
    expect(() => parseEventsFile(JSON.stringify([{ id: 'p', name: 'โครงการ', startDate: '2026-01-01', endDate: '2026-02-01' }]))).toThrowError(
      /ลำดับที่ 1/,
    );
  });
});
