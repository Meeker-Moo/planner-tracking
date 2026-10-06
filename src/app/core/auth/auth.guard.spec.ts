import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { freshTestBed } from './auth.testing';
import { authGuard, guestGuard, projectsGuard, roleGuard } from './auth.guard';
import { UserStore } from './user-store.service';

function run(guard: CanActivateFn, url = '/plans'): string | true {
  const result = TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : (result as true);
}

describe('guards', () => {
  beforeEach(() => localStorage.clear());

  it('sends a visitor to the login page and back afterwards', () => {
    freshTestBed(null);
    expect(run(authGuard, '/timeline')).toBe('/login?returnUrl=%2Ftimeline');
    expect(run(guestGuard)).toBe(true);
  });

  it('sends an account with a one-time password to change it first', async () => {
    freshTestBed('u-user1');
    expect(run(authGuard)).toBe(true);
    await TestBed.inject(UserStore).resetPassword({ id: 'u-admin', role: 'ADMIN' }, 'u-user1');
    // The reset also ended the session; sign in again with the one-time password state.
    sessionStorage.setItem('awp.session', JSON.stringify({ userId: 'u-user1', sessionVersion: 1, expiresAt: null }));
    TestBed.resetTestingModule();
    expect(run(authGuard)).toBe('/change-password?returnUrl=%2Fplans');
  });

  it('keeps Super Admin to user management', () => {
    freshTestBed('u-superadmin');
    expect(run(projectsGuard)).toBe('/users');
    expect(run(roleGuard('SUPER_ADMIN', 'ADMIN'))).toBe(true);
    expect(run(guestGuard)).toBe('/users');
  });

  it('opens the project pages to Admin and User, and user management and Monthly Report to Admin only', () => {
    freshTestBed('u-admin');
    expect(run(projectsGuard)).toBe(true);
    expect(run(roleGuard('SUPER_ADMIN', 'ADMIN'))).toBe(true);

    freshTestBed('u-user1');
    expect(run(projectsGuard)).toBe(true);
    expect(run(roleGuard('SUPER_ADMIN', 'ADMIN'))).toBe('/dashboard');
    expect(run(roleGuard('ADMIN'), '/monthly-report')).toBe('/dashboard');
    expect(run(guestGuard)).toBe('/dashboard');
  });
});
