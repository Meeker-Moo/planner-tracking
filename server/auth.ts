import { LOCK_MINUTES, MAX_FAILED_LOGINS, REMEMBER_DAYS } from '../src/app/core/auth/auth.limits';
import { hashPassword, needsRehash, verifyPassword } from '../src/app/core/auth/password.util';
import { toApiUser, UserRow } from './db';
import { passwordIterations } from './env';
import { ApiError, badRequest, cookie, getCookie, json, readJson } from './http';
import { Context } from './router';
import { checkNewPassword } from './user-rules';

export const SESSION_COOKIE = 'awp_session';

/** A session without "จดจำการเข้าสู่ระบบ" ends with the browser, or after this many hours at the latest. */
const SESSION_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The sessions table keeps only this, so a leaked database cannot be used to sign in. */
export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The signed-in account behind the request's cookie, if its session is still valid and the account active. */
export async function sessionUser(request: Request, db: D1Database, now: string): Promise<{ user: UserRow; tokenHash: string } | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await tokenHash(token);
  const user = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(hash, now)
    .first<UserRow>();
  return user ? { user, tokenHash: hash } : null;
}

function str(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length > 200) throw badRequest(`${key} is required`);
  return value;
}

/**
 * POST /api/auth/login. MAX_FAILED_LOGINS wrong passwords in a row lock the account for LOCK_MINUTES; a password kept
 * in an older form (or with another round count) is hashed again.
 */
export async function login({ request, env, now }: Context): Promise<Response> {
  const body = await readJson(request);
  const username = str(body, 'username').trim().toLowerCase();
  const password = str(body, 'password');
  const remember = body['remember'] === true;
  const db = env.DB;

  const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
  if (!user) throw new ApiError(401, 'INVALID');
  if (user.locked_until && user.locked_until > now) throw new ApiError(423, 'LOCKED', { lockedUntil: user.locked_until });

  if (!(await verifyPassword(password, user.password_hash, user.username))) {
    const row = await db
      .prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ? RETURNING failed_logins')
      .bind(user.id)
      .first<{ failed_logins: number }>();
    if ((row?.failed_logins ?? 0) >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(Date.parse(now) + LOCK_MINUTES * 60_000).toISOString();
      await db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').bind(lockedUntil, user.id).run();
      throw new ApiError(423, 'LOCKED', { lockedUntil });
    }
    throw new ApiError(401, 'INVALID');
  }
  if (!user.active) throw new ApiError(403, 'INACTIVE');

  const iterations = passwordIterations(env);
  const passwordHash = needsRehash(user.password_hash, iterations) ? await hashPassword(password, iterations) : user.password_hash;
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.parse(now) + (remember ? REMEMBER_DAYS * 24 : SESSION_HOURS) * HOUR_MS).toISOString();
  await db.batch([
    db
      .prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?')
      .bind(passwordHash, user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').bind(user.id, now),
    db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await tokenHash(token), user.id, expiresAt, now),
  ]);

  const maxAge = remember ? REMEMBER_DAYS * 24 * 60 * 60 : null;
  return json({ user: toApiUser(user) }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, token, maxAge) });
}

/** POST /api/auth/logout: ends this session (if any) and clears the cookie. */
export async function logout({ request, env }: Context): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await tokenHash(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
}

/** GET /api/auth/me */
export async function me({ user }: Context): Promise<Response> {
  return json({ user: toApiUser(user!) });
}

/**
 * POST /api/auth/change-password: the account's own change, which also clears the must-change flag of a new or reset
 * account. Its other sessions end; this one stays.
 */
export async function changePassword({ request, env, now, user, tokenHash: current }: Context): Promise<Response> {
  const body = await readJson(request);
  const currentPassword = str(body, 'currentPassword');
  const newPassword = str(body, 'newPassword');
  checkNewPassword(currentPassword, newPassword);
  if (!(await verifyPassword(currentPassword, user!.password_hash, user!.username))) throw new ApiError(400, 'WRONG_PASSWORD');

  const passwordHash = await hashPassword(newPassword, passwordIterations(env));
  const db = env.DB;
  const [updated] = await db.batch([
    db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ? RETURNING *')
      .bind(passwordHash, now, user!.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user!.id, current),
  ]);
  return json({ user: toApiUser((updated.results as UserRow[])[0]) });
}
