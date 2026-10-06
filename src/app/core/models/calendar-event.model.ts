export type EventPriority = 'urgent' | 'adhoc' | 'normal' | 'low';

/** An event on the Monthly Report calendar. Independent of projects, but it can point at one. */
export interface CalendarEvent {
  id: string;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string; // ISO yyyy-MM-dd, the same as startDate for a one-day event
  title: string;
  description?: string;
  /** Missing on events saved before priorities existed; read it with `eventPriority()`. */
  priority?: EventPriority;
  /** Marked as done (shown struck through). */
  done?: boolean;
  /** The project (and activity) this event is linked to. */
  projectId?: string;
  /**
   * The names at the time of linking. They are kept in the event so a link can still be read after the
   * project is deleted, or when the events are loaded on a machine that does not have that project.
   */
  projectName?: string;
  activityId?: string;
  activityName?: string;
  /** The account that created the event; missing only on data saved before accounts existed. */
  ownerId?: string;
  /** USER accounts that may also see and edit the event (but not delete it). */
  assigneeIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** The owner is set by EventService, never by a form. */
export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>;
