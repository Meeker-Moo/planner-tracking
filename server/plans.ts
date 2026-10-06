import { Actor, canEditPlan, canUseProjects } from '../src/app/core/auth/permissions';
import { WorkPlan } from '../src/app/core/models/work-plan.model';
import { summarizeYear } from '../src/app/features/dashboard/dashboard.util';
import { fiscalYearOf, isRealIsoDate, yearRange } from '../src/app/shared/utils/date.util';
import { uid } from '../src/app/shared/utils/id.util';
import { Directory, loadDirectory, parseData } from './db';
import { badRequest, conflict, forbidden, json, notFound, readJson } from './http';
import { createPlan as newPlan, planMembers, updatePlan as changedPlan, withNames } from './plan-rules';
import { Context } from './router';
import { readPlan } from './validate';

function projectsActor(actor: Actor | undefined): Actor {
  if (!canUseProjects(actor ?? null)) throw forbidden();
  return actor!;
}

function yearParam(url: URL, required: boolean): number | undefined {
  const value = url.searchParams.get('year');
  if (value === null && !required) return undefined;
  const year = Number(value);
  if (!Number.isInteger(year)) throw badRequest('year must be a whole number');
  return year;
}

/** Today in Thailand as yyyy-MM-dd (the Worker's clock is UTC). */
function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * GET /api/plans[?year=]: the projects the account may see (permissions.ts canViewPlan): Admin all of them, a User
 * the ones it created or is responsible for (itself or through an activity), found through plan_members.
 */
export async function listPlans({ env, url, actor }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const year = yearParam(url, false);
  const where: string[] = [];
  const binds: unknown[] = [];
  if (user.role !== 'ADMIN') {
    where.push('(owner_id = ? OR id IN (SELECT plan_id FROM plan_members WHERE user_id = ?))');
    binds.push(user.id, user.id);
  }
  if (year !== undefined) {
    where.push('year = ?');
    binds.push(year);
  }
  const sql = `SELECT data FROM plans${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const [{ results }, dir] = await Promise.all([env.DB.prepare(sql).bind(...binds).all<{ data: string }>(), loadDirectory(env.DB)]);
  return json({ plans: results.map((r) => withNames(parseData<WorkPlan>(r), dir)) });
}

/**
 * GET /api/plans/summary?year=[&today=]: the Dashboard's overview of every project of the year, the same for Admin and
 * User. Only the numbers and the names of the projects that need attention leave the server, not the projects.
 */
export async function planSummary({ env, url, actor }: Context): Promise<Response> {
  projectsActor(actor);
  const year = yearParam(url, true)!;
  const todayParam = url.searchParams.get('today');
  const today = todayParam && isRealIsoDate(todayParam) ? todayParam : bangkokToday();
  const db = env.DB;
  const [{ results }, years, dir] = await Promise.all([
    db.prepare('SELECT data FROM plans WHERE year = ?').bind(year).all<{ data: string }>(),
    db.prepare('SELECT DISTINCT year FROM plans').all<{ year: number }>(),
    loadDirectory(db),
  ]);
  const summary = summarizeYear(results.map((r) => withNames(parseData<WorkPlan>(r), dir)), year, today);
  return json({
    years: yearRange(years.results.map((r) => r.year), fiscalYearOf(today) ?? year),
    summary: {
      ...summary,
      attention: summary.attention.map(({ plan: { id, name, responsible, endDate, status }, reason }) => ({
        plan: { id, name, responsible, endDate, status },
        reason,
      })),
    },
  });
}

/** The statements that write a project and its plan_members, all skipped unless the row ends up as `plan`. */
function writePlan(db: D1Database, plan: WorkPlan, previousUpdatedAt: string | null): D1PreparedStatement[] {
  const saved = 'EXISTS (SELECT 1 FROM plans WHERE id = ? AND updated_at = ?)';
  const write =
    previousUpdatedAt === null
      ? db
          .prepare('INSERT INTO plans (id, owner_id, responsible_id, year, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(plan.id, plan.ownerId, plan.responsibleId ?? null, plan.year, JSON.stringify(plan), plan.updatedAt)
      : db
          .prepare('UPDATE plans SET responsible_id = ?, year = ?, data = ?, updated_at = ? WHERE id = ? AND updated_at = ?')
          .bind(plan.responsibleId ?? null, plan.year, JSON.stringify(plan), plan.updatedAt, plan.id, previousUpdatedAt);
  return [
    write,
    db.prepare(`DELETE FROM plan_members WHERE plan_id = ? AND ${saved}`).bind(plan.id, plan.id, plan.updatedAt),
    ...planMembers(plan).map((userId) =>
      db
        .prepare(`INSERT INTO plan_members (plan_id, user_id) SELECT ?, ? WHERE ${saved}`)
        .bind(plan.id, userId, plan.id, plan.updatedAt),
    ),
  ];
}

async function storedPlan(db: D1Database, id: string): Promise<WorkPlan> {
  const row = await db.prepare('SELECT data FROM plans WHERE id = ?').bind(id).first<{ data: string }>();
  if (!row) throw notFound();
  return parseData<WorkPlan>(row);
}

function respond(plan: WorkPlan, dir: Directory, status = 200): Response {
  return json({ plan: withNames(plan, dir) }, status);
}

/** POST /api/plans: a new project owned by the account. The app may choose its id (so it can show it at once). */
export async function createPlan({ request, env, actor, now }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const body = readPlan(await readJson(request));
  const id = body.id ?? uid();
  if (await env.DB.prepare('SELECT 1 FROM plans WHERE id = ?').bind(id).first()) throw conflict();
  const dir = await loadDirectory(env.DB);
  const plan = newPlan(user, body, dir, id, now);
  await env.DB.batch(writePlan(env.DB, plan, null));
  return respond(plan, dir, 201);
}

/**
 * PUT /api/plans/:id: the whole project as the app has it after the change; plan-rules.ts keeps what the account may
 * change. `updatedAt` must be the stored one, or someone else saved in between (409 CONFLICT).
 */
export async function updatePlan({ request, env, actor, params, now }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const body = readPlan(await readJson(request));
  if (!body.updatedAt) throw badRequest('updatedAt is required');
  const stored = await storedPlan(env.DB, params['id']);
  const dir = await loadDirectory(env.DB);
  const plan = changedPlan(user, stored, body, dir, now);
  if (body.updatedAt !== stored.updatedAt) throw conflict();
  const [write] = await env.DB.batch(writePlan(env.DB, plan, stored.updatedAt));
  if (!write.meta.changes) throw conflict();
  return respond(plan, dir);
}

/** DELETE /api/plans/:id: the owner and Admin only. */
export async function deletePlan({ env, actor, params }: Context): Promise<Response> {
  const user = projectsActor(actor);
  const stored = await storedPlan(env.DB, params['id']);
  if (!canEditPlan(user, stored)) throw forbidden();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM plan_members WHERE plan_id = ?').bind(stored.id),
    env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(stored.id),
  ]);
  return json({ ok: true });
}
