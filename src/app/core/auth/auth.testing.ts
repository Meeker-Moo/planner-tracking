import { TestBed } from '@angular/core/testing';
import { DEVELOP_SEED_USERS, SEED_USERS } from './auth.config';

/** For specs: the develop accounts (u-superadmin, u-admin, u-user1, u-user2), passwords as in auth.config.ts. */
export const TEST_SEED_USERS = DEVELOP_SEED_USERS;

/**
 * For specs: a fresh TestBed whose AuthService starts signed in as the given seeded account (or signed out),
 * keeping whatever is in localStorage, so a second call reads back what the first one saved.
 */
export function freshTestBed(userId: string | null): void {
  TestBed.resetTestingModule();
  sessionStorage.clear();
  localStorage.removeItem('awp.session');
  if (userId) sessionStorage.setItem('awp.session', JSON.stringify({ userId, sessionVersion: 0, expiresAt: null }));
  TestBed.configureTestingModule({ providers: [{ provide: SEED_USERS, useValue: TEST_SEED_USERS }] });
}
