import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, safeReturnUrl } from '../../core/auth/auth.service';
import { MIN_PASSWORD_LENGTH } from '../../core/auth/password.util';
import { authErrorMessage } from '../../core/auth/user.model';
import { SessionData } from '../../core/services/session-data.service';

/**
 * The signed-in account's own password change: required after a new account or a reset (the one-time
 * password must be replaced before any other page opens), and also reachable from the toolbar's account menu.
 */
@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grow flex flex-col min-h-0' },
  template: `
    <div class="grow overflow-auto flex items-center justify-center p-4 bg-linear-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div class="w-full max-w-sm flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2 text-center">
          <div
            class="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30"
          >
            <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="8" cy="15" r="4" />
              <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <h1 class="text-xl font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h1>
          @if (auth.user(); as user) {
            <p class="text-sm text-slate-500">{{ user.displayName }} ({{ user.username }})</p>
          }
        </div>

        <form class="bg-white rounded-3xl shadow-xl ring-1 ring-slate-900/5 p-6 flex flex-col gap-4" (submit)="submit($event)">
          @if (forced()) {
            <p class="text-xs text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2">
              กรุณาตั้งรหัสผ่านใหม่แทนรหัสผ่านชั่วคราวก่อนเริ่มใช้งาน
            </p>
          }

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-semibold text-slate-700">{{ forced() ? 'รหัสผ่านชั่วคราว' : 'รหัสผ่านปัจจุบัน' }}</span>
            <input
              name="current-password"
              autocomplete="current-password"
              autofocus
              class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              [type]="showPassword() ? 'text' : 'password'"
              [value]="current()"
              (input)="current.set($any($event.target).value); error.set('')"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-semibold text-slate-700">รหัสผ่านใหม่</span>
            <input
              name="new-password"
              autocomplete="new-password"
              class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              [type]="showPassword() ? 'text' : 'password'"
              [value]="next()"
              (input)="next.set($any($event.target).value); error.set('')"
            />
            <span class="text-xs" [class]="next() && tooShort() ? 'text-red-600' : 'text-slate-500'">อย่างน้อย {{ minLength }} ตัวอักษร</span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-semibold text-slate-700">ยืนยันรหัสผ่านใหม่</span>
            <input
              name="confirm-password"
              autocomplete="new-password"
              class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              [type]="showPassword() ? 'text' : 'password'"
              [value]="confirm()"
              (input)="confirm.set($any($event.target).value); error.set('')"
            />
            @if (confirm() && mismatch()) {
              <span class="text-xs text-red-600">รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน</span>
            }
          </label>

          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="showPassword()" (change)="showPassword.set($any($event.target).checked)" />
            แสดงรหัสผ่าน
          </label>

          @if (error()) {
            <p role="alert" class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ error() }}</p>
          }

          <button
            type="submit"
            class="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50"
            [disabled]="!canSubmit()"
          >
            {{ busy() ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่' }}
          </button>
        </form>

        @if (forced()) {
          <button type="button" class="text-center text-sm font-semibold text-slate-500 hover:text-slate-800" (click)="logout()">ออกจากระบบ</button>
        } @else {
          <a [routerLink]="backUrl()" class="text-center text-sm font-semibold text-slate-500 hover:text-slate-800">← กลับ</a>
        }
      </div>
    </div>
  `,
})
export class ChangePassword {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly data = inject(SessionData);
  private readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');

  readonly minLength = MIN_PASSWORD_LENGTH;

  current = signal('');
  next = signal('');
  confirm = signal('');
  showPassword = signal(false);
  busy = signal(false);
  error = signal('');

  /** Sent here because the account still has a one-time password. */
  forced = computed(() => !!this.auth.user()?.mustChangePassword);
  tooShort = computed(() => this.next().length < MIN_PASSWORD_LENGTH);
  mismatch = computed(() => this.next() !== this.confirm());
  canSubmit = computed(() => !this.busy() && !!this.current() && !this.tooShort() && !this.mismatch());
  backUrl = computed(() => safeReturnUrl(this.returnUrl, this.auth.homeUrl()));

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.busy.set(true);
    try {
      await this.auth.changePassword(this.current(), this.next());
      await this.data.ready();
      alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      await this.router.navigateByUrl(this.backUrl());
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
