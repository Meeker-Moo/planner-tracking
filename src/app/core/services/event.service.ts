import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { DataScopeService } from './data-scope.service';
import { belongsTo, cleanAssignees } from './owned-records';
import { RecordSync } from './record-sync';
import { SessionLoader } from './session-loader';
import { reportSaveError } from './work-plan.service';
import { AuthService } from '../auth/auth.service';
import { canReassign, canDelete, canEdit, canUseEvents, canUseProjects, canView } from '../auth/permissions';
import { UserStore } from '../auth/user-store.service';
import { CalendarEvent, CalendarEventInput } from '../models/calendar-event.model';
import { toEventPriority } from '../models/status.constant';
import { uid } from '../../shared/utils/id.util';

/** How events were saved before date ranges: one `date` plus a start and end time. */
type SavedEvent = Omit<CalendarEvent, 'startDate' | 'endDate'> &
  Partial<Pick<CalendarEvent, 'startDate' | 'endDate'>> & { date?: string; startTime?: string; endTime?: string };

/** An event as saved by any version, in the current shape (times dropped, old priorities renamed). */
export function upgradeSavedEvent(saved: SavedEvent): CalendarEvent {
  const { date, startTime, endTime, ...event } = saved;
  const startDate = event.startDate ?? date ?? '';
  return { ...event, startDate, endDate: event.endDate ?? startDate, priority: toEventPriority(event.priority) };
}

/**
 * Monthly Report events from the API (server/events.ts), kept like the projects in WorkPlanService: `events` is the
 * part the signed-in account may see, changes it may not make are ignored, and the rest is shown at once and sent.
 */
@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly auth = inject(AuthService);
  private readonly scope = inject(DataScopeService);
  private readonly users = inject(UserStore);
  private readonly api = inject(ApiService);
  private readonly eventsSignal = signal<CalendarEvent[]>([]);

  private readonly sync = new RecordSync<CalendarEvent>({
    current: (id) => this.find(id),
    send: async (event, version) => {
      const { event: saved } = version
        ? await this.api.put<{ event: CalendarEvent }>(`/events/${encodeURIComponent(event.id)}`, { ...event, updatedAt: version })
        : await this.api.post<{ event: CalendarEvent }>('/events', event);
      return saved;
    },
    sendDelete: (id) => this.api.delete(`/events/${encodeURIComponent(id)}`),
    saved: (event) => this.eventsSignal.update((list) => list.map((e) => (e.id === event.id ? event : e))),
    failed: (error) => {
      reportSaveError(error);
      void this.loader.reload();
    },
  });

  private readonly loader = new SessionLoader(
    () => {
      const user = this.auth.user();
      return user && !user.mustChangePassword && canUseProjects(user) ? `${user.id}:${user.role}` : null;
    },
    async (isCurrent) => {
      const { events } = await this.api.get<{ events: CalendarEvent[] }>('/events');
      if (!isCurrent()) return;
      const upgraded = events.map(upgradeSavedEvent);
      this.sync.loaded(upgraded);
      this.eventsSignal.set(upgraded);
    },
    () => this.eventsSignal.set([]),
  );

  readonly events = computed(() => {
    const user = this.auth.user();
    const owner = this.scope.ownerFilter();
    return this.eventsSignal().filter((e) => canView(user, e) && (owner === 'all' || belongsTo(e, owner)));
  });

  /** Resolves once the events of the signed-in account are loaded. */
  ready(): Promise<void> {
    return this.loader.ready();
  }

  /** Resolves once every change made so far has been sent. */
  settled(): Promise<void> {
    return this.sync.settled();
  }

  /** A new event of the signed-in account; Monthly Report is Admin's, so for anyone else this is undefined. */
  add(input: CalendarEventInput): CalendarEvent | undefined {
    if (!canUseEvents(this.auth.user())) return undefined;
    const now = new Date().toISOString();
    const ownerId = this.auth.user()?.id;
    const event: CalendarEvent = {
      ...input,
      id: uid(),
      ownerId,
      assigneeIds: this.assignees(input.assigneeIds, ownerId),
      createdAt: now,
      updatedAt: now,
    };
    this.eventsSignal.update((list) => [...list, event]);
    this.sync.save(event.id);
    return event;
  }

  /** Edits the event; its owner never changes, and its assignees only for the owner and Admin. */
  update(id: string, input: CalendarEventInput): void {
    const event = this.find(id);
    const user = this.auth.user();
    if (!event || !canEdit(user, event)) return;
    const assigneeIds =
      'assigneeIds' in input && canReassign(user, event) ? this.assignees(input.assigneeIds, event.ownerId) : event.assigneeIds;
    this.eventsSignal.update((list) =>
      list.map((e) =>
        e.id === id ? { ...e, ...input, ownerId: event.ownerId, assigneeIds, updatedAt: new Date().toISOString() } : e,
      ),
    );
    this.sync.save(id);
  }

  setDone(id: string, done: boolean): void {
    const event = this.find(id);
    if (!event || !canEdit(this.auth.user(), event)) return;
    this.eventsSignal.update((list) => list.map((e) => (e.id === id ? { ...e, done, updatedAt: new Date().toISOString() } : e)));
    this.sync.save(id);
  }

  /** Only the owner and Admin may delete an event. */
  delete(id: string): void {
    const event = this.find(id);
    if (!event || !canDelete(this.auth.user(), event)) return;
    this.eventsSignal.update((list) => list.filter((e) => e.id !== id));
    this.sync.delete(id);
  }

  private find(id: string): CalendarEvent | undefined {
    return this.eventsSignal().find((e) => e.id === id);
  }

  private assignees(ids: string[] | undefined, ownerId: string | undefined): string[] | undefined {
    return cleanAssignees(ids, ownerId, (id) => this.users.getById(id)?.role === 'USER');
  }
}
