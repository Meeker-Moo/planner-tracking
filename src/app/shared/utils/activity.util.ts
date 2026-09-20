import { Activity } from '../../core/models/work-plan.model';

/** How many of an activity's to-do items are done, out of how many there are. */
export function todoProgress(activity: Pick<Activity, 'todos'>): { done: number; total: number } {
  const todos = activity.todos ?? [];
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}
