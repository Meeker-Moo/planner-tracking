import { computed, inject, Injectable, signal } from '@angular/core';
import { REMEMBER_DAYS } from './auth.config';
import { canUseProjects } from './permissions';
import { UserStore } from './user-store.service';
import { AppUser, AuthError, Role } from './user.model';

const SESSION_KEY = 'awp.session';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Session {
  userId: string;
  /** The account's sessionVersion at sign-in; a deactivation or password reset raises it and so ends this session. */
  sessionVersion: number;
  /** When the session stops counting, as epoch milliseconds; null for one that ends with the browser tab. */
  expiresAt: number | null;
}

export type LoginResult = { ok: true; user: AppUser } | { ok: false; error: AuthError };

/** Only paths inside the app, so a crafted ?returnUrl= cannot send someone to another site after signing in. */
export function safeReturnUrl(url: string | null | undefined, fallback = '/dashboard'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : fallback;
}

/** The page an account lands on: Super Admin only manages accounts, everyone else starts at the dashboard. */
export function homeUrlFor(user: Pick<AppUser, 'role'> | null): string {
  if (!user) return '/excel';
  return canUseProjects({ id: '', role: user.role }) ? '/dashboard' : '/users';
}

/**
 * Signs accounts from UserStore in and out. A plain session lasts until the tab is closed
 * (sessionStorage); a remembered one lasts REMEMBER_DAYS on this browser (localStorage).
 * `user` follows the store, so a rename or role change shows at once and a deactivated account drops out.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly store = inject(UserStore);
  private readonly session = signal<Session | null>(this.readStored(sessionStorage) ?? this.readStored(localStorage));

  readonly user = computed<AppUser | null>(() => {
    const session = this.session();
    const user = session ? this.store.getById(session.userId) : undefined;
    return user?.active && user.sessionVersion === session!.sessionVersion ? user : null;
  });
  readonly isLoggedIn = computed(() => this.user() !== null);

  async login(username: string, password: string, remember: boolean): Promise<LoginResult> {
    let user: AppUser;
    try {
      user = await this.store.authenticate(username, password);
    } catch (error) {
      if (error instanceof AuthError) return { ok: false, error };
      throw error;
    }
    const session: Session = {
      userId: user.id,
      sessionVersion: user.sessionVersion,
      expiresAt: remember ? Date.now() + REMEMBER_DAYS * DAY_MS : null,
    };
    this.clearStored();
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage blocked: stay signed in for this page only.
    }
    this.session.set(session);
    return { ok: true, user };
  }

  logout(): void {
    this.clearStored();
    this.session.set(null);
  }

  /** The signed-in account's own password change; throws an AuthError when refused. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.user();
    if (!user) throw new AuthError('FORBIDDEN');
    await this.store.changePassword(user.id, currentPassword, newPassword);
  }

  hasRole(...roles: Role[]): boolean {
    const user = this.user();
    return !!user && roles.includes(user.role);
  }

  /** Where the signed-in account starts (see homeUrlFor). */
  homeUrl(): string {
    return homeUrlFor(this.user());
  }

  /** A stored session that has not expired (an expired one, or one from before accounts existed, is removed). */
  private readStored(storage: Storage): Session | null {
    try {
      const raw = storage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      if (!s) return null;
      if (typeof s.userId !== 'string' || (s.expiresAt !== null && s.expiresAt < Date.now())) {
        storage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  private clearStored(): void {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
    }
  }
}
