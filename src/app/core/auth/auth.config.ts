import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SeedUser } from './user.model';

/**
 * Accounts are kept in this browser's localStorage by UserStore until the app has a database
 * (see golive-plan.md). This is a gate in the browser, not real security: anyone who edits the
 * browser's storage can get past it. See README (Login).
 */

/** Projects and events saved before accounts existed belong to this account (the seeded `admin`). */
export const LEGACY_OWNER_ID = 'u-admin';

/**
 * The accounts created when this browser has none yet. Their passwords are kept as `sha256$` of
 * `username:password` (the first version's form) and are redone as PBKDF2 at their first sign-in.
 * To print a hash:
 *
 *   node -e "console.log(require('crypto').createHash('sha256').update('admin:NEW-PASSWORD').digest('hex'))"
 */
export const PRODUCTION_SEED_USERS: SeedUser[] = [
  {
    // Temporary password ChangeMe-2569; it must be changed at the first sign-in.
    id: 'u-superadmin',
    username: 'superadmin',
    displayName: 'Super Admin',
    role: 'SUPER_ADMIN',
    passwordHash: 'sha256$4641314857a27e7d9690b852bb117bc58da6535ee79b23d993e7d0b2cee99d42',
    mustChangePassword: true,
  },
  {
    // The single account of the first version, with its password unchanged.
    id: LEGACY_OWNER_ID,
    username: 'admin',
    displayName: 'ผู้ดูแลระบบ',
    role: 'ADMIN',
    passwordHash: 'sha256$628bd473777bc3e4fa622e9dfab8e9e599fc25878f09101e5aa440c4fa2209fa',
    mustChangePassword: false,
  },
];

/** The develop environment's test accounts, one or two per role; the login page lists them. */
export const DEVELOP_SEED_USERS: SeedUser[] = [
  {
    id: 'u-superadmin',
    username: 'superadmin',
    displayName: 'Super Admin (dev)',
    role: 'SUPER_ADMIN',
    passwordHash: 'sha256$b69bb836b320a6272731d7b48a88d896e98e22dd6cbd49f5fb137a1cec036569',
    mustChangePassword: false,
    devPassword: 'super1234',
  },
  {
    id: LEGACY_OWNER_ID,
    username: 'admin',
    displayName: 'Admin (dev)',
    role: 'ADMIN',
    passwordHash: 'sha256$590c783dce35634a13f99f7b25482678536c9a39cf153f1bb83554aa0362e5d1',
    mustChangePassword: false,
    devPassword: 'admin1234',
  },
  {
    id: 'u-user1',
    username: 'user1',
    displayName: 'ผู้ใช้ 1 (dev)',
    role: 'USER',
    passwordHash: 'sha256$321f8342d492180b5270d6a21de199d11256a316720b1b9a73e3a80f5703df9e',
    mustChangePassword: false,
    devPassword: 'user1234',
  },
  {
    id: 'u-user2',
    username: 'user2',
    displayName: 'ผู้ใช้ 2 (dev)',
    role: 'USER',
    passwordHash: 'sha256$59d65222fcd80b61ad7e44ce3e75d2792d9a18eb52343745cb413c34e73a468b',
    mustChangePassword: false,
    devPassword: 'user1234',
  },
];

/** The seed UserStore uses: the test accounts under `ng serve`, the real ones in production; tests provide their own. */
export const SEED_USERS = new InjectionToken<SeedUser[]>('SEED_USERS', {
  providedIn: 'root',
  factory: () => (environment.env === 'develop' ? DEVELOP_SEED_USERS : PRODUCTION_SEED_USERS),
});

export { LOCK_MINUTES, MAX_FAILED_LOGINS, REMEMBER_DAYS } from './auth.limits';
