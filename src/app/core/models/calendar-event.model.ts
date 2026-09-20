/** An event on the Monthly Report calendar. Independent of projects, but it can point at one. */
export interface CalendarEvent {
  id: string;
  date: string; // ISO yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  description?: string;
  /** The project (and activity) this event is linked to. */
  projectId?: string;
  /**
   * The names at the time of linking. They are kept in the event so a link can still be read after the
   * project is deleted, or when the events are loaded on a machine that does not have that project.
   */
  projectName?: string;
  activityId?: string;
  activityName?: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;
