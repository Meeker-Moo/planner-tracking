import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * The one fixed account that may sign in.
 *
 * The password itself is not kept here, only the SHA-256 of `username:password` (in hex). To change the
 * account, pick a new username and password and print the hash with:
 *
 *   node -e "console.log(require('crypto').createHash('sha256').update('admin:NEW-PASSWORD').digest('hex'))"
 *
 * then paste the username and the printed hash below.
 *
 * This is a gate in the browser, not real security: the site's files stay public on GitHub Pages and
 * anyone who edits the browser's storage can get past it. See README (Login).
 */
export interface AuthAccount {
  username: string;
  /** Hex SHA-256 of `username:password`. */
  passwordHash: string;
  /** The name the toolbar shows once signed in. */
  displayName: string;
}

export const AUTH_USER: AuthAccount = {
  username: 'admin',
  passwordHash: '628bd473777bc3e4fa622e9dfab8e9e599fc25878f09101e5aa440c4fa2209fa',
  displayName: 'ผู้ดูแลระบบ',
};

/** The account AuthService checks against; tests provide their own. */
export const AUTH_ACCOUNT = new InjectionToken<AuthAccount>('AUTH_ACCOUNT', { providedIn: 'root', factory: () => AUTH_USER });

/**
 * True in the develop environment (`ng serve`): everyone counts as signed in as AUTH_USER without the login page.
 * Signing out still works until the page is reloaded. Production builds always ask for the login.
 */
export const BYPASS_LOGIN = new InjectionToken<boolean>('BYPASS_LOGIN', { providedIn: 'root', factory: () => environment.env === 'develop' });

/** How long "จดจำการเข้าสู่ระบบ" keeps someone signed in on this browser. */
export const REMEMBER_DAYS = 30;
