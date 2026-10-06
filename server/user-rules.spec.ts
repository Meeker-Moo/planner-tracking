import { describe, expect, it } from 'vitest';
import { Actor } from '../src/app/core/auth/permissions';
import { ApiError } from './http';
import { match, Route } from './router';
import { changeUser, checkNewPassword, newUser } from './user-rules';

const superAdmin: Actor = { id: 'u-super', role: 'SUPER_ADMIN' };
const admin: Actor = { id: 'u-admin', role: 'ADMIN' };
const user: Actor = { id: 'u-user', role: 'USER' };

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ApiError ? error.code : String(error);
  }
  return undefined;
}

describe('newUser', () => {
  it('normalises the username and checks the role the actor may give', () => {
    expect(newUser(admin, { username: ' New.User ', displayName: ' Name ', role: 'USER' })).toEqual({
      username: 'new.user',
      displayName: 'Name',
      role: 'USER',
    });
    expect(code(() => newUser(admin, { username: 'abc', displayName: 'A', role: 'ADMIN' }))).toBe('FORBIDDEN');
    expect(code(() => newUser(user, { username: 'abc', displayName: 'A', role: 'USER' }))).toBe('FORBIDDEN');
    expect(newUser(superAdmin, { username: 'abc', displayName: 'A', role: 'ADMIN' }).role).toBe('ADMIN');
  });

  it('refuses a bad username or an empty name', () => {
    expect(code(() => newUser(admin, { username: 'a b', displayName: 'A', role: 'USER' }))).toBe('INVALID_USERNAME');
    expect(code(() => newUser(admin, { username: 'abc', displayName: '  ', role: 'USER' }))).toBe('DISPLAY_NAME_REQUIRED');
  });
});

describe('changeUser', () => {
  const target = (role: Actor['role'], id = 'u-target') => ({ id, role, displayName: 'T', active: true });

  it('lets Admin manage only USER accounts, and not promote them', () => {
    expect(changeUser(admin, target('USER'), { displayName: 'New' }, 1).displayName).toBe('New');
    expect(code(() => changeUser(admin, target('ADMIN'), { displayName: 'New' }, 1))).toBe('FORBIDDEN');
    expect(code(() => changeUser(admin, target('USER'), { role: 'ADMIN' }, 1))).toBe('FORBIDDEN');
  });

  it('ends the sessions of a deactivated account and unlocks a reactivated one', () => {
    expect(changeUser(admin, target('USER'), { active: false }, 1)).toMatchObject({ active: false, endSessions: true, unlock: false });
    expect(changeUser(admin, { ...target('USER'), active: false }, { active: true }, 1)).toMatchObject({ endSessions: false, unlock: true });
  });

  it('keeps the last active Super Admin', () => {
    expect(code(() => changeUser(superAdmin, target('SUPER_ADMIN'), { active: false }, 1))).toBe('LAST_SUPER_ADMIN');
    expect(code(() => changeUser(superAdmin, target('SUPER_ADMIN'), { role: 'ADMIN' }, 1))).toBe('LAST_SUPER_ADMIN');
    expect(changeUser(superAdmin, target('SUPER_ADMIN'), { active: false }, 2).active).toBe(false);
  });

  it('does not let anyone manage their own account here', () => {
    expect(code(() => changeUser(superAdmin, target('SUPER_ADMIN', 'u-super'), { displayName: 'X' }, 2))).toBe('FORBIDDEN');
  });
});

describe('checkNewPassword', () => {
  it('needs a long enough password that differs from the current one', () => {
    expect(code(() => checkNewPassword('old-password', 'short'))).toBe('WEAK_PASSWORD');
    expect(code(() => checkNewPassword('same-password', 'same-password'))).toBe('SAME_PASSWORD');
    expect(code(() => checkNewPassword('old-password', 'new-password'))).toBeUndefined();
  });
});

describe('match', () => {
  const handler = async () => new Response();
  const routes: Route[] = [
    { method: 'GET', path: '/api/plans/summary', handler },
    { method: 'PUT', path: '/api/plans/:id', handler },
  ];

  it('finds the route and its parameters', () => {
    const found = match(routes, 'PUT', '/api/plans/abc-123');
    expect(found).toMatchObject({ params: { id: 'abc-123' } });
    expect(match(routes, 'GET', '/api/plans/summary')).toMatchObject({ route: routes[0] });
  });

  it('tells an unknown path from a wrong method', () => {
    expect(match(routes, 'GET', '/api/nothing')).toBe('not-found');
    expect(match(routes, 'DELETE', '/api/plans/abc')).toBe('method-not-allowed');
  });
});
