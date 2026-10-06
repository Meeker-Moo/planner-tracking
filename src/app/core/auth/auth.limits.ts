// Plain values shared by the app and the server (server/), so nothing here may import Angular.

/** How long "จดจำการเข้าสู่ระบบ" keeps someone signed in. */
export const REMEMBER_DAYS = 30;

/** Wrong passwords in a row before the account is locked, and for how long. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Allowed usernames: kept in lower case. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
