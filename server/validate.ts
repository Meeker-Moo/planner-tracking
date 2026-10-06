import { CalendarEventInput } from '../src/app/core/models/calendar-event.model';
import { toEventPriority } from '../src/app/core/models/status.constant';
import { Activity, TodoItem, WorkPlanInput, WorkStatus } from '../src/app/core/models/work-plan.model';
import { isRealIsoDate } from '../src/app/shared/utils/date.util';
import { badRequest } from './http';

// Request bodies are read field by field into the app's models, so nothing unknown or malformed is stored.

const STATUSES: WorkStatus[] = ['planned', 'in-progress', 'completed', 'delayed', 'cancelled'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(obj: Obj, key: string, max: number): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw badRequest(`${key} must be a string`);
  if (value.length > max) throw badRequest(`${key} is too long`);
  return value;
}

function requiredText(obj: Obj, key: string, max: number): string {
  const value = text(obj, key, max);
  if (!value?.trim()) throw badRequest(`${key} is required`);
  return value;
}

function id(obj: Obj, key: string): string | undefined {
  const value = text(obj, key, 64);
  if (value !== undefined && !ID_PATTERN.test(value)) throw badRequest(`${key} is not a valid id`);
  return value || undefined;
}

function requiredId(obj: Obj, key: string): string {
  const value = id(obj, key);
  if (!value) throw badRequest(`${key} is required`);
  return value;
}

function date(obj: Obj, key: string): string {
  const value = requiredText(obj, key, 10);
  if (!isRealIsoDate(value)) throw badRequest(`${key} must be a yyyy-MM-dd date`);
  return value;
}

function dateRange(obj: Obj): { startDate: string; endDate: string } {
  const startDate = date(obj, 'startDate');
  const endDate = date(obj, 'endDate');
  if (endDate < startDate) throw badRequest('endDate is before startDate');
  return { startDate, endDate };
}

function status(obj: Obj): WorkStatus {
  const value = obj['status'];
  if (!STATUSES.includes(value as WorkStatus)) throw badRequest('status is not valid');
  return value as WorkStatus;
}

function list<T>(obj: Obj, key: string, max: number, read: (item: unknown) => T): T[] | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw badRequest(`${key} must be a list`);
  if (value.length > max) throw badRequest(`${key} has too many items`);
  return value.map(read);
}

/** Drops keys whose value is undefined, so stored JSON has no `"x": null` noise. */
export function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function readTodo(value: unknown): TodoItem {
  if (!isObj(value)) throw badRequest('todo must be an object');
  return { id: requiredId(value, 'id'), text: requiredText(value, 'text', 1000), done: value['done'] === true };
}

function readActivity(value: unknown): Activity {
  if (!isObj(value)) throw badRequest('activity must be an object');
  return compact({
    id: requiredId(value, 'id'),
    name: requiredText(value, 'name', 500),
    description: text(value, 'description', 5000),
    responsible: text(value, 'responsible', 200),
    responsibleId: id(value, 'responsibleId'),
    ...dateRange(value),
    status: status(value),
    note: text(value, 'note', 5000),
    todos: list(value, 'todos', 200, readTodo),
  });
}

/** A project as the app sends it; `id` (optional, for a new one) and `updatedAt` (the copy the change was made to) come along. */
export interface PlanBody extends WorkPlanInput {
  id?: string;
  updatedAt?: string;
}

export function readPlan(body: Obj): PlanBody {
  const year = body['year'];
  if (!Number.isInteger(year)) throw badRequest('year must be a whole number');
  return compact({
    id: id(body, 'id'),
    updatedAt: text(body, 'updatedAt', 40),
    year: year as number,
    name: requiredText(body, 'name', 500),
    description: text(body, 'description', 5000),
    type: text(body, 'type', 100) ?? '',
    responsible: text(body, 'responsible', 200) ?? '',
    responsibleId: id(body, 'responsibleId'),
    ...dateRange(body),
    status: status(body),
    activities: list(body, 'activities', 500, readActivity),
  });
}

/** An event as the app sends it. `assigneeIds` is present only when the body has it, so leaving it out keeps them. */
export interface EventBody extends CalendarEventInput {
  id?: string;
  updatedAt?: string;
}

export function readEvent(body: Obj): EventBody {
  const assigneeIds = list(body, 'assigneeIds', 100, (v) => {
    if (typeof v !== 'string' || !ID_PATTERN.test(v)) throw badRequest('assigneeIds must be ids');
    return v;
  });
  const event: EventBody = compact({
    id: id(body, 'id'),
    updatedAt: text(body, 'updatedAt', 40),
    ...dateRange(body),
    title: requiredText(body, 'title', 500),
    description: text(body, 'description', 5000),
    priority: toEventPriority(body['priority']),
    done: body['done'] === true,
    projectId: id(body, 'projectId'),
    projectName: text(body, 'projectName', 500),
    activityId: id(body, 'activityId'),
    activityName: text(body, 'activityName', 500),
  });
  if ('assigneeIds' in body) event.assigneeIds = assigneeIds;
  return event;
}
