import { computed, inject, Injectable, signal } from '@angular/core';
import { AUTH_ACCOUNT, AuthAccount, REMEMBER_DAYS } from './auth.config';

const SESSION_KEY = 'awp.session';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Session {
  username: string;
  displayName: string;
  /** When the session stops counting, as epoch milliseconds; null for one that ends with the browser tab. */
  expiresAt: number | null;
}

/** Hex SHA-256 of `username:password`, the form the password is kept in (see auth.config.ts). */
export async function credentialHash(username: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${username}:${password}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only paths inside the app, so a crafted ?returnUrl= cannot send someone to another site after signing in. */
export function safeReturnUrl(url: string | null | undefined, fallback = '/dashboard'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : fallback;
}

/**
 * Signs the one fixed account (auth.config.ts) in and out. A plain session lasts until the tab is
 * closed (sessionStorage); a remembered one lasts REMEMBER_DAYS on this browser (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly account = inject(AUTH_ACCOUNT);
  private readonly session = signal<Session | null>(this.readStored(sessionStorage) ?? this.readStored(localStorage));

  readonly user = this.session.asReadonly();
  readonly isLoggedIn = computed(() => this.session() !== null);

  /** True when the username (any case, outer spaces ignored) and password are the fixed account's. */
  async login(username: string, password: string, remember: boolean): Promise<boolean> {
    const account: AuthAccount = this.account;
    if (username.trim().toLowerCase() !== account.username.toLowerCase()) return false;
    if ((await credentialHash(account.username, password)) !== account.passwordHash) return false;

    const session: Session = {
      username: account.username,
      displayName: account.displayName,
      expiresAt: remember ? Date.now() + REMEMBER_DAYS * DAY_MS : null,
    };
    this.clearStored();
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage blocked: stay signed in for this page only.
    }
    this.session.set(session);
    return true;
  }

  logout(): void {
    this.clearStored();
    this.session.set(null);
  }

  /** A stored session, if it is for the current account and has not expired (an expired one is removed). */
  private readStored(storage: Storage): Session | null {
    try {
      const raw = storage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      if (!s || s.username !== this.account.username) return null;
      if (s.expiresAt !== null && s.expiresAt < Date.now()) {
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
