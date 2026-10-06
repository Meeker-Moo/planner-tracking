import { hashPassword, temporaryPassword } from '../src/app/core/auth/password.util';
import { canManageUser, canManageUsers } from '../src/app/core/auth/permissions';
import { uid } from '../src/app/shared/utils/id.util';
import { findUser, loadDirectory, toApiUser, UserRow } from './db';
import { passwordIterations } from './env';
import { ApiError, forbidden, json, notFound, readJson } from './http';
import { Context } from './router';
import { changeUser, newUser } from './user-rules';

// Accounts are never deleted, only deactivated, so the projects they own keep a name.

/** GET /api/users: every account, for the user management page (Super Admin and Admin). */
export async function listUsers({ env, actor }: Context): Promise<Response> {
  if (!canManageUsers(actor!)) throw forbidden();
  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY created_at').all<UserRow>();
  return json({ users: results.map(toApiUser) });
}

/** GET /api/users/directory: the Admin and User accounts' names, for everyone signed in (responsible pickers, owner tags). */
export async function userDirectory({ env }: Context): Promise<Response> {
  const dir = await loadDirectory(env.DB);
  return json({ users: [...dir.values()].filter((u) => u.role !== 'SUPER_ADMIN') });
}

/** POST /api/users: a new account with a one-time password, returned once so it can be handed over. */
export async function createUser({ request, env, actor, now }: Context): Promise<Response> {
  const { username, displayName, role } = newUser(actor!, await readJson(request));
  const taken = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (taken) throw new ApiError(409, 'USERNAME_TAKEN');

  const tempPassword = temporaryPassword();
  const passwordHash = await hashPassword(tempPassword, passwordIterations(env));
  try {
    const created = await env.DB.prepare(
      `INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, active,
                          failed_logins, locked_until, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, NULL, ?, ?, ?) RETURNING *`,
    )
      .bind(uid(), username, displayName, role, passwordHash, actor!.id, now, now)
      .first<UserRow>();
    return json({ user: toApiUser(created!), tempPassword }, 201);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'USERNAME_TAKEN');
    throw error;
  }
}

async function managedTarget(ctx: Context): Promise<UserRow> {
  const target = await findUser(ctx.env.DB, ctx.params['id']);
  if (!target) throw notFound();
  if (!canManageUser(ctx.actor!, { id: target.id, role: target.role })) throw forbidden();
  return target;
}

/** PATCH /api/users/:id: renames, changes the role of, or (de)activates an account. Deactivating ends its sessions. */
export async function updateUser(ctx: Context): Promise<Response> {
  const { request, env, actor, now } = ctx;
  const body = await readJson(request);
  const target = await managedTarget(ctx);
  const superAdmins = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'SUPER_ADMIN' AND active = 1").first<number>('n');
  const change = changeUser(
    actor!,
    { id: target.id, role: target.role, displayName: target.display_name, active: !!target.active },
    body,
    superAdmins ?? 0,
  );

  const db = env.DB;
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = ?,
           failed_logins = CASE WHEN ? THEN 0 ELSE failed_logins END,
           locked_until = CASE WHEN ? THEN NULL ELSE locked_until END
         WHERE id = ? RETURNING *`,
      )
      .bind(change.displayName, change.role, change.active ? 1 : 0, now, change.unlock ? 1 : 0, change.unlock ? 1 : 0, target.id),
    ...(change.endSessions ? [db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id)] : []),
  ]);
  return json({ user: toApiUser((updated.results as UserRow[])[0]) });
}

/** POST /api/users/:id/reset-password: a new one-time password (returned once); unlocks the account and ends its sessions. */
export async function resetPassword(ctx: Context): Promise<Response> {
  const { env, now } = ctx;
  const target = await managedTarget(ctx);
  const tempPassword = temporaryPassword();
  const passwordHash = await hashPassword(tempPassword, passwordIterations(env));
  const db = env.DB;
  await db.batch([
    db
      .prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(passwordHash, now, target.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
  ]);
  return json({ tempPassword });
}
