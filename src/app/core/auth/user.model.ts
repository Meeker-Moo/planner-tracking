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

/** An account as the API sends it (no password hash or sign-in counters). */
export interface AppUser {
  id: string;
  /** Kept in lower case; sign-in ignores case. */
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  /** Set on a new account and after a reset: the next sign-in must pick a new password first. */
  mustChangePassword: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What every signed-in account may know about another: enough to show its name and pick it as responsible. */
export type DirectoryUser = Pick<AppUser, 'id' | 'displayName' | 'role' | 'active'>;

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
  | 'SAME_PASSWORD'
  // From the API itself rather than a rule about accounts:
  | 'UNAUTHENTICATED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'NETWORK';

/** Why an API call was refused (the `code` of its error body); `lockedUntil` comes with LOCKED. */
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
    case 'UNAUTHENTICATED':
      return 'กรุณาเข้าสู่ระบบอีกครั้ง';
    case 'PASSWORD_CHANGE_REQUIRED':
      return 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน';
    case 'CONFLICT':
      return 'มีคนแก้ไขข้อมูลนี้ก่อนหน้า ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาทำรายการอีกครั้ง';
    case 'BAD_REQUEST':
      return 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่';
    case 'SERVER_ERROR':
      return 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง';
    case 'NETWORK':
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  }
}
