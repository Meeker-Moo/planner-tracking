import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { AppUser, ROLE_LABELS, Role } from '../../core/auth/user.model';
import { NewUserInput } from '../../core/auth/user-store.service';

/** Add an account, or rename / change the role of one. The username is fixed once the account exists. */
@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <form
          role="dialog"
          aria-modal="true"
          class="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          (submit)="onSave($event)"
        >
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span class="text-lg font-bold text-slate-900">{{ editing() ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่' }}</span>
            <button type="button" aria-label="ปิด" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 text-base" (click)="cancel.emit()">×</button>
          </div>

          <div class="p-6 flex flex-col gap-4 overflow-y-auto">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อผู้ใช้ (สำหรับเข้าสู่ระบบ)</span>
              <input
                type="text"
                name="username"
                autocomplete="off"
                placeholder="เช่น somchai.k"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                [disabled]="!!editing()"
                [value]="username()"
                (input)="username.set($any($event.target).value)"
              />
              @if (!editing()) {
                <span class="text-xs text-slate-500">ภาษาอังกฤษตัวเล็ก ตัวเลข หรือ . _ - ยาว 3–32 ตัวอักษร เปลี่ยนภายหลังไม่ได้</span>
              }
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อที่แสดง</span>
              <input
                type="text"
                name="displayName"
                placeholder="เช่น สมชาย ใจดี"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                [value]="displayName()"
                (input)="displayName.set($any($event.target).value)"
              />
            </label>

            <div class="flex flex-col gap-1.5">
              <span id="user-role-label" class="text-sm font-semibold text-slate-700">บทบาท (Role)</span>
              <div role="radiogroup" aria-labelledby="user-role-label" class="flex flex-col gap-2">
                @for (r of roles(); track r) {
                  <button
                    type="button"
                    role="radio"
                    class="flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition"
                    [class]="role() === r ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'"
                    [attr.aria-checked]="role() === r"
                    (click)="role.set(r)"
                  >
                    <span
                      class="mt-0.5 w-4 h-4 shrink-0 rounded-full border-2"
                      [class]="role() === r ? 'border-blue-600 bg-blue-600 ring-2 ring-inset ring-white' : 'border-slate-300'"
                    ></span>
                    <span class="flex flex-col">
                      <span class="text-sm font-semibold text-slate-800">{{ roleLabels[r] }}</span>
                      <span class="text-xs text-slate-500">{{ roleHints[r] }}</span>
                    </span>
                  </button>
                }
              </div>
            </div>

            @if (!editing()) {
              <p class="text-xs text-slate-600 bg-slate-50 rounded-xl px-3 py-2">
                ระบบจะสร้างรหัสผ่านชั่วคราวให้หลังบันทึก และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
              </p>
            }

            @if (error()) {
              <p role="alert" class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ error() }}</p>
            }
          </div>

          <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="cancel.emit()">
              ยกเลิก
            </button>
            <button
              type="submit"
              class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-40"
              [disabled]="busy() || !username().trim() || !displayName().trim()"
            >
              {{ busy() ? 'กำลังบันทึก…' : editing() ? 'บันทึก' : 'สร้างผู้ใช้' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class UserFormDialog {
  open = input(false);
  /** The account being edited; null when adding one. */
  editing = input<AppUser | null>(null);
  /** The roles the signed-in account may give (assignableRoles). */
  roles = input<Role[]>([]);
  busy = input(false);
  error = input('');

  save = output<NewUserInput>();
  cancel = output<void>();

  readonly roleLabels = ROLE_LABELS;
  readonly roleHints: Record<Role, string> = {
    SUPER_ADMIN: 'จัดการบัญชีได้ทุกบัญชีรวมถึง Admin ใช้ได้เฉพาะหน้าจัดการผู้ใช้',
    ADMIN: 'จัดการบัญชี User ได้ และเห็น/แก้ไขโครงการและ Event ของทุกคน',
    USER: 'เห็นและแก้ไขเฉพาะโครงการและ Event ที่ตัวเองสร้างหรือได้รับมอบหมาย',
  };

  username = signal('');
  displayName = signal('');
  role = signal<Role>('USER');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const u = this.editing();
      this.username.set(u?.username ?? '');
      this.displayName.set(u?.displayName ?? '');
      this.role.set(u?.role ?? (this.roles().includes('USER') ? 'USER' : this.roles()[0] ?? 'USER'));
    });
  }

  onSave(event: Event): void {
    event.preventDefault();
    if (this.busy() || !this.username().trim() || !this.displayName().trim()) return;
    this.save.emit({ username: this.username(), displayName: this.displayName(), role: this.role() });
  }
}
