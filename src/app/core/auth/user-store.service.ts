import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { uid } from '../../shared/utils/id.util';
import { SEED_USERS } from './auth.config';
import { LOCK_MINUTES, MAX_FAILED_LOGINS, USERNAME_PATTERN } from './auth.limits';
import { hashPassword, MIN_PASSWORD_LENGTH, needsRehash, temporaryPassword, verifyPassword } from './password.util';
import { Actor, assignableRoles, canManageUser } from './permissions';
import { AppUser, AuthError, Role, SeedUser, StoredUser } from './user.model';

const STORAGE_KEY = 'awp:users:v1';

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

function toAppUser({ passwordHash: _hash, failedLogins: _failed, lockedUntil: _locked, ...user }: StoredUser): AppUser {
  return user;
}

function fromSeed({ devPassword: _password, ...seed }: SeedUser): StoredUser {
  const now = new Date().toISOString();
  return { ...seed, active: true, failedLogins: 0, lockedUntil: null, sessionVersion: 0, createdBy: null, createdAt: now, updatedAt: now };
}

/**
 * The accounts, kept in this browser's localStorage until the app has a server (golive-plan.md).
 * Its async methods stand in for the API endpoints of that plan, and like them they check the
 * rules themselves (permissions.ts) rather than trusting the page, throwing an AuthError when refused.
 * Accounts are never deleted, only deactivated, so the projects they own keep a name.
 */
