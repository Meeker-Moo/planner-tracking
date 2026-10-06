import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { canUseProjects } from './permissions';
import { AppUser, AuthError, Role } from './user.model';

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
 * The signed-in account. The session itself is an HttpOnly cookie the API sets at sign-in (remembered for
 * REMEMBER_DAYS, or until the browser closes); `restore()` asks the API whose it is when the app starts.
 * When any call finds the session gone (deactivated, password reset, expired), the account is signed out here
 * too and sent to the login page.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly current = signal<AppUser | null>(null);

  readonly user = this.current.asReadonly();
  readonly isLoggedIn = computed(() => this.user() !== null);

  constructor() {
    this.api.failures.subscribe((error) => {
      if (!this.user()) return;
      if (error.code === 'UNAUTHENTICATED') {
        this.current.set(null);
        void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
        this.current.update((u) => (u ? { ...u, mustChangePassword: true } : u));
        void this.router.navigate(['/change-password'], { queryParams: { returnUrl: this.router.url } });
      }
    });
  }

  /** The account of the session cookie, if it is still valid; called once when the app starts. */
  async restore(): Promise<void> {
    try {
      this.current.set((await this.api.get<{ user: AppUser | null }>('/auth/me')).user);
    } catch {
      this.current.set(null);
    }
  }

  async login(username: string, password: string, remember: boolean): Promise<LoginResult> {
    try {
      const { user } = await this.api.post<{ user: AppUser }>('/auth/login', { username, password, remember });
      this.current.set(user);
      return { ok: true, user };
    } catch (error) {
      if (error instanceof AuthError) return { ok: false, error };
      throw error;
    }
  }

  /** Signs out at once; the API is told in the background. */
  logout(): void {
    this.current.set(null);
    this.api.post('/auth/logout').catch(() => undefined);
  }

  /** The signed-in account's own password change; throws an AuthError when refused. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { user } = await this.api.post<{ user: AppUser }>('/auth/change-password', { currentPassword, newPassword });
    this.current.set(user);
  }

  hasRole(...roles: Role[]): boolean {
    const user = this.user();
    return !!user && roles.includes(user.role);
  }

  /** Where the signed-in account starts (see homeUrlFor). */
  homeUrl(): string {
    return homeUrlFor(this.user());
  }
}
