import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { CalendarEvent, CalendarEventInput } from '../models/calendar-event.model';
import { toEventPriority } from '../models/status.constant';
import { uid } from '../../shared/utils/id.util';

const STORAGE_KEY = 'awp:events:v1';

/** How events were saved before date ranges: one `date` plus a start and end time. */
type SavedEvent = Omit<CalendarEvent, 'startDate' | 'endDate'> &
  Partial<Pick<CalendarEvent, 'startDate' | 'endDate'>> & { date?: string; startTime?: string; endTime?: string };

/** An event as saved by any version, in the current shape (times dropped, old priorities renamed). */
export function upgradeSavedEvent(saved: SavedEvent): CalendarEvent {
  const { date, startTime, endTime, ...event } = saved;
  const startDate = event.startDate ?? date ?? '';
  return { ...event, startDate, endDate: event.endDate ?? startDate, priority: toEventPriority(event.priority) };
}

/** Monthly Report events, kept in the browser like the projects but in their own store. */
@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly eventsSignal = signal<CalendarEvent[]>([]);

  readonly events = this.eventsSignal.asReadonly();

  constructor(private readonly storage: StorageService) {
    const loaded = this.storage.get<SavedEvent[]>(STORAGE_KEY);
    if (Array.isArray(loaded)) {
      this.eventsSignal.set(loaded.map(upgradeSavedEvent));
    }
  }

  add(input: CalendarEventInput): CalendarEvent {
    const now = new Date().toISOString();
    const event: CalendarEvent = { ...input, id: uid(), createdAt: now, updatedAt: now };
    this.eventsSignal.update((list) => [...list, event]);
    this.persist();
    return event;
  }

  update(id: string, input: CalendarEventInput): void {
    this.eventsSignal.update((list) =>
      list.map((e) => (e.id === id ? { ...e, ...input, updatedAt: new Date().toISOString() } : e)),
    );
    this.persist();
  }

  setDone(id: string, done: boolean): void {
    this.eventsSignal.update((list) => list.map((e) => (e.id === id ? { ...e, done, updatedAt: new Date().toISOString() } : e)));
    this.persist();
  }

  delete(id: string): void {
    this.eventsSignal.update((list) => list.filter((e) => e.id !== id));
    this.persist();
  }

  replaceAll(events: CalendarEvent[]): void {
    this.eventsSignal.set(events);
    this.persist();
  }

  mergeAll(events: CalendarEvent[]): void {
    this.eventsSignal.update((list) => {
      const byId = new Map(list.map((e) => [e.id, e]));
      for (const e of events) {
        byId.set(e.id, e);
      }
      return Array.from(byId.values());
    });
    this.persist();
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.eventsSignal());
  }
}
