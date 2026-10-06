import { TestBed } from '@angular/core/testing';
import { backend, freshTestBed, resetBackend } from './auth.testing';
import { UserStore } from './user-store.service';
import { AuthError } from './user.model';

async function as(userId: string): Promise<UserStore> {
  await freshTestBed(userId);
  return TestBed.inject(UserStore);
}

describe('UserStore', () => {
  beforeEach(() => resetBackend());

  it('gives Super Admin and Admin every account in full', async () => {
    for (const id of ['u-superadmin', 'u-admin']) {
      const store = await as(id);
      expect(store.accounts().map((u) => u.id)).toEqual(['u-superadmin', 'u-admin', 'u-user1', 'u-user2']);
      expect(store.users()).toHaveLength(4);
      expect(store.displayName('u-user1')).toBe('ผู้ใช้ 1 (dev)');
    }
  });

  it('gives a User only the names of the Admin and User accounts', async () => {
    const store = await as('u-user1');
    expect(store.accounts()).toEqual([]);
    expect(store.users()).toEqual([
      { id: 'u-admin', displayName: 'Admin (dev)', role: 'ADMIN', active: true },
      { id: 'u-user1', displayName: 'ผู้ใช้ 1 (dev)', role: 'USER', active: true },
      { id: 'u-user2', displayName: 'ผู้ใช้ 2 (dev)', role: 'USER', active: true },
    ]);
    expect(store.displayName('missing')).toBe('–');
    expect(backend.requests.some((r) => r.path === '/users')).toBe(false);
  });

  it('creates an account and hands over its one-time password', async () => {
    const store = await as('u-admin');
    const { user, tempPassword } = await store.create({ username: 'new.user', displayName: 'ใหม่', role: 'USER' });
    expect(tempPassword).toBeTruthy();
    expect(user.mustChangePassword).toBe(true);
    expect(store.accounts().map((u) => u.username)).toContain('new.user');
  });

  it('shows an edit at once, and a refusal as an AuthError', async () => {
    const store = await as('u-admin');
    await store.update('u-user1', { displayName: 'ชื่อใหม่', active: false });
    expect(store.getById('u-user1')).toMatchObject({ displayName: 'ชื่อใหม่', active: false });
    await expect(store.update('missing', { displayName: 'x' })).rejects.toBeInstanceOf(AuthError);
  });

  it('resets a password', async () => {
    const store = await as('u-admin');
    expect(await store.resetPassword('u-user2')).toBe('temp-pass');
    expect(backend.users.find((u) => u.id === 'u-user2')?.mustChangePassword).toBe(true);
  });
});
