import { TestBed } from '@angular/core/testing';
import { freshTestBed } from './auth.testing';
import { AuthService, homeUrlFor, safeReturnUrl } from './auth.service';
import { UserStore } from './user-store.service';

const admin = { id: 'u-admin', role: 'ADMIN' as const };

/** An AuthService that reads the stored session again, as a reload of the page would. */
function reloaded(): AuthService {
  TestBed.resetTestingModule();
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    freshTestBed(null);
    auth = TestBed.inject(AuthService);
  });

  it('refuses a wrong username or password with the reason', async () => {
    const result = await auth.login('user1', 'wrong', false);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('signs in for this tab only, ignoring the case of the username', async () => {
    const result = await auth.login('  User1 ', 'user1234', false);
    expect(result.ok).toBe(true);
    expect(auth.user()).toMatchObject({ id: 'u-user1', username: 'user1', role: 'USER' });
    expect(JSON.parse(sessionStorage.getItem('awp.session')!)).toMatchObject({ userId: 'u-user1', expiresAt: null });
    expect(localStorage.getItem('awp.session')).toBeNull();
  });

  it('remembers a session on this browser until it expires', async () => {
    await auth.login('user1', 'user1234', true);
    sessionStorage.clear();
    expect(reloaded().user()?.id).toBe('u-user1');

    const session = JSON.parse(localStorage.getItem('awp.session')!);
    localStorage.setItem('awp.session', JSON.stringify({ ...session, expiresAt: Date.now() - 1 }));
    expect(reloaded().isLoggedIn()).toBe(false);
    expect(localStorage.getItem('awp.session')).toBeNull();
  });

  it('signs out everywhere', async () => {
    await auth.login('user1', 'user1234', true);
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    expect(reloaded().isLoggedIn()).toBe(false);
  });

  it('drops the session at once when the account is deactivated or its password reset', async () => {
    const store = TestBed.inject(UserStore);
    await auth.login('user1', 'user1234', true);
    await store.update(admin, 'u-user1', { active: false });
    expect(auth.user()).toBeNull();

    await store.update(admin, 'u-user1', { active: true });
    expect(auth.user()).toBeNull();
    await auth.login('user1', 'user1234', false);
    expect(auth.user()?.id).toBe('u-user1');
    await store.resetPassword(admin, 'u-user1');
    expect(auth.user()).toBeNull();
  });

  it('follows a rename or role change of the signed-in account', async () => {
    await auth.login('user1', 'user1234', false);
    await TestBed.inject(UserStore).update({ id: 'u-superadmin', role: 'SUPER_ADMIN' }, 'u-user1', { displayName: 'ชื่อใหม่', role: 'ADMIN' });
    expect(auth.user()).toMatchObject({ displayName: 'ชื่อใหม่', role: 'ADMIN' });
    expect(auth.hasRole('ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(auth.hasRole('USER')).toBe(false);
  });

  it('ignores a session saved by the single-account version', () => {
    sessionStorage.setItem('awp.session', JSON.stringify({ username: 'admin', displayName: 'ผู้ดูแลระบบ', expiresAt: null }));
    expect(reloaded().isLoggedIn()).toBe(false);
  });

  it('changes the signed-in account’s password', async () => {
    await auth.login('user1', 'user1234', false);
    await auth.changePassword('user1234', 'new-password-1');
    auth.logout();
    expect((await auth.login('user1', 'new-password-1', false)).ok).toBe(true);
  });

  it('sends Super Admin to user management and everyone else to the dashboard', () => {
    expect(homeUrlFor({ role: 'SUPER_ADMIN' })).toBe('/users');
    expect(homeUrlFor({ role: 'ADMIN' })).toBe('/dashboard');
    expect(homeUrlFor({ role: 'USER' })).toBe('/dashboard');
    expect(homeUrlFor(null)).toBe('/excel');
  });

  it('keeps the return address inside the app', () => {
    expect(safeReturnUrl('/timeline?x=1')).toBe('/timeline?x=1');
    expect(safeReturnUrl('https://evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('//evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('/login')).toBe('/dashboard');
    expect(safeReturnUrl(null)).toBe('/dashboard');
    expect(safeReturnUrl(null, '/users')).toBe('/users');
  });
});
