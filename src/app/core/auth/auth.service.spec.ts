import { TestBed } from '@angular/core/testing';
import { AUTH_ACCOUNT, AuthAccount, BYPASS_LOGIN } from './auth.config';
import { AuthService, credentialHash, safeReturnUrl } from './auth.service';

// sha256('tester:secret-1')
const account: AuthAccount = {
  username: 'tester',
  passwordHash: 'ddaa5a25cc7b40629292288af343302f6818618eef73a80d14f9c9adf9f8ed06',
  displayName: 'ผู้ทดสอบ',
};

function create(bypass = false): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AUTH_ACCOUNT, useValue: account },
      { provide: BYPASS_LOGIN, useValue: bypass },
    ],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('hashes username:password as hex SHA-256', async () => {
    expect(await credentialHash('tester', 'secret-1')).toBe(account.passwordHash);
  });

  it('refuses a wrong username or password', async () => {
    const auth = create();
    expect(await auth.login('someone', 'secret-1', false)).toBe(false);
    expect(await auth.login('tester', 'wrong', false)).toBe(false);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('signs in for this tab only, ignoring the case of the username', async () => {
    const auth = create();
    expect(await auth.login('  Tester ', 'secret-1', false)).toBe(true);
    expect(auth.user()).toMatchObject({ username: 'tester', displayName: 'ผู้ทดสอบ', expiresAt: null });
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(create().isLoggedIn()).toBe(true);
  });

  it('remembers a session on this browser until it expires', async () => {
    const auth = create();
    await auth.login('tester', 'secret-1', true);
    expect(localStorage.length).toBe(1);
    expect(create().isLoggedIn()).toBe(true);

    const key = localStorage.key(0)!;
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), expiresAt: Date.now() - 1 }));
    expect(create().isLoggedIn()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('signs out everywhere', async () => {
    const auth = create();
    await auth.login('tester', 'secret-1', true);
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    expect(create().isLoggedIn()).toBe(false);
  });

  it('signs in without the login page in the develop environment', () => {
    const auth = create(true);
    expect(auth.user()).toMatchObject({ username: 'tester', displayName: 'ผู้ทดสอบ (develop)', expiresAt: null });
    expect(sessionStorage.length + localStorage.length).toBe(0);
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('keeps the return address inside the app', () => {
    expect(safeReturnUrl('/timeline?x=1')).toBe('/timeline?x=1');
    expect(safeReturnUrl('https://evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('//evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('/login')).toBe('/dashboard');
    expect(safeReturnUrl(null)).toBe('/dashboard');
  });
});
