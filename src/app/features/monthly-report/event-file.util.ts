import { CalendarEvent } from '../../core/models/calendar-event.model';
import { toEventPriority } from '../../core/models/status.constant';
import { isRealIsoDate } from '../../shared/utils/date.util';
import { uid } from '../../shared/utils/id.util';

export const EVENT_FILE_TYPE = 'monthly-report-events';

/** The text of the JSON file that holds all events. */
export function serializeEvents(events: CalendarEvent[], exportedAt: Date = new Date()): string {
  return JSON.stringify({ type: EVENT_FILE_TYPE, version: 2, exportedAt: exportedAt.toISOString(), events }, null, 2);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Reads a file written by serializeEvents (a bare array of events is accepted too). Files of the first version
 * (one `date` plus times, three priorities) are read into the current shape. Throws an Error with a
 * Thai message when the file cannot be used; events missing an id or timestamps get them filled in.
 */
export function parseEventsFile(text: string): CalendarEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
  }

  const source = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown } | null)?.events;
  if (!Array.isArray(source)) {
    throw new Error('รูปแบบไฟล์ไม่ถูกต้อง (ต้องเป็นไฟล์ที่ส่งออกจาก Monthly Report)');
  }

  const now = new Date().toISOString();
  return source.map((item, index): CalendarEvent => {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const startDate = e['startDate'] ?? e['date'];
    const endDate = e['endDate'] ?? startDate;
    const valid =
      typeof startDate === 'string' &&
      isRealIsoDate(startDate) &&
      typeof endDate === 'string' &&
      isRealIsoDate(endDate) &&
      typeof e['title'] === 'string' &&
      e['title'].trim() !== '';
    if (!valid) {
      throw new Error(`Event ลำดับที่ ${index + 1} ไม่ถูกต้อง (ต้องมี startDate, title)`);
    }
    if (endDate < startDate) {
      throw new Error(`Event ลำดับที่ ${index + 1} ไม่ถูกต้อง (วันสิ้นสุดอยู่ก่อนวันเริ่มต้น)`);
    }
    return {
      id: typeof e['id'] === 'string' && e['id'] ? e['id'] : uid(),
      startDate,
      endDate,
      title: (e['title'] as string).trim(),
      description: optionalText(e['description']),
      priority: toEventPriority(e['priority']),
      done: e['done'] === true ? true : undefined,
      projectId: optionalText(e['projectId']),
      projectName: optionalText(e['projectName']),
      activityId: optionalText(e['activityId']),
      activityName: optionalText(e['activityName']),
      createdAt: typeof e['createdAt'] === 'string' ? e['createdAt'] : now,
      updatedAt: typeof e['updatedAt'] === 'string' ? e['updatedAt'] : now,
    };
  });
}
