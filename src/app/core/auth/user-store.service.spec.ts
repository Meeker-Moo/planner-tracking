import { TestBed } from '@angular/core/testing';
import { freshTestBed } from './auth.testing';
import { MAX_FAILED_LOGINS } from './auth.config';
import { UserStore } from './user-store.service';
import { AuthError, AuthErrorCode, StoredUser } from './user.model';

const superAdmin = { id: 'u-superadmin', role: 'SUPER_ADMIN' as const };
const admin = { id: 'u-admin', role: 'ADMIN' as const };
const user1 = { id: 'u-user1', role: 'USER' as const };

function stored(): StoredUser[] {
  return JSON.parse(localStorage.getItem('awp:users:v1') ?? '[]');
}

async function failsWith(promise: Promise<unknown>, code: AuthErrorCode): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).code).toBe(code);
}

describe('UserStore', () => {
  let store: UserStore;

  beforeEach(() => {
    localStorage.clear();
    freshTestBed(null);
    store = TestBed.inject(UserStore);
  });

  it('seeds the accounts once and reads them back afterwards', () => {
    expect(store.users().map((u) => u.username)).toEqual(['superadmin', 'admin', 'user1', 'user2']);
    expect(store.users()[0]).not.toHaveProperty('passwordHash');
    expect(stored()).toHaveLength(4);

    localStorage.setItem('awp:users:v1', JSON.stringify(stored().slice(0, 2)));
    freshTestBed(null);
    expect(TestBed.inject(UserStore).users()).toHaveLength(2);
  });

  describe('authenticate', () => {
    it('signs in ignoring the case of the username, and rehashes a seeded password as PBKDF2', async () => {
      expect(stored()[1].passwordHash).toMatch(/^sha256\$/);
      const user = await store.authenticate('  ADMIN ', 'admin1234');
      expect(user.id).toBe('u-admin');
      expect(stored()[1].passwordHash).toMatch(/^pbkdf2\$100000\$/);
      expect((await store.authenticate('admin', 'admin1234')).id).toBe('u-admin');
    });

    it('refuses an unknown username or a wrong password', async () => {
      await failsWith(store.authenticate('nobody', 'admin1234'), 'INVALID');
      await failsWith(store.authenticate('admin', 'wrong'), 'INVALID');
    });

    it('locks the account after too many wrong passwords in a row', async () => {
      for (let i = 1; i < MAX_FAILED_LOGINS; i++) await failsWith(store.authenticate('user1', 'wrong'), 'INVALID');
      await failsWith(store.authenticate('user1', 'wrong'), 'LOCKED');
      await failsWith(store.authenticate('user1', 'user1234'), 'LOCKED');
      expect(stored()[2].lockedUntil).toBeTruthy();
    });

    it('forgets earlier wrong passwords after a successful sign-in', async () => {
      for (let i = 1; i < MAX_FAILED_LOGINS; i++) await failsWith(store.authenticate('user1', 'wrong'), 'INVALID');
      await store.authenticate('user1', 'user1234');
      await failsWith(store.authenticate('user1', 'wrong'), 'INVALID');
    });

    it('refuses a deactivated account', async () => {
      await store.update(admin, 'u-user1', { active: false });
      await failsWith(store.authenticate('user1', 'user1234'), 'INACTIVE');
    });
  });

  describe('create', () => {
    it('creates an account with a one-time password that must be changed', async () => {
      const { user, tempPassword } = await store.create(admin, { username: ' New.User ', displayName: ' ผู้ใช้ใหม่ ', role: 'USER' });
      expect(user).toMatchObject({ username: 'new.user', displayName: 'ผู้ใช้ใหม่', role: 'USER', active: true, mustChangePassword: true, createdBy: 'u-admin' });
      expect(tempPassword).toHaveLength(10);
      expect((await store.authenticate('new.user', tempPassword)).id).toBe(user.id);
    });

    it('lets Admin create only User accounts, and Super Admin any', async () => {
      await failsWith(store.create(admin, { username: 'boss', displayName: 'Boss', role: 'ADMIN' }), 'FORBIDDEN');
      await failsWith(store.create(user1, { username: 'friend', displayName: 'Friend', role: 'USER' }), 'FORBIDDEN');
      expect((await store.create(superAdmin, { username: 'boss', displayName: 'Boss', role: 'ADMIN' })).user.role).toBe('ADMIN');
    });

    it('goes by the stored role, not the one the caller claims', async () => {
      await failsWith(store.create({ id: 'u-user1', role: 'SUPER_ADMIN' }, { username: 'x-boss', displayName: 'X', role: 'ADMIN' }), 'FORBIDDEN');
    });

    it('refuses a taken or malformed username and a blank name', async () => {
      await failsWith(store.create(admin, { username: 'USER1', displayName: 'ซ้ำ', role: 'USER' }), 'USERNAME_TAKEN');
      await failsWith(store.create(admin, { username: 'สมชาย', displayName: 'ไทย', role: 'USER' }), 'INVALID_USERNAME');
      await failsWith(store.create(admin, { username: 'ab', displayName: 'สั้น', role: 'USER' }), 'INVALID_USERNAME');
      await failsWith(store.create(admin, { username: 'blank', displayName: '  ', role: 'USER' }), 'DISPLAY_NAME_REQUIRED');
    });
  });

  describe('update', () => {
    it('lets Admin rename and deactivate a User, ending their sessions', async () => {
      const updated = await store.update(admin, 'u-user1', { displayName: 'ชื่อใหม่', active: false });
      expect(updated).toMatchObject({ displayName: 'ชื่อใหม่', active: false, sessionVersion: 1 });
      expect((await store.update(admin, 'u-user1', { active: true })).sessionVersion).toBe(1);
    });

    it('keeps Admin away from Admin and Super Admin accounts, and from promoting a User', async () => {
      await failsWith(store.update(admin, 'u-superadmin', { active: false }), 'FORBIDDEN');
      await failsWith(store.update(admin, 'u-user1', { role: 'ADMIN' }), 'FORBIDDEN');
      await failsWith(store.update(admin, 'u-admin', { displayName: 'ตัวเอง' }), 'FORBIDDEN');
    });

    it('lets Super Admin change roles and deactivate an Admin, but not their own account', async () => {
      expect((await store.update(superAdmin, 'u-user1', { role: 'ADMIN' })).role).toBe('ADMIN');
      expect((await store.update(superAdmin, 'u-admin', { active: false })).active).toBe(false);
      await failsWith(store.update(superAdmin, 'u-superadmin', { active: false }), 'FORBIDDEN');
    });

    it('keeps an active Super Admin', async () => {
      const second = (await store.create(superAdmin, { username: 'super2', displayName: 'Super 2', role: 'SUPER_ADMIN' })).user;
      await store.update(second, 'u-superadmin', { active: false });
      await failsWith(store.update({ id: 'u-superadmin', role: 'SUPER_ADMIN' }, second.id, { active: false }), 'FORBIDDEN');
      expect(store.users().filter((u) => u.role === 'SUPER_ADMIN' && u.active).map((u) => u.id)).toEqual([second.id]);
    });
  });

  describe('passwords', () => {
    it('resets to a new one-time password, unlocking the account and ending its sessions', async () => {
      for (let i = 0; i < MAX_FAILED_LOGINS; i++) await store.authenticate('user1', 'wrong').catch(() => null);
      const temp = await store.resetPassword(admin, 'u-user1');
      expect(store.getById('u-user1')).toMatchObject({ mustChangePassword: true, sessionVersion: 1 });
      await failsWith(store.authenticate('user1', 'user1234'), 'INVALID');
      expect((await store.authenticate('user1', temp)).id).toBe('u-user1');
      await failsWith(store.resetPassword(user1, 'u-user2'), 'FORBIDDEN');
    });

    it('changes its own password and clears the must-change flag', async () => {
      const temp = await store.resetPassword(admin, 'u-user1');
      await failsWith(store.changePassword('u-user1', 'wrong', 'a-long-password'), 'WRONG_PASSWORD');
      await failsWith(store.changePassword('u-user1', temp, 'short'), 'WEAK_PASSWORD');
      await failsWith(store.changePassword('u-user1', temp, temp), 'SAME_PASSWORD');
      expect((await store.changePassword('u-user1', temp, 'a-long-password')).mustChangePassword).toBe(false);
      expect((await store.authenticate('user1', 'a-long-password')).id).toBe('u-user1');
    });
  });
});
