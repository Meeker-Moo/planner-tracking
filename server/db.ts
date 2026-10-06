import { Role } from '../src/app/core/auth/user.model';

/** A `users` row as D1 returns it. */
export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  must_change_password: number;
  active: number;
  failed_logins: number;
  locked_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** An account as the API sends it: no password hash or sign-in counters. */
export interface ApiUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toApiUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** What everyone signed in may know about an account: enough to show its name and pick it as responsible. */
export interface DirectoryEntry {
  id: string;
  displayName: string;
  role: Role;
  active: boolean;
}

export type Directory = Map<string, DirectoryEntry>;

export async function loadDirectory(db: D1Database): Promise<Directory> {
  const { results } = await db
    .prepare('SELECT id, display_name, role, active FROM users')
    .all<Pick<UserRow, 'id' | 'display_name' | 'role' | 'active'>>();
  return new Map(results.map((r) => [r.id, { id: r.id, displayName: r.display_name, role: r.role, active: !!r.active }]));
}

export async function findUser(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

/** The `data` JSON of a plans/events row. */
export function parseData<T>(row: { data: string }): T {
  return JSON.parse(row.data) as T;
}
