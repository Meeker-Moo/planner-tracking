import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../services/api.service';
import { SessionLoader } from '../services/session-loader';
import { AuthService } from './auth.service';
import { canManageUsers } from './permissions';
import { AppUser, DirectoryUser, Role } from './user.model';

export interface NewUserInput {
  username: string;
  displayName: string;
  role: Role;
}

export interface UserPatch {
  displayName?: string;
  role?: Role;
  active?: boolean;
}

/**
 * The accounts, from the API. Super Admin and Admin get every account in full (`accounts`, for user management);
 * a User only the directory of Admin and User names. `users` is the directory either way: names for owner tags
 * and the accounts to pick as responsible. The API checks every change itself (server/users.ts) and refuses with
 * an AuthError. Accounts are never deleted, only deactivated, so the projects they own keep a name.
 */
@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly accountList = signal<AppUser[]>([]);
  private readonly directory = signal<DirectoryUser[]>([]);

  /** Every account in full, for Super Admin and Admin; empty for a User. */
  readonly accounts = this.accountList.asReadonly();

  readonly users = computed<DirectoryUser[]>(() => {
    const accounts = this.accountList();
    return accounts.length ? accounts.map(({ id, displayName, role, active }) => ({ id, displayName, role, active })) : this.directory();
  });

  private readonly loader = new SessionLoader(
    () => {
      const user = this.auth.user();
      return user && !user.mustChangePassword ? `${user.id}:${user.role}` : null;
    },
    (isCurrent) => this.load(isCurrent),
    () => {
      this.accountList.set([]);
      this.directory.set([]);
    },
  );

  /** Resolves once the accounts of the signed-in account are loaded. */
  ready(): Promise<void> {
    return this.loader.ready();
  }

  /** Loads the accounts again (the user management page does, to show other admins' changes). */
  reload(): Promise<void> {
    return this.loader.reload();
  }

  getById(id: string | undefined): DirectoryUser | undefined {
    return id ? this.users().find((u) => u.id === id) : undefined;
  }

  /** The name to show for an account id, or a dash when it is unknown. */
  displayName(id: string | undefined): string {
    return this.getById(id)?.displayName ?? '–';
  }

  /** A new account with a one-time password, returned once so it can be handed over. */
  async create(input: NewUserInput): Promise<{ user: AppUser; tempPassword: string }> {
    const result = await this.api.post<{ user: AppUser; tempPassword: string }>('/users', input);
    this.accountList.update((list) => [...list, result.user]);
    return result;
  }

  /** Renames, changes the role of, or (de)activates an account. Deactivating ends its sessions. */
  async update(id: string, patch: UserPatch): Promise<AppUser> {
    const { user } = await this.api.patch<{ user: AppUser }>(`/users/${encodeURIComponent(id)}`, patch);
    this.accountList.update((list) => list.map((u) => (u.id === id ? user : u)));
    return user;
  }

  /** Sets a new one-time password (returned once), unlocks the account and ends its sessions. */
  async resetPassword(id: string): Promise<string> {
    const { tempPassword } = await this.api.post<{ tempPassword: string }>(`/users/${encodeURIComponent(id)}/reset-password`);
    return tempPassword;
  }

  private async load(isCurrent: () => boolean): Promise<void> {
    if (canManageUsers(this.auth.user())) {
      const { users } = await this.api.get<{ users: AppUser[] }>('/users');
      if (isCurrent()) this.accountList.set(users);
    } else {
      const { users } = await this.api.get<{ users: DirectoryUser[] }>('/users/directory');
      if (isCurrent()) {
        this.accountList.set([]);
        this.directory.set(users);
      }
    }
  }
}
