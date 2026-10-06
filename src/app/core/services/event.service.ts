import { Injectable, computed, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { DataScopeService } from './data-scope.service';
import { belongsTo, cleanAssignees, withOwners } from './owned-records';
import { AuthService } from '../auth/auth.service';
import { LEGACY_OWNER_ID } from '../auth/auth.config';
import { canReassign, canDelete, canEdit, canView } from '../auth/permissions';
import { UserStore } from '../auth/user-store.service';
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

/**
 * Monthly Report events, kept in the browser like the projects but in their own store. As with projects,
 * `events` is the part the signed-in account may see, and changes it may not make are ignored.
 */
@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly auth = inject(AuthService);
  private readonly scope = inject(DataScopeService);
  private readonly users = inject(UserStore);
  private readonly eventsSignal = signal<CalendarEvent[]>([]);

  readonly events = computed(() => {
    const user = this.auth.user();
    const owner = this.scope.ownerFilter();
    return this.eventsSignal().filter((e) => canView(user, e) && (owner === 'all' || belongsTo(e, owner)));
  });

  constructor(private readonly storage: StorageService) {
    const loaded = this.storage.get<SavedEvent[]>(STORAGE_KEY);
    if (Array.isArray(loaded)) {
      // Events saved before accounts existed go to the account that used to be the only one.
      const { items, changed } = withOwners(loaded.map(upgradeSavedEvent), LEGACY_OWNER_ID);
      this.eventsSignal.set(items);
      if (changed) this.persist();
    }
  }

  add(input: CalendarEventInput): CalendarEvent {
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
    this.persist();
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
    this.persist();
  }

  setDone(id: string, done: boolean): void {
    const event = this.find(id);
    if (!event || !canEdit(this.auth.user(), event)) return;
    this.eventsSignal.update((list) => list.map((e) => (e.id === id ? { ...e, done, updatedAt: new Date().toISOString() } : e)));
    this.persist();
  }

  /** Only the owner and Admin may delete an event. */
  delete(id: string): void {
    const event = this.find(id);
    if (!event || !canDelete(this.auth.user(), event)) return;
    this.eventsSignal.update((list) => list.filter((e) => e.id !== id));
    this.persist();
  }

  private find(id: string): CalendarEvent | undefined {
    return this.eventsSignal().find((e) => e.id === id);
  }

  private assignees(ids: string[] | undefined, ownerId: string | undefined): string[] | undefined {
    return cleanAssignees(ids, ownerId, (id) => this.users.getById(id)?.role === 'USER');
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.eventsSignal());
  }
}
