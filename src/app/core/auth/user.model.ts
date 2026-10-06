export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  USER: 'User',
};

/** Tailwind classes of the small role badge (toolbar, user management). */
export const ROLE_BADGE_CLASS: Record<Role, string> = {
  SUPER_ADMIN: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  ADMIN: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  USER: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

/** An account as UserStore keeps it, secrets included. */
export interface StoredUser {
  id: string;
  /** Kept in lower case; sign-in ignores case. */
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  /** Set on a new account and after a reset: the next sign-in must pick a new password first. */
  mustChangePassword: boolean;
  /** `pbkdf2$<iterations>$<salt b64>$<hash b64>`, or `sha256$<hex of username:password>` for the seeded accounts. */
  passwordHash: string;
  failedLogins: number;
  /** ISO time until which sign-in is refused after too many wrong passwords. */
  lockedUntil: string | null;
  /** Raised when the account is deactivated or its password reset, which ends every session made before. */
  sessionVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An account as the rest of the app sees it. */
export type AppUser = Omit<StoredUser, 'passwordHash' | 'failedLogins' | 'lockedUntil'>;

/** An account created when the store is empty (see SEED_USERS in auth.config.ts). */
export interface SeedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
  /** The password itself, only for the develop accounts, so the login page can list them. */
  devPassword?: string;
}

export type AuthErrorCode =
  | 'INVALID'
  | 'LOCKED'
  | 'INACTIVE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'INVALID_USERNAME'
  | 'DISPLAY_NAME_REQUIRED'
  | 'LAST_SUPER_ADMIN'
  | 'WRONG_PASSWORD'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD';

/** Why a UserStore call was refused; `lockedUntil` comes with LOCKED. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly lockedUntil?: string,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

/** The Thai message shown for an AuthError. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof AuthError)) return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  switch (error.code) {
    case 'INVALID':
      return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    case 'LOCKED': {
      const until = error.lockedUntil ? new Date(error.lockedUntil) : null;
      const time = until ? ` ลองใหม่ได้หลัง ${until.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : '';
      return `บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง${time}`;
    }
    case 'INACTIVE':
      return 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    case 'FORBIDDEN':
      return 'คุณไม่มีสิทธิ์ทำรายการนี้';
    case 'NOT_FOUND':
      return 'ไม่พบบัญชีผู้ใช้นี้';
    case 'USERNAME_TAKEN':
      return 'ชื่อผู้ใช้นี้มีอยู่แล้ว';
    case 'INVALID_USERNAME':
      return 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3–32 ตัวอักษร';
    case 'DISPLAY_NAME_REQUIRED':
      return 'กรุณาใส่ชื่อที่แสดง';
    case 'LAST_SUPER_ADMIN':
      return 'ต้องมี Super Admin ที่ใช้งานอยู่อย่างน้อย 1 คน';
    case 'WRONG_PASSWORD':
      return 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
    case 'WEAK_PASSWORD':
      return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร';
    case 'SAME_PASSWORD':
      return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
  }
}
