import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { backend, freshTestBed, resetBackend } from './auth.testing';
import { AuthService, homeUrlFor, safeReturnUrl } from './auth.service';
import { WorkPlanService } from '../services/work-plan.service';

describe('AuthService', () => {
  let auth: AuthService;

  beforeEach(async () => {
    await resetBackend();
    await freshTestBed(null);
    auth = TestBed.inject(AuthService);
  });

  it('refuses a wrong username or password with the reason', async () => {
    const result = await auth.login('user1', 'wrong', false);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('signs in through the API and asks to be remembered', async () => {
    const result = await auth.login('  User1 ', 'user1234', true);
    expect(result.ok).toBe(true);
    expect(auth.user()).toMatchObject({ id: 'u-user1', username: 'user1', role: 'USER' });
    expect(backend.requests.at(-1)).toMatchObject({ method: 'POST', path: '/auth/login', body: { username: '  User1 ', remember: true } });
  });

  it('finds the account of the session when the app starts', async () => {
    await freshTestBed('u-admin');
    expect(TestBed.inject(AuthService).user()?.id).toBe('u-admin');
    await freshTestBed(null);
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });

  it('signs out here and on the server', async () => {
    await auth.login('user1', 'user1234', true);
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    await vi.waitFor(() => expect(backend.session).toBeNull());
  });

  it('sends the account to the login page when a call finds its session gone (deactivated, reset, expired)', async () => {
    await freshTestBed('u-user1');
    const session = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    backend.session = null;

    await TestBed.inject(WorkPlanService)
      .summary(2569)
      .catch(() => undefined);
    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('sends an account that must change its password to do so', async () => {
    backend.users.find((u) => u.id === 'u-user1')!.mustChangePassword = true;
    await freshTestBed('u-user1');
    const session = TestBed.inject(AuthService);
    expect(session.user()?.mustChangePassword).toBe(true);

    await session.changePassword('user1234', 'new-password-1');
    expect(session.user()?.mustChangePassword).toBe(false);
    session.logout();
    expect((await session.login('user1', 'new-password-1', false)).ok).toBe(true);
  });

  it('tells which role the account has', async () => {
    await auth.login('admin', 'admin1234', false);
    expect(auth.hasRole('ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(auth.hasRole('USER')).toBe(false);
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
