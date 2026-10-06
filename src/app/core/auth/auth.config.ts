import { environment } from '../../../environments/environment';
import { Role } from './user.model';

export { LOCK_MINUTES, MAX_FAILED_LOGINS, REMEMBER_DAYS } from './auth.limits';

/** A develop test account, listed on the login page so it can be filled in with one click. */
export interface DevAccount {
  username: string;
  password: string;
  displayName: string;
  role: Role;
}

/**
 * The accounts of server/seed-dev.sql (`npm run db:seed:local`), one or two per role. Only listed under `ng serve`;
 * the real accounts live in the database, starting with the Super Admin of `npm run create-super-admin`.
 */
const DEV_ACCOUNT_LIST: DevAccount[] = [
  { username: 'superadmin', password: 'super1234', displayName: 'Super Admin (dev)', role: 'SUPER_ADMIN' },
  { username: 'admin', password: 'admin1234', displayName: 'Admin (dev)', role: 'ADMIN' },
  { username: 'user1', password: 'user1234', displayName: 'ผู้ใช้ 1 (dev)', role: 'USER' },
  { username: 'user2', password: 'user1234', displayName: 'ผู้ใช้ 2 (dev)', role: 'USER' },
];

export const DEV_ACCOUNTS: DevAccount[] = environment.env === 'develop' ? DEV_ACCOUNT_LIST : [];
