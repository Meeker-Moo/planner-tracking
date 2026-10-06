import { USERNAME_PATTERN } from '../src/app/core/auth/auth.limits';
import { MIN_PASSWORD_LENGTH } from '../src/app/core/auth/password.util';
import { Actor, assignableRoles, canManageUser } from '../src/app/core/auth/permissions';
import { Role } from '../src/app/core/auth/user.model';
import { ApiError, badRequest, forbidden } from './http';

// The account rules of UserStore (the app's stand-in for this API), pure so they are tested without a database.

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'USER'];

function str(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest(`${key} must be a string`);
  return value;
}

function displayNameOf(value: string | undefined): string {
  const name = value?.trim() ?? '';
  if (!name) throw new ApiError(400, 'DISPLAY_NAME_REQUIRED');
  if (name.length > 100) throw badRequest('displayName is too long');
  return name;
}

function roleOf(value: unknown): Role {
  if (!ROLES.includes(value as Role)) throw badRequest('role is not valid');
  return value as Role;
}

/** A new account's fields, checked against what the actor may create. */
export function newUser(actor: Actor, body: Record<string, unknown>): { username: string; displayName: string; role: Role } {
  const username = (str(body, 'username') ?? '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new ApiError(400, 'INVALID_USERNAME');
  const displayName = displayNameOf(str(body, 'displayName'));
  const role = roleOf(body['role']);
  if (!assignableRoles(actor).includes(role)) throw forbidden();
  return { username, displayName, role };
}

export interface UserChange {
  displayName: string;
  role: Role;
  active: boolean;
  /** Deactivated: its sessions end now. */
  endSessions: boolean;
  /** Reactivated: a lock from wrong passwords is lifted. */
  unlock: boolean;
}

/**
 * An edit of another account (name, role, active). `activeSuperAdmins` counts the active Super Admins now, so the
 * last one is never demoted or deactivated.
 */
export function changeUser(
  actor: Actor,
  target: Actor & { displayName: string; active: boolean },
  body: Record<string, unknown>,
  activeSuperAdmins: number,
): UserChange {
  if (!canManageUser(actor, target)) throw forbidden();
  const role = body['role'] === undefined ? target.role : roleOf(body['role']);
  if (role !== target.role && !assignableRoles(actor).includes(role)) throw forbidden();
  const name = str(body, 'displayName');
  const displayName = name === undefined ? target.displayName : displayNameOf(name);
  const activeValue = body['active'];
  if (activeValue !== undefined && typeof activeValue !== 'boolean') throw badRequest('active must be true or false');
  const active = activeValue ?? target.active;

  const losesSuperAdmin = target.role === 'SUPER_ADMIN' && target.active && (role !== 'SUPER_ADMIN' || !active);
  if (losesSuperAdmin && activeSuperAdmins <= 1) throw new ApiError(409, 'LAST_SUPER_ADMIN');

  return { displayName, role, active, endSessions: target.active && !active, unlock: !target.active && active };
}

/** The checks of an account's own password change other than the current password itself. */
export function checkNewPassword(currentPassword: string, newPassword: string): void {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, 'WEAK_PASSWORD');
  if (newPassword.length > 200) throw badRequest('newPassword is too long');
  if (newPassword === currentPassword) throw new ApiError(400, 'SAME_PASSWORD');
}