@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly storage = inject(StorageService);
  private readonly seeds = inject(SEED_USERS);
  private readonly stored = signal<StoredUser[]>(this.load());

  readonly users = computed(() => this.stored().map(toAppUser));

  constructor() {
    // Another tab changed the accounts, for example deactivated the one signed in here.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) this.stored.set(this.load());
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  getById(id: string | undefined): AppUser | undefined {
    return id ? this.users().find((u) => u.id === id) : undefined;
  }

  /** The name to show for an account id, or a dash when it is unknown. */
  displayName(id: string | undefined): string {
    return this.getById(id)?.displayName ?? '–';
  }

  /** A new account with a one-time password, returned once so it can be handed over. */
  async create(actor: Actor, input: NewUserInput): Promise<{ user: AppUser; tempPassword: string }> {
    const by = this.actorOf(actor);
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!USERNAME_PATTERN.test(username)) throw new AuthError('INVALID_USERNAME');
    if (!displayName) throw new AuthError('DISPLAY_NAME_REQUIRED');
    if (!assignableRoles(by).includes(input.role)) throw new AuthError('FORBIDDEN');
    if (this.findByUsername(username)) throw new AuthError('USERNAME_TAKEN');

    const tempPassword = temporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    if (this.findByUsername(username)) throw new AuthError('USERNAME_TAKEN');

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: uid(),
      username,
      displayName,
      role: input.role,
      active: true,
      mustChangePassword: true,
      passwordHash,
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: 0,
      createdBy: by.id,
      createdAt: now,
      updatedAt: now,
    };
    this.write([...this.stored(), user]);
    return { user: toAppUser(user), tempPassword };
  }

  /** Renames, changes the role of, or (de)activates an account. Deactivating ends its sessions. */
  async update(actor: Actor, id: string, patch: UserPatch): Promise<AppUser> {
    const by = this.actorOf(actor);
    const target = this.find(id);
    if (!canManageUser(by, target)) throw new AuthError('FORBIDDEN');

    const role = patch.role ?? target.role;
    if (role !== target.role && !assignableRoles(by).includes(role)) throw new AuthError('FORBIDDEN');
    const displayName = patch.displayName === undefined ? target.displayName : patch.displayName.trim();
    if (!displayName) throw new AuthError('DISPLAY_NAME_REQUIRED');
    const active = patch.active ?? target.active;
    const losesSuperAdmin = target.role === 'SUPER_ADMIN' && target.active && (role !== 'SUPER_ADMIN' || !active);
    if (losesSuperAdmin && this.stored().filter((u) => u.role === 'SUPER_ADMIN' && u.active).length <= 1) {
      throw new AuthError('LAST_SUPER_ADMIN');
    }

    const deactivated = target.active && !active;
    const reactivated = !target.active && active;
    const next: StoredUser = {
      ...target,
      displayName,
      role,
      active,
      sessionVersion: target.sessionVersion + (deactivated ? 1 : 0),
      ...(reactivated ? { failedLogins: 0, lockedUntil: null } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.replace(next);
    return toAppUser(next);
  }

  /** Sets a new one-time password (returned once), unlocks the account and ends its sessions. */
  async resetPassword(actor: Actor, id: string): Promise<string> {
    const by = this.actorOf(actor);
    if (!canManageUser(by, this.find(id))) throw new AuthError('FORBIDDEN');
    const tempPassword = temporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    const target = this.find(id);
    this.replace({
      ...target,
      passwordHash,
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: target.sessionVersion + 1,
      updatedAt: new Date().toISOString(),
    });
    return tempPassword;
  }

  /**
   * The account for a username (any case) and password. MAX_FAILED_LOGINS wrong passwords in a row lock
   * it for LOCK_MINUTES. A password kept in an older form is hashed again in the current one.
   */
  async authenticate(username: string, password: string): Promise<AppUser> {
    const user = this.findByUsername(username.trim().toLowerCase());
    if (!user) throw new AuthError('INVALID');
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) throw new AuthError('LOCKED', user.lockedUntil);

    if (!(await verifyPassword(password, user.passwordHash, user.username))) {
      const current = this.find(user.id);
      const failed = current.failedLogins + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        this.replace({ ...current, failedLogins: 0, lockedUntil });
        throw new AuthError('LOCKED', lockedUntil);
      }
      this.replace({ ...current, failedLogins: failed });
      throw new AuthError('INVALID');
    }
    if (!user.active) throw new AuthError('INACTIVE');

    const passwordHash = needsRehash(user.passwordHash) ? await hashPassword(password) : user.passwordHash;
    const next: StoredUser = { ...this.find(user.id), passwordHash, failedLogins: 0, lockedUntil: null };
    this.replace(next);
    return toAppUser(next);
  }

  /** The account's own password change; it also clears the must-change flag of a new or reset account. */
  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<AppUser> {
    const user = this.find(id);
    if (!user.active) throw new AuthError('INACTIVE');
    if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AuthError('WEAK_PASSWORD');
    if (newPassword === currentPassword) throw new AuthError('SAME_PASSWORD');
    if (!(await verifyPassword(currentPassword, user.passwordHash, user.username))) throw new AuthError('WRONG_PASSWORD');

    const next: StoredUser = {
      ...this.find(id),
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };
    this.replace(next);
    return toAppUser(next);
  }

  /** The stored, active account behind an actor, so a stale or forged role in the caller's copy counts for nothing. */
  private actorOf(actor: Actor): StoredUser {
    const user = this.stored().find((u) => u.id === actor.id);
    if (!user?.active) throw new AuthError('FORBIDDEN');
    return user;
  }

  private find(id: string): StoredUser {
    const user = this.stored().find((u) => u.id === id);
    if (!user) throw new AuthError('NOT_FOUND');
    return user;
  }

  private findByUsername(username: string): StoredUser | undefined {
    return this.stored().find((u) => u.username === username);
  }

  /** The saved accounts, or the seed (saved at once) when this browser has none. */
  private load(): StoredUser[] {
    const saved = this.storage.get<StoredUser[]>(STORAGE_KEY);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    const seeded = this.seeds.map(fromSeed);
    this.storage.set(STORAGE_KEY, seeded);
    return seeded;
  }

  private replace(user: StoredUser): void {
    this.write(this.stored().map((u) => (u.id === user.id ? user : u)));
  }

  private write(users: StoredUser[]): void {
    this.stored.set(users);
    this.storage.set(STORAGE_KEY, users);
  }
}
