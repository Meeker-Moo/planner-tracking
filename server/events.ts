import { Actor, canDelete, canUseEvents, canUseProjects } from '../src/app/core/auth/permissions';
import { CalendarEvent } from '../src/app/core/models/calendar-event.model';
import { uid } from '../src/app/shared/utils/id.util';
import { loadDirectory, parseData } from './db';
import { createEvent as newEvent, updateEvent as changedEvent } from './event-rules';
import { badRequest, conflict, forbidden, json, notFound, readJson } from './http';
import { Context } from './router';
import { readEvent } from './validate';

// Monthly Report events, with the same pattern as plans.ts.

function projectsActor(actor: Actor | undefined): Actor {
  if (!canUseProjects(actor ?? null)) throw forbidden();
  return actor!;
}

/** GET /api/events: Admin every event; a User the ones it created or is assigned to (permissions.ts canView). */
export async function listEvents({ env, actor }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const query =
    user.role === 'ADMIN'
      ? env.DB.prepare('SELECT data FROM events')
      : env.DB.prepare(
          'SELECT data FROM events WHERE owner_id = ? OR id IN (SELECT event_id FROM event_assignees WHERE user_id = ?)',
        ).bind(user.id, user.id);
  const { results } = await query.all<{ data: string }>();
  return json({ events: results.map((r) => parseData<CalendarEvent>(r)) });
}

/** The statements that write an event and its event_assignees, all skipped unless the row ends up as `event`. */
function writeEvent(db: D1Database, event: CalendarEvent, previousUpdatedAt: string | null): D1PreparedStatement[] {
  const saved = 'EXISTS (SELECT 1 FROM events WHERE id = ? AND updated_at = ?)';
  const write =
    previousUpdatedAt === null
      ? db
          .prepare('INSERT INTO events (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?)')
          .bind(event.id, event.ownerId, JSON.stringify(event), event.updatedAt)
      : db
          .prepare('UPDATE events SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?')
          .bind(JSON.stringify(event), event.updatedAt, event.id, previousUpdatedAt);
  return [
    write,
    db.prepare(`DELETE FROM event_assignees WHERE event_id = ? AND ${saved}`).bind(event.id, event.id, event.updatedAt),
    ...(event.assigneeIds ?? []).map((userId) =>
      db
        .prepare(`INSERT INTO event_assignees (event_id, user_id) SELECT ?, ? WHERE ${saved}`)
        .bind(event.id, userId, event.id, event.updatedAt),
    ),
  ];
}

async function storedEvent(db: D1Database, id: string): Promise<CalendarEvent> {
  const row = await db.prepare('SELECT data FROM events WHERE id = ?').bind(id).first<{ data: string }>();
  if (!row) throw notFound();
  return parseData<CalendarEvent>(row);
}

/** POST /api/events: Monthly Report is Admin's, so only Admin creates events. */
export async function createEvent({ request, env, actor, now }: Context): Promise<Response> {
  const user = projectsActor(actor);
  if (!canUseEvents(user)) throw forbidden();
  const body = readEvent(await readJson(request));
  const id = body.id ?? uid();
  if (await env.DB.prepare('SELECT 1 FROM events WHERE id = ?').bind(id).first()) throw conflict();
  const event = newEvent(user, body, await loadDirectory(env.DB), id, now);
  await env.DB.batch(writeEvent(env.DB, event, null));
  return json({ event }, 201);
}

/** PUT /api/events/:id: the whole event after the change, with the stored `updatedAt` (else 409 CONFLICT). */
export async function updateEvent({ request, env, actor, params, now }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const body = readEvent(await readJson(request));
  if (!body.updatedAt) throw badRequest('updatedAt is required');
  const stored = await storedEvent(env.DB, params['id']);
  const event = changedEvent(user, stored, body, await loadDirectory(env.DB), now);
  if (body.updatedAt !== stored.updatedAt) throw conflict();
  const [write] = await env.DB.batch(writeEvent(env.DB, event, stored.updatedAt));
  if (!write.meta.changes) throw conflict();
  return json({ event });
}

/** DELETE /api/events/:id: the owner and Admin only. */
export async function deleteEvent({ env, actor, params }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const stored = await storedEvent(env.DB, params['id']);
  if (!canDelete(user, stored)) throw forbidden();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM event_assignees WHERE event_id = ?').bind(stored.id),
    env.DB.prepare('DELETE FROM events WHERE id = ?').bind(stored.id),
  ]);
  return json({ ok: true });
}
